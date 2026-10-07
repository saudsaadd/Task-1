// Vercel serverless function: the platform's AI assistant for visitors. Free of charge.
// POST /api/chat  { lang: "ar" | "en", messages: [{ role, content }] }  → streamed plain text
// GET  /api/chat                                                      → setup status (no secrets)
// Answers come from the Cloudflare Workers AI free allowance, grounded in the JSON files in /data.
// It uses the same variables as the studio (Vercel → Settings → Environment Variables):
//   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
// and the chat model set in data/studio.json (cloud.chatModel, with cloud.fallbackModel as backup).
// Without the variables, or when the day's free allowance is used up, the endpoint answers with an
// error status and the widget falls back to its offline FAQ answers.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_MESSAGES = 16;
const MAX_CHARS = 2000;
const MAX_TOKENS = 900;
const RATE_LIMIT = Number(process.env.CHAT_RATE_LIMIT || 30); // requests per IP per window
const RATE_WINDOW_MS = 10 * 60 * 1000;
const TIME_BUDGET_MS = 55 * 1000;
const CF_API = 'https://api.cloudflare.com/client/v4/accounts/';
// Cloudflare error codes that mean "this model can't be used here": retry once on the fallback model.
const MODEL_ERRORS = new Set([5007, 3042, 5035, 5018, 3041, 5016]);

let systemPrompt;
let studioConfig;
const hits = new Map();

const pick = (v, lang = 'en') => (v && typeof v === 'object' ? v[lang] || v.en || v.ar || '' : String(v ?? ''));
const both = (v) => (v && typeof v === 'object' ? `${v.en || ''} / ${v.ar || ''}` : String(v ?? ''));

async function readData(file) {
  return JSON.parse(await readFile(path.join(process.cwd(), 'data', file), 'utf8'));
}

