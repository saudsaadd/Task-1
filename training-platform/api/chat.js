// Vercel serverless function: the platform's AI assistant.
// POST /api/chat  { lang: "ar" | "en", messages: [{ role, content }] }
// Streams plain-text answers from Claude, grounded in the JSON files in /data.
// Needs the ANTHROPIC_API_KEY environment variable (Vercel → Settings → Environment Variables).
// Without it the endpoint answers 503 and the widget falls back to offline FAQ answers.
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MODEL = process.env.CHAT_MODEL || 'claude-opus-5-5';
const MAX_MESSAGES = 16;
const MAX_CHARS = 2000;
const RATE_LIMIT = Number(process.env.CHAT_RATE_LIMIT || 30); // requests per IP per window
const RATE_WINDOW_MS = 10 * 60 * 1000;

let client;
let systemPrompt;
const hits = new Map();

const pick = (v, lang = 'en') => (v && typeof v === 'object' ? v[lang] || v.en || v.ar || '' : String(v ?? ''));
const both = (v) => (v && typeof v === 'object' ? `${v.en || ''} / ${v.ar || ''}` : String(v ?? ''));

async function readData(file) {
  return JSON.parse(await readFile(path.join(process.cwd(), 'data', file), 'utf8'));
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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'assistant_not_configured' });
  if (!originAllowed(req)) return res.status(403).json({ error: 'origin_not_allowed' });

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) return res.status(429).json({ error: 'rate_limited' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const messages = cleanMessages(body?.messages);
  if (!messages.length) return res.status(400).json({ error: 'invalid_messages' });
  const lang = body?.lang === 'ar' ? 'ar' : 'en';

  client ??= new Anthropic();
  const system = await buildSystemPrompt();

  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages
    });

    // Headers go out with the first token, so a failed request can still answer with an error status.
    const open = () => {
      if (res.headersSent) return;
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no'
      });
    };

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        open();
        res.write(event.delta.text);
      }
    }
    const final = await stream.finalMessage();
    open();
    if (final.stop_reason === 'refusal') {
      res.write(lang === 'ar'
        ? '\n\nعذرًا، لا أستطيع المساعدة في هذا الطلب. يمكنك التواصل مع فريق الدعم من صفحة [تواصل معنا](contact.html).'
        : "\n\nSorry, I can't help with that request. You can reach our support team on the [contact page](contact.html).");
    } else if (final.stop_reason === 'max_tokens') {
      res.write('…');
    }
    res.end();
  } catch (err) {
    const status = err instanceof Anthropic.RateLimitError ? 429
      : err instanceof Anthropic.AuthenticationError ? 503
      : err instanceof Anthropic.APIError ? 502 : 500;
    console.error('[api/chat]', status, err?.message);
    if (!res.headersSent) return res.status(status).json({ error: 'assistant_unavailable' });
    res.end();
  }
}
