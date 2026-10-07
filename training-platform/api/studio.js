// Vercel serverless function: the owner studio (studio.html). Free of charge.
// Cloud text and images run on the Cloudflare Workers AI free allowance
// (10,000 neurons a day, no credit card, renewed at 00:00 UTC). Local text and
// video assembly happen in the browser and never reach this function.
//
// One endpoint, routed by ?action=
//   POST ?action=login    { password }                       → { token, expiresAt, features }
//   GET  ?action=session                                     → { features }
//   POST ?action=chat     { messages: [{ role, content }] }  → streamed plain text
//   POST ?action=enhance  { prompt, kind: "image" | "video" }→ { prompt }
//   POST ?action=image    { model, prompt, ratio, seed? }    → { image (base64), mime, width, height }
// Every action except login needs "Authorization: Bearer <token>".
//
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   ADMIN_PASSWORD          required, at least 12 characters: the studio password
//   CLOUDFLARE_ACCOUNT_ID   Cloudflare account id (free account)
//   CLOUDFLARE_API_TOKEN    API token created from the "Workers AI" template
// The cloud models the studio may call are listed in data/studio.json.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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
const MAX_PROMPT_CHARS = 2000;
const CF_API = 'https://api.cloudflare.com/client/v4/accounts/';
const MODEL_RE = /^@cf\/[a-z0-9-]+\/[a-z0-9.-]+$/i;

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
const cloudReady = () => !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
const features = () => ({ cloud: cloudReady() });

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

/* -------------------------------------------------------- Cloudflare calls */
function cfFetch(pathname, init = {}) {
  return fetch(`${CF_API}${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)}/ai/${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, ...(init.headers || {}) }
  });
}

// Workers AI answers errors either as { errors: [{ code, message }] } or { error: … }.
async function cfError(res) {
  const text = await res.text().catch(() => '');
  let detail = text.slice(0, 400);
  let code = 0;
  try {
    const body = JSON.parse(text);
    const first = body?.errors?.[0] || body?.error;
    code = Number(first?.code) || 0;
    detail = String(first?.message || (typeof body?.error === 'string' ? body.error : '') || detail).slice(0, 400);
  } catch { /* not JSON */ }
  const quota = code === 3036 || /daily free allocation|neurons/i.test(detail);
  const error = quota ? 'quota_exhausted'
    : res.status === 401 || res.status === 403 ? 'provider_auth'
      : res.status === 429 ? 'rate_limited'
        : res.status === 400 || res.status === 422 ? 'provider_rejected' : 'provider_unavailable';
  const status = error === 'quota_exhausted' || error === 'rate_limited' ? 429 : error === 'provider_rejected' ? 400 : 502;
  return { status, error, detail };
}

async function buildChatSystem() {
  if (chatSystem) return chatSystem;
  const [site, catalog] = await Promise.all([readData('site.json'), readData('courses.json')]);
  const theme = site.theme || {};
  const courses = catalog.courses.map((c) => `- ${pick(c.title, 'en')} / ${pick(c.title, 'ar')} (id: ${c.id}, ${c.level}, ${c.lessons.length} lessons)`).join('\n');
  chatSystem = `You are the content studio assistant for AGILIX, an Arabic/English online training platform. You work with the platform's owner on course material and media: course outlines and descriptions, lesson video scripts, quiz questions, marketing copy, social posts and prompts for image generation.

Brand rules:
- The name is always written "AGILIX" in Latin capitals, in Arabic text too. Never translate or transliterate it.
- Tagline: "${pick(site.brand?.tagline, 'ar')}" / "${pick(site.brand?.tagline, 'en')}".
- Colours: primary ${theme.primary || '#2E5BFF'}, teal ${theme.secondary || '#14B8C4'}, coral ${theme.highlight || '#FF6B3D'}, ink ${theme.ink || '#0E1630'}. Visual style: light, clean, modern, glass and soft gradients.

How to answer:
- Reply in the language of the owner's latest message. Arabic replies use clear Modern Standard Arabic.
- Give complete, ready-to-use output. Use Markdown headings, lists and tables where they help.
- Image prompts are written in English, as one paragraph covering subject, setting, composition, lighting and style.
- Quiz questions "for the platform" or "as JSON" go in a fenced JSON block shaped like: {"id":"q1","type":"single"|"multiple"|"truefalse"|"text","points":1,"question":{"ar":"…","en":"…"},"options":[{"ar":"…","en":"…"}],"answer":<index | [indexes] | true/false | ["accepted text"]>,"explanation":{"ar":"…","en":"…"}}.

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

/** Text of one streamed event, in either the OpenAI chunk shape or the classic Workers AI one. */
function deltaText(event) {
  const choice = event?.choices?.[0];
  if (typeof choice?.delta?.content === 'string') return choice.delta.content;
  if (typeof event?.response === 'string') return event.response;
  return '';
}

const stripThinking = (text) => text.replace(/<think>[\s\S]*?<\/think>\s*/g, '');

async function chat(req, res, body) {
  if (!cloudReady()) return json(res, 503, { error: 'cloud_not_configured' });
  const messages = cleanMessages(body.messages);
  if (!messages.length) return json(res, 400, { error: 'invalid_messages' });
  const cfg = await loadConfig();
  const system = await buildChatSystem();

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIME_BUDGET_MS);
  const open = () => {
    if (res.headersSent) return;
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
  };

  try {
    const upstream = await cfFetch('v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.cloud.chatModel,
        messages: [{ role: 'system', content: system }, ...messages],
        stream: true,
        max_tokens: cfg.cloud.maxTokens || 4096,
        ...(cfg.cloud.extra || {})
      }),
      signal: controller.signal
    });
    if (!upstream.ok) {
      const { status, error, detail } = await cfError(upstream);
      console.error('[api/studio] chat', upstream.status, detail);
      return json(res, status, { error, detail });
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finish = null;
    let inThink = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let event;
        try { event = JSON.parse(payload); } catch { continue; }
        finish = event?.choices?.[0]?.finish_reason || finish;
        let text = deltaText(event);
        // Models that still emit <think> blocks: drop them from the visible answer.
        if (text.includes('<think>')) { inThink = true; text = text.split('<think>')[0]; }
        if (inThink) {
          const end = text.indexOf('</think>');
          if (end < 0) continue;
          inThink = false;
          text = text.slice(end + 8);
        }
        if (text) { open(); res.write(text); }
      }
    }
    open();
    if (finish === 'length') res.write(CUT_MARKER);
    res.end();
  } catch (err) {
    if (timedOut) {
      open();
      res.write(CUT_MARKER);
      return res.end();
    }
    console.error('[api/studio] chat', err?.message);
    if (!res.headersSent) return json(res, 502, { error: 'provider_unavailable' });
    res.end();
  } finally {
    clearTimeout(timer);
  }
}

