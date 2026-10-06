// Vercel serverless function: the admin studio (studio.html). Owner-only.
// One endpoint, routed by ?action=
//   POST ?action=login    { password }                            → { token, expiresAt, features }
//   GET  ?action=session                                          → { features }
//   POST ?action=chat     { messages: [{ role, content }] }       → streamed plain text (Claude)
//   POST ?action=enhance  { prompt, kind: "image" | "video" }     → { prompt }  (Claude rewrites a brief into a model prompt)
//   POST ?action=submit   { kind, model, prompt, options, image } → { job }     (queues a fal.ai generation)
//   POST ?action=status   { job }                                 → { status, position?, media?, error? }
// Every action except login needs "Authorization: Bearer <token>".
//
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   ADMIN_PASSWORD     required, at least 12 characters: the studio password
//   ANTHROPIC_API_KEY  chat and prompt enhancement (Claude)
//   FAL_KEY            image and video generation (https://fal.ai/dashboard/keys)
// The models the studio may call are listed in data/studio.json.
import Anthropic from '@anthropic-ai/sdk';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MODEL = process.env.STUDIO_MODEL || 'claude-opus-5-5';
const MIN_PASSWORD = 12;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const LOGIN_LIMIT = 8; // failed attempts per IP per window
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
// Stop streaming a little before the function's maxDuration (vercel.json) so the
// reply ends cleanly; the studio then offers to continue.
const TIME_BUDGET_MS = Number(process.env.STUDIO_MAX_SECONDS || 55) * 1000;
const CUT_MARKER = '\n\n[[continue]]';
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 20000;
const MAX_PROMPT_CHARS = 4000;
const MAX_IMAGE_URL_CHARS = 2048;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // uploads arrive as data: URIs; Vercel request bodies are capped at 4.5 MB
const FAL_QUEUE = 'https://queue.fal.run/';
const FAL_MODEL_RE = /^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9.-]*)+$/i;
const FAL_REQUEST_RE = /^https:\/\/queue\.fal\.run\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9.-]*)*\/requests\/([0-9a-f][0-9a-f-]{7,63})(\/status)?$/i;
const DATA_IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/]+=*)$/i;

let client;
let config;
let chatSystem;
const failures = new Map();

/* ------------------------------------------------------------------ helpers */
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  return body && typeof body === 'object' ? body : {};
}

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
const pick = (v, lang = 'en') => (v && typeof v === 'object' ? v[lang] || v.en || v.ar || '' : String(v ?? ''));
const features = () => ({ chat: !!process.env.ANTHROPIC_API_KEY, image: !!process.env.FAL_KEY, video: !!process.env.FAL_KEY });

async function readData(file) {
  return JSON.parse(await readFile(path.join(process.cwd(), 'data', file), 'utf8'));
}

async function loadConfig() {
  config ??= await readData('studio.json');
  return config;
}

/* --------------------------------------------------------------------- auth */
// Tokens are "<payload>.<signature>", signed with a key derived from ADMIN_PASSWORD,
// so changing the password signs everyone out.
const signingKey = () => createHmac('sha256', 'agilix-studio-token').update(process.env.ADMIN_PASSWORD).digest();
const sign = (payload) => createHmac('sha256', signingKey()).update(payload).digest('base64url');

function issueToken() {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt })).toString('base64url');
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function authorized(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m || !safeEqual(sign(m[1]), m[2])) return false;
  try { return JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')).exp > Date.now(); } catch { return false; }
}

function passwordMatches(input) {
  const digest = (s) => createHmac('sha256', 'agilix-studio-compare').update(String(s)).digest();
  return timingSafeEqual(digest(input ?? ''), digest(process.env.ADMIN_PASSWORD));
}

function tooManyFailures(ip) {
  const entry = failures.get(ip);
  if (!entry || Date.now() > entry.reset) { failures.delete(ip); return false; }
  return entry.count >= LOGIN_LIMIT;
}

function recordFailure(ip) {
  const now = Date.now();
  const entry = failures.get(ip);
  if (!entry || now > entry.reset) failures.set(ip, { count: 1, reset: now + LOGIN_WINDOW_MS });
  else entry.count += 1;
}

async function login(req, res, body) {
  const ip = clientIp(req);
  if (tooManyFailures(ip)) return json(res, 429, { error: 'too_many_attempts' });
  if (!passwordMatches(body.password)) {
    recordFailure(ip);
    await new Promise((r) => setTimeout(r, 700));
    return json(res, 401, { error: 'wrong_password' });
  }
  failures.delete(ip);
  return json(res, 200, { ...issueToken(), features: features() });
}