/* ------------------------------------------------- Cloudflare credentials */
// Values pasted into Vercel often carry spaces, line breaks or quotes; strip them.
const clean = (v) => String(v || '').trim().replace(/^["']|["']$/g, '').trim();

function cloudSetup() {
  const account = clean(process.env.CLOUDFLARE_ACCOUNT_ID);
  const token = clean(process.env.CLOUDFLARE_API_TOKEN);
  const missing = [];
  const problems = [];
  if (!account) missing.push('CLOUDFLARE_ACCOUNT_ID');
  else if (!/^[0-9a-f]{32}$/i.test(account)) problems.push('account_id_format');
  if (!token) missing.push('CLOUDFLARE_API_TOKEN');
  else if (/^[0-9a-f]{37}$/i.test(token)) problems.push('global_api_key');
  else if (/\s/.test(token)) problems.push('token_whitespace');
  return { account, token, missing, problems, ready: !missing.length && !problems.length };
}

async function chatConfig() {
  studioConfig ??= await readData('studio.json').catch(() => ({}));
  const cloud = studioConfig.cloud || {};
  return {
    model: clean(process.env.CHAT_MODEL) || cloud.chatModel || '@cf/google/gemma-4-26b-a4b-it',
    extra: process.env.CHAT_MODEL ? {} : cloud.extra || {},
    fallback: cloud.fallbackModel || '',
    fallbackExtra: cloud.fallbackExtra || {}
  };
}

async function cfError(res) {
  const text = await res.text().catch(() => '');
  let code = 0;
  let detail = text.slice(0, 300);
  try {
    const body = JSON.parse(text);
    const first = body?.errors?.[0] || body?.error;
    code = Number(first?.code) || 0;
    detail = String(first?.message || (typeof body?.error === 'string' ? body.error : '') || detail).slice(0, 300);
  } catch { /* not JSON */ }
  return { status: res.status, code, detail };
}

/** Starts a streamed chat completion, moving to the fallback model if Cloudflare rejects the main one. */
async function startCompletion(setup, messages, signal) {
  const cfg = await chatConfig();
  const attempts = [[cfg.model, cfg.extra], ...(cfg.fallback && cfg.fallback !== cfg.model ? [[cfg.fallback, cfg.fallbackExtra]] : [])];
  let failure = null;
  for (const [model, extra] of attempts) {
    const res = await fetch(`${CF_API}${encodeURIComponent(setup.account)}/ai/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${setup.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, max_tokens: MAX_TOKENS, ...extra }),
      signal
    });
    if (res.ok) return { res };
    failure = await cfError(res);
    console.error('[api/chat]', model, failure.status, failure.code, failure.detail);
    if (!MODEL_ERRORS.has(failure.code)) break;
  }
  return { failure };
}

function errorFor(failure) {
  if (failure.code === 3036) return [429, 'quota_exhausted'];
  if (failure.code === 3040 || failure.status === 429) return [429, 'rate_limited'];
  if (MODEL_ERRORS.has(failure.code)) return [502, 'model_unavailable'];
  if (failure.code === 7003 || failure.code === 7000) return [502, 'bad_account_id'];
  if (failure.status === 401 || failure.status === 403) return [502, 'bad_token'];
  return [502, 'assistant_unavailable'];
}

/** Removes <think>…</think> blocks from streamed text, even when a block opens and closes inside one chunk. */
function stripThinkStream(state, text) {
  let out = '';
  while (text) {
    if (state.inThink) {
      const end = text.indexOf('</think>');
      if (end < 0) return out;
      state.inThink = false;
      text = text.slice(end + 8);
    } else {
      const start = text.indexOf('<think>');
      if (start < 0) { out += text; break; }
      out += text.slice(0, start);
      state.inThink = true;
      text = text.slice(start + 7);
    }
  }
  // Skip the blank lines models put between their reasoning and the answer.
  if (!state.started) { out = out.replace(/^\s+/, ''); if (out) state.started = true; }
  return out;
}

function deltaText(event) {
  const choice = event?.choices?.[0];
  if (typeof choice?.delta?.content === 'string') return choice.delta.content;
  if (typeof event?.response === 'string') return event.response;
  return '';
}

async function buildSystemPrompt() {
  if (systemPrompt) return systemPrompt;
  const [site, courses, faq, plans, quizzes] = await Promise.all(
    ['site.json', 'courses.json', 'faq.json', 'plans.json', 'quizzes.json'].map(readData)
  );
  const currency = site.payments?.currency || 'SAR';
  const courseText = courses.courses.map((c) => [
    `## ${both(c.title)} (id: ${c.id})`,
    `Page: course.html?id=${c.id} | Category: ${c.category} | Level: ${c.level} | ${c.hours} hours | Price: ${c.price ? `${c.price} ${currency}` : 'free'} | Rating ${c.rating}`,
    `Instructor: ${both(c.instructor?.name)}, ${pick(c.instructor?.title)}`,
    `About: ${pick(c.description)}`,
    `Outcomes: ${(c.outcomes || []).map((o) => pick(o)).join('; ')}`,
    `Lessons: ${c.lessons.map((l) => `${pick(l.title)} [${l.type}${l.startsAt ? ` at ${l.startsAt}` : ''}, ${l.duration} min]`).join('; ')}`
  ].join('\n')).join('\n\n');

  const quizText = quizzes.quizzes.map((q) => `- ${pick(q.title)} (course ${q.courseId}): ${q.questions.length} questions, pass mark ${q.passMark}%, ${q.timeLimit ? `${q.timeLimit} min limit` : 'no time limit'}, mode ${q.mode}. Page: quiz.html?id=${q.id}`).join('\n');
  const planText = plans.plans.map((p) => `- ${both(p.name)}: ${p.price.monthly} ${currency}/month or ${p.price.yearly} ${currency}/year. ${pick(p.description)} Includes: ${p.features.map((f) => pick(f)).join('; ')}`).join('\n');
  const faqText = faq.items.map((f) => `Q: ${pick(f.q)}\nA: ${pick(f.a)}`).join('\n\n');
  const c = site.contact || {};

  systemPrompt = `You are "${pick(site.assistant?.name)}", the AI learning assistant of ${both(site.brand.name)}, an online training platform.
You help trainees choose courses, understand lessons and concepts from the curriculum, prepare for quizzes, and use the platform (live sessions, certificates, plans, payments).

How to answer:
- Reply in the language of the trainee's latest message (Arabic or English). Arabic answers use clear Modern Standard Arabic.
- Latency-sensitive; begin your visible answer immediately. Keep answers short and practical: a few sentences or a short list.
- Use simple Markdown only: **bold**, short "-" lists and links like [Course name](course.html?id=...). Link to platform pages from the catalogue below when helpful (courses.html, pricing.html, dashboard.html, contact.html, certificate.html).
- Only state prices, dates, durations and policies that appear below. If you don't know, say so and point to the contact page.
- When a trainee asks for quiz answers, help them understand the concept instead of giving the answer.
- For account, payment or technical problems you cannot see, direct them to ${c.email || 'the contact page'} or contact.html.
- You can explain general knowledge related to the course topics (design, web development, data, AI, marketing, project management).

# Platform
${pick(site.brand.description)}
Certificates: issued after completing every lesson of a course and passing its final quiz; printable as PDF and shareable on LinkedIn.
Support: email ${c.email || '-'}, phone ${c.phone || '-'}, hours ${pick(c.hours)}.
Payment: ${currency}, VAT ${Math.round((site.payments?.vatRate || 0) * 100)}% added at checkout. Methods: ${(site.payments?.methods || []).map((m) => pick(m.label)).join(', ')}.

# Plans
${planText}
${pick(plans.guarantee)}

# Courses
${courseText}

# Quizzes
${quizText}

# FAQ
${faqText}`;
  return systemPrompt;
}

function cleanMessages(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const m of input.slice(-MAX_MESSAGES)) {
    const role = m?.role === 'assistant' ? 'assistant' : m?.role === 'user' ? 'user' : null;
    const content = typeof m?.content === 'string' ? m.content.trim().slice(0, MAX_CHARS) : '';
    if (!role || !content) continue;
    const prev = out.at(-1);
    if (prev && prev.role === role) prev.content += `\n\n${content}`;
    else out.push({ role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out.at(-1)?.role === 'user' ? out : [];
}

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.reset) { hits.set(ip, { count: 1, reset: now + RATE_WINDOW_MS }); return false; }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

function originAllowed(req) {
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowed.length) return true;
  return allowed.includes(req.headers.origin || '');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const setup = cloudSetup();
  if (req.method === 'GET') {
    const cfg = await chatConfig();
    return res.status(200).json({ ready: setup.ready, missing: setup.missing, problems: setup.problems, model: cfg.model, fallbackModel: cfg.fallback || null });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!setup.ready) return res.status(503).json({ error: 'assistant_not_configured', missing: setup.missing, problems: setup.problems });
  if (!originAllowed(req)) return res.status(403).json({ error: 'origin_not_allowed' });

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) return res.status(429).json({ error: 'rate_limited' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const messages = cleanMessages(body?.messages);
  if (!messages.length) return res.status(400).json({ error: 'invalid_messages' });

  const system = await buildSystemPrompt();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIME_BUDGET_MS);
  // Headers go out with the first token, so a failed request can still answer with an error status.
  const open = () => {
    if (res.headersSent) return;
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  };

  try {
    const { res: upstream, failure } = await startCompletion(setup, [{ role: 'system', content: system }, ...messages], controller.signal);
    if (failure) {
      const [status, error] = errorFor(failure);
      return res.status(status).json({ error, code: failure.code || undefined });
    }
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const think = { inThink: false, started: false };
    let finish = null;
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
        const text = stripThinkStream(think, deltaText(event));
        if (text) { open(); res.write(text); }
      }
    }
    open();
    if (finish === 'length') res.write('…');
    res.end();
  } catch (err) {
    if (timedOut && res.headersSent) { res.write('…'); return res.end(); }
    console.error('[api/chat]', err?.message);
    if (!res.headersSent) return res.status(502).json({ error: 'assistant_unavailable' });
    res.end();
  } finally {
    clearTimeout(timer);
  }
}