async function enhance(req, res, body) {
  if (!cloudReady()) return json(res, 503, { error: 'cloud_not_configured' });
  const kind = body.kind === 'video' ? 'video' : 'image';
  const brief = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, MAX_PROMPT_CHARS) : '';
  if (!brief) return json(res, 400, { error: 'empty_prompt' });
  const cfg = await loadConfig();
  const system = kind === 'video'
    ? 'You turn a short brief (often in Arabic) into one English prompt for an image that will be animated into a short video. Describe the subject, setting, composition, lighting, mood and style. The brand name is always "AGILIX" in Latin letters. Answer with the prompt only: one paragraph, at most 90 words, no title, no quotes around it, no notes.'
    : 'You turn a short brief (often in Arabic) into one English prompt for a text-to-image model. Describe the subject, composition, setting, lighting, colour palette and style. Keep any text that must appear in the image short and in quotes. The brand name is always "AGILIX" in Latin letters. Answer with the prompt only: one paragraph, at most 90 words, no title, no quotes around it, no notes.';
  try {
    const upstream = await cfFetch('v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.cloud.chatModel,
        messages: [{ role: 'system', content: system }, { role: 'user', content: brief }],
        max_tokens: 400,
        ...(cfg.cloud.extra || {})
      }),
      signal: AbortSignal.timeout(45000)
    });
    if (!upstream.ok) {
      const { status, error, detail } = await cfError(upstream);
      return json(res, status, { error, detail });
    }
    const data = await upstream.json();
    const raw = data?.choices?.[0]?.message?.content ?? data?.result?.response ?? data?.response ?? '';
    const prompt = stripThinking(String(raw)).trim().replace(/^["“]|["”]$/g, '');
    if (!prompt) return json(res, 502, { error: 'empty_response' });
    return json(res, 200, { prompt });
  } catch (err) {
    console.error('[api/studio] enhance', err?.message);
    return json(res, 502, { error: 'provider_unavailable' });
  }
}

function imageMime(b64) {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBOR')) return 'image/png';
  if (b64.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

async function image(req, res, body) {
  if (!cloudReady()) return json(res, 503, { error: 'cloud_not_configured' });
  const cfg = await loadConfig();
  const model = (cfg.image || []).find((m) => m.id === body.model);
  if (!model || !MODEL_RE.test(model.id)) return json(res, 400, { error: 'unknown_model' });
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return json(res, 400, { error: 'empty_prompt' });
  if (prompt.length > MAX_PROMPT_CHARS) return json(res, 400, { error: 'prompt_too_long' });
  const ratio = Object.hasOwn(model.sizes, body.ratio) ? body.ratio : Object.keys(model.sizes)[0];
  const [width, height] = model.sizes[ratio];
  const seed = Number.isInteger(body.seed) && body.seed >= 0 && body.seed < 2 ** 31 ? body.seed : null;

  let init;
  if (model.input === 'multipart') {
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('width', String(width));
    form.append('height', String(height));
    if (seed !== null) form.append('seed', String(seed));
    init = { method: 'POST', body: form };
  } else {
    init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, ...(model.params || {}), ...(seed !== null ? { seed } : {}) })
    };
  }

  try {
    const upstream = await cfFetch(`run/${model.id}`, { ...init, signal: AbortSignal.timeout(50000) });
    if (!upstream.ok) {
      const { status, error, detail } = await cfError(upstream);
      console.error('[api/studio] image', upstream.status, detail);
      return json(res, status, { error, detail });
    }
    const data = await upstream.json();
    const b64 = String(data?.result?.image || data?.image || '');
    if (!/^[A-Za-z0-9+/]+=*$/.test(b64) || b64.length < 100) return json(res, 502, { error: 'empty_response' });
    return json(res, 200, { image: b64, mime: imageMime(b64), width, height, model: model.id });
  } catch (err) {
    console.error('[api/studio] image', err?.message);
    return json(res, 502, { error: 'provider_unavailable' });
  }
}

/* ------------------------------------------------------------------ router */
const ROUTES = {
  login: { method: 'POST', auth: false, run: login },
  session: { method: 'GET', run: (req, res) => json(res, 200, { features: features() }) },
  chat: { method: 'POST', run: chat },
  enhance: { method: 'POST', run: enhance },
  image: { method: 'POST', run: image }
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