/* ------------------------------------------------------------------- Claude */
function anthropicStatus(err) {
  if (err instanceof Anthropic.RateLimitError) return [429, 'rate_limited'];
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return [502, 'provider_auth'];
  if (err instanceof Anthropic.BadRequestError) return [400, 'provider_rejected'];
  if (err instanceof Anthropic.APIError) return [502, 'provider_unavailable'];
  return [500, 'server_error'];
}

async function buildChatSystem() {
  if (chatSystem) return chatSystem;
  const [site, catalog] = await Promise.all([readData('site.json'), readData('courses.json')]);
  const theme = site.theme || {};
  const courses = catalog.courses.map((c) => `- ${pick(c.title, 'en')} / ${pick(c.title, 'ar')} (id: ${c.id}, ${c.level}, ${c.lessons.length} lessons): ${c.lessons.map((l) => pick(l.title, 'en')).join('; ')}`).join('\n');
  chatSystem = `You are the content studio assistant for AGILIX, an Arabic/English online training platform. You work with the platform's owner, who uses you to produce course material and media.

Typical work: course outlines and descriptions, lesson video scripts (with scene and on-screen text notes), quiz questions, marketing copy, social posts, emails, and prompts for image and video generation models.

Brand rules:
- The name is always written "AGILIX" in Latin capitals, in Arabic text too. Never translate or transliterate it (never write أجيليكس unless the owner asks for the Arabic wordmark itself).
- Tagline: "${pick(site.brand?.tagline, 'ar')}" / "${pick(site.brand?.tagline, 'en')}".
- Colours: primary ${theme.primary || '#2E5BFF'}, teal ${theme.secondary || '#14B8C4'}, coral ${theme.highlight || '#FF6B3D'}, ink ${theme.ink || '#0E1630'}, light background ${theme.background || '#F6F7FB'}. Visual style: light, clean, modern, glass and soft gradients.

How to answer:
- Reply in the language of the owner's latest message. Arabic replies use clear Modern Standard Arabic.
- Give complete, ready-to-use output. Use Markdown headings, lists and tables where they help.
- When asked for an image or video prompt, write it in English (the generation models follow English best), as one paragraph covering subject, setting, composition, camera, lighting and style. Keep any on-screen text short and quoted.
- When asked for quiz questions or lessons "for the platform" or "as JSON", output JSON in a fenced block that matches the platform's data files:
  - Question (data/quizzes.json → quizzes[].questions[]): {"id":"q1","type":"single"|"multiple"|"truefalse"|"text","points":1,"question":{"ar":"…","en":"…"},"options":[{"ar":"…","en":"…"}],"answer":<index | [indexes] | true/false | ["accepted text", …]>,"explanation":{"ar":"…","en":"…"}}. truefalse and text questions have no options.
  - Lesson (data/courses.json → courses[].lessons[]): {"id":"…","type":"video"|"live"|"reading","duration":<minutes>,"title":{"ar":"…","en":"…"},"summary":{"ar":"…","en":"…"},"videoUrl":"…"}.
- Generated images can be used as a course "cover" in data/courses.json, and generated videos as a lesson "videoUrl"; mention this when relevant.

Current catalogue:
${courses}`;
  return chatSystem;
}

function cleanMessages(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const m of input.slice(-MAX_MESSAGES)) {
    const role = m?.role === 'assistant' ? 'assistant' : m?.role === 'user' ? 'user' : null;
    const content = typeof m?.content === 'string' ? m.content.trim().slice(0, MAX_MESSAGE_CHARS) : '';
    if (!role || !content) continue;
    const prev = out.at(-1);
    if (prev && prev.role === role) prev.content += `\n\n${content}`;
    else out.push({ role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out.at(-1)?.role === 'user' ? out : [];
}

async function chat(req, res, body) {
  if (!process.env.ANTHROPIC_API_KEY) return json(res, 503, { error: 'chat_not_configured' });
  const messages = cleanMessages(body.messages);
  if (!messages.length) return json(res, 400, { error: 'invalid_messages' });

  client ??= new Anthropic();
  const system = await buildChatSystem();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages
  });

  // Headers go out with the first token, so a failed request can still answer with an error status.
  const open = () => {
    if (res.headersSent) return;
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
  };
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; stream.abort(); }, TIME_BUDGET_MS);

  try {
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        open();
        res.write(event.delta.text);
      }
    }
    const final = await stream.finalMessage();
    open();
    if (final.stop_reason === 'refusal') res.write('\n\n[[refused]]');
    else if (final.stop_reason === 'max_tokens') res.write(CUT_MARKER);
    res.end();
  } catch (err) {
    if (timedOut) {
      open();
      res.write(CUT_MARKER);
      return res.end();
    }
    const [status, code] = anthropicStatus(err);
    console.error('[api/studio] chat', status, err?.message);
    if (!res.headersSent) return json(res, status, { error: code });
    res.end();
  } finally {
    clearTimeout(timer);
  }
}

async function enhance(req, res, body) {
  if (!process.env.ANTHROPIC_API_KEY) return json(res, 503, { error: 'chat_not_configured' });
  const kind = body.kind === 'video' ? 'video' : 'image';
  const brief = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, MAX_PROMPT_CHARS) : '';
  if (!brief) return json(res, 400, { error: 'empty_prompt' });

  client ??= new Anthropic();
  const system = kind === 'video'
    ? 'You turn a short brief (often in Arabic) into one English prompt for a text-to-video model that makes clips of up to 8 seconds with sound. Describe the subject and action, setting, camera movement, lighting, mood and style, and the sound or a short spoken line if the brief implies one. Keep any on-screen text short and in quotes. The brand name is always "AGILIX" in Latin letters. Answer with the prompt only: one paragraph, at most 120 words, no title, no quotes around it, no notes.'
    : 'You turn a short brief (often in Arabic) into one English prompt for a text-to-image model. Describe the subject, composition, setting, lighting, colour palette and style. Keep any text that must appear in the image short and in quotes. The brand name is always "AGILIX" in Latin letters. Answer with the prompt only: one paragraph, at most 100 words, no title, no quotes around it, no notes.';
  try {
    const message = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content: brief }]
    });
    if (message.stop_reason === 'refusal') return json(res, 422, { error: 'refused' });
    const prompt = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!prompt) return json(res, 502, { error: 'empty_response' });
    return json(res, 200, { prompt });
  } catch (err) {
    const [status, code] = anthropicStatus(err);
    console.error('[api/studio] enhance', status, err?.message);
    return json(res, status, { error: code });
  }
}

/* ------------------------------------------------------------------ fal.ai */
async function falFetch(url, init = {}) {
  return fetch(url, {
    ...init,
    headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(25000)
  });
}

async function falError(res) {
  let detail = '';
  try {
    const body = await res.json();
    const d = body?.detail ?? body?.error ?? body?.message;
    detail = Array.isArray(d) ? d.map((x) => [x?.loc?.slice(1).join('.'), x?.msg].filter(Boolean).join(': ')).join('; ') : typeof d === 'string' ? d : JSON.stringify(d ?? '');
  } catch { /* not JSON */ }
  const code = res.status === 401 || res.status === 403 ? 'provider_auth'
    : res.status === 402 ? 'provider_billing'
      : res.status === 422 || res.status === 400 ? 'provider_rejected'
        : res.status === 429 ? 'rate_limited' : 'provider_unavailable';
  return { code, detail: String(detail).slice(0, 500) };
}

function validImage(value) {
  if (typeof value !== 'string') return false;
  if (value.startsWith('https://')) return value.length <= MAX_IMAGE_URL_CHARS && !/\s/.test(value);
  const m = value.match(DATA_IMAGE_RE);
  return !!m && Math.floor(m[2].length * 3 / 4) <= MAX_IMAGE_BYTES;
}

async function submit(req, res, body) {
  if (!process.env.FAL_KEY) return json(res, 503, { error: 'media_not_configured' });
  const kind = body.kind === 'video' ? 'video' : body.kind === 'image' ? 'image' : null;
  if (!kind) return json(res, 400, { error: 'invalid_kind' });
  const cfg = await loadConfig();
  const model = (cfg[kind] || []).find((m) => m.id === body.model);
  if (!model || !FAL_MODEL_RE.test(model.id)) return json(res, 400, { error: 'unknown_model' });

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return json(res, 400, { error: 'empty_prompt' });
  if (prompt.length > MAX_PROMPT_CHARS) return json(res, 400, { error: 'prompt_too_long' });

  const input = { ...(model.defaults || {}), prompt };
  const chosen = body.options && typeof body.options === 'object' ? body.options : {};
  for (const opt of model.options || []) {
    const value = Object.hasOwn(chosen, opt.param) ? chosen[opt.param] : opt.default;
    if (!opt.values.includes(value)) return json(res, 400, { error: 'invalid_option', detail: opt.param });
    input[opt.param] = value;
  }
  if (model.image) {
    if (!validImage(body.image)) return json(res, 400, { error: 'invalid_image' });
    input[model.image.param || 'image_url'] = body.image;
  }

  try {
    const r = await falFetch(FAL_QUEUE + model.id, { method: 'POST', body: JSON.stringify(input) });
    if (!r.ok) {
      const { code, detail } = await falError(r);
      console.error('[api/studio] submit', r.status, detail);
      return json(res, code === 'provider_rejected' ? 400 : 502, { error: code, detail });
    }
    const data = await r.json();
    const statusUrl = String(data.status_url || '');
    const responseUrl = String(data.response_url || '');
    if (!FAL_REQUEST_RE.test(statusUrl) || !FAL_REQUEST_RE.test(responseUrl)) {
      return json(res, 502, { error: 'provider_unavailable', detail: 'unexpected queue response' });
    }
    return json(res, 200, { job: { id: String(data.request_id || statusUrl.match(FAL_REQUEST_RE)[1]), kind, model: model.id, statusUrl, responseUrl } });
  } catch (err) {
    console.error('[api/studio] submit', err?.message);
    return json(res, 502, { error: 'provider_unavailable' });
  }
}

// The job's URLs come back from the browser, so they are checked against the
// fal queue host and request-id shape before the FAL_KEY is sent anywhere.
function jobUrls(job) {
  const statusUrl = String(job?.statusUrl || '');
  const responseUrl = String(job?.responseUrl || '');
  const s = statusUrl.match(FAL_REQUEST_RE);
  const r = responseUrl.match(FAL_REQUEST_RE);
  if (!s || !r || !s[2] || r[2] || s[1] !== r[1]) return null;
  return { statusUrl, responseUrl };
}

function collectMedia(result) {
  const media = [];
  const add = (file, type) => {
    if (file && typeof file.url === 'string' && /^https:\/\//.test(file.url)) {
      media.push({ type, url: file.url, width: file.width || null, height: file.height || null, contentType: file.content_type || null });
    }
  };
  for (const img of Array.isArray(result?.images) ? result.images : []) add(img, 'image');
  add(result?.image, 'image');
  for (const vid of Array.isArray(result?.videos) ? result.videos : []) add(vid, 'video');
  add(result?.video, 'video');
  return media;
}

async function status(req, res, body) {
  if (!process.env.FAL_KEY) return json(res, 503, { error: 'media_not_configured' });
  const urls = jobUrls(body.job);
  if (!urls) return json(res, 400, { error: 'invalid_job' });
  try {
    const r = await falFetch(urls.statusUrl, { method: 'GET' });
    if (!r.ok) {
      const { code, detail } = await falError(r);
      return json(res, r.status === 404 ? 404 : 502, { error: r.status === 404 ? 'job_not_found' : code, detail });
    }
    const s = await r.json();
    if (s.status === 'IN_QUEUE') return json(res, 200, { status: 'queued', position: Number.isFinite(s.queue_position) ? s.queue_position : null });
    if (s.status !== 'COMPLETED') return json(res, 200, { status: 'running' });
    if (s.error) return json(res, 200, { status: 'failed', error: String(s.error).slice(0, 500) });

    const out = await falFetch(urls.responseUrl, { method: 'GET' });
    if (!out.ok) {
      const { detail } = await falError(out);
      return json(res, 200, { status: 'failed', error: detail || `HTTP ${out.status}` });
    }
    const media = collectMedia(await out.json());
    if (!media.length) return json(res, 200, { status: 'failed', error: 'no_media' });
    return json(res, 200, { status: 'done', media });
  } catch (err) {
    console.error('[api/studio] status', err?.message);
    return json(res, 502, { error: 'provider_unavailable' });
  }
}

/* ------------------------------------------------------------------ router */
const ROUTES = {
  login: { method: 'POST', auth: false, run: login },
  session: { method: 'GET', run: (req, res) => json(res, 200, { features: features() }) },
  chat: { method: 'POST', run: chat },
  enhance: { method: 'POST', run: enhance },
  submit: { method: 'POST', run: submit },
  status: { method: 'POST', run: status }
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  const action = new URL(req.url || '/', 'http://localhost').searchParams.get('action') || '';
  const route = Object.hasOwn(ROUTES, action) ? ROUTES[action] : null;
  if (!route) return json(res, 404, { error: 'unknown_action' });
  if (req.method !== route.method) {
    res.setHeader('Allow', route.method);
    return json(res, 405, { error: 'method_not_allowed' });
  }
  if ((process.env.ADMIN_PASSWORD || '').length < MIN_PASSWORD) return json(res, 503, { error: 'studio_not_configured' });
  if (route.auth !== false && !authorized(req)) return json(res, 401, { error: 'unauthorized' });
  try {
    await route.run(req, res, readBody(req));
  } catch (err) {
    console.error('[api/studio]', action, err?.message);
    if (!res.headersSent) return json(res, 500, { error: 'server_error' });
    res.end();
  }
}
