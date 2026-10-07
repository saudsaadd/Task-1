// AI assistant widget. Streams answers from the /api/chat serverless function
// (Cloudflare Workers AI, free). When the endpoint is unavailable (not set up, the day's
// free allowance used up, local preview) it answers
// from the platform's own FAQ and course catalogue so the widget always works.
import { app, data, t, tx, esc, icon, safeUrl, fmtPrice, $ } from './app.js';

const HISTORY_KEY = 'academy.chat.v1';
const MAX_TURNS = 12;

let panel, fab, body, form, input, sendBtn, statusEl;
let messages = [];
let busy = false;
let offline = false;

function loadHistory() {
  try { messages = JSON.parse(sessionStorage.getItem(HISTORY_KEY)) || []; } catch { messages = []; }
}
function saveHistory() {
  try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-MAX_TURNS * 2))); } catch { /* ignore */ }
}

/** Tiny, safe markdown: escapes HTML first, then bold, inline code, links and lists. */
function renderMarkdown(text) {
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
      const u = safeUrl(url.replace(/&amp;/g, '&'));
      return u ? `<a href="${esc(u)}"${/^https?:/.test(u) ? ' target="_blank" rel="noopener"' : ''}>${label}</a>` : label;
    });
  const out = [];
  let list = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) { if (list) out.push(`</${list.type}>`); list = { type }; out.push(`<${type}>`); }
      out.push(`<li>${inline((bullet || numbered)[1])}</li>`);
      continue;
    }
    if (list) { out.push(`</${list.type}>`); list = null; }
    if (line.trim()) out.push(`<p>${inline(line.replace(/^#+\s*/, ''))}</p>`);
  }
  if (list) out.push(`</${list.type}>`);
  return out.join('');
}

function bubble(role, html) {
  const el = document.createElement('div');
  el.className = `msg msg--${role === 'user' ? 'user' : 'bot'}`;
  el.innerHTML = html;
  body.append(el);
  body.scrollTop = body.scrollHeight;
  return el;
}

function renderAll() {
  body.innerHTML = '';
  bubble('assistant', renderMarkdown(tx(app.site.assistant.welcome)));
  for (const m of messages) bubble(m.role, m.role === 'user' ? `<p>${esc(m.content)}</p>` : renderMarkdown(m.content) + (m.offline ? `<span class="msg__note">${esc(t('chat.offlineNote'))}</span>` : ''));
  renderSuggestions();
}

function renderSuggestions() {
  const box = $('.chat-suggest', panel);
  const items = messages.length ? [] : app.site.assistant.suggestions || [];
  box.innerHTML = items.map((s) => `<button type="button">${esc(tx(s))}</button>`).join('');
  box.hidden = !items.length;
  box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => send(b.textContent)));
}

function setStatus() {
  statusEl.textContent = offline ? t('chat.offline') : t('chat.online');
  statusEl.classList.toggle('is-offline', offline);
}

/* ------------------------------------------------ offline knowledge base */
const norm = (s) => String(s).toLowerCase()
  .replace(/[ً-ْـ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ');
const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'how', 'what', 'do', 'i', 'can', 'my', 'to', 'of', 'in', 'for', 'and', 'or', 'me', 'you', 'من', 'في', 'على', 'عن', 'هل', 'ما', 'كيف', 'هي', 'هو', 'الى', 'او', 'ان', 'لي', 'مع', 'ماذا', 'متى']);
const words = (s) => norm(s).split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
const stem = (w) => w.replace(/^(ال|وال|بال|لل)/, '').replace(/(ات|ون|ين|ها|s)$/, '');

function overlap(qWords, text) {
  const tw = new Set(words(text).map(stem));
  return qWords.reduce((n, w) => n + (tw.has(stem(w)) ? 1 : 0), 0);
}

async function localAnswer(question) {
  const q = words(question);
  const [faq, courses, plans] = await Promise.all([data.faq(), data.courses(), data.plans()]);
  const both = (v) => (v && typeof v === 'object' ? `${v.ar} ${v.en}` : String(v || ''));

  const faqHit = faq.items
    .map((f) => ({ f, s: overlap(q, both(f.q)) * 2 + overlap(q, both(f.a)) }))
    .sort((a, b) => b.s - a.s)[0];

  const courseHits = courses.courses
    .map((c) => ({ c, s: overlap(q, `${both(c.title)} ${both(c.subtitle)} ${c.category} ${c.level} ${t(`level.${c.level}`)}`) }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);

  const planWords = ['plan', 'plans', 'price', 'pricing', 'subscription', 'cost', 'باقه', 'باقات', 'سعر', 'اسعار', 'اشتراك', 'تكلفه'];
  if (q.some((w) => planWords.includes(w))) {
    const lines = plans.plans.map((p) => `- **${tx(p.name)}**: ${p.price.monthly ? `${fmtPrice(p.price.monthly)} / ${t('pricing.month')}` : t('common.free')} · ${tx(p.description)}`);
    return `${t('chat.local.plans')}\n${lines.join('\n')}\n\n[${t('chat.local.seePricing')}](pricing.html)`;
  }
  const beginnerWords = ['beginner', 'beginners', 'start', 'مبتدي', 'مبتدئ', 'مبتدئين', 'ابدا', 'البدايه'];
  if (q.some((w) => beginnerWords.includes(w))) {
    const list = courses.courses.filter((c) => c.level === 'beginner').map((c) => `- [${tx(c.title)}](course.html?id=${c.id}) · ${fmtPrice(c.price)}`);
    return `${t('chat.local.beginners')}\n${list.join('\n')}`;
  }
  if (faqHit && faqHit.s >= 2) return `**${tx(faqHit.f.q)}**\n${tx(faqHit.f.a)}`;
  if (courseHits.length) {
    return `${t('chat.local.courses')}\n${courseHits.map(({ c }) => `- [${tx(c.title)}](course.html?id=${c.id}): ${tx(c.subtitle)}`).join('\n')}`;
  }
  return t('chat.local.fallback');
}

/* ------------------------------------------------------------------ send */
async function send(text) {
  const content = String(text || '').trim();
  if (!content || busy) return;
  busy = true;
  sendBtn.disabled = true;
  input.value = '';
  autosize();
  messages.push({ role: 'user', content });
  bubble('user', `<p>${esc(content)}</p>`);
  renderSuggestions();
  const reply = bubble('assistant', '<span class="typing" aria-label="…"><i></i><i></i><i></i></span>');

  let answer = '';
  let usedOffline = false;
  try {
    const endpoint = app.site.assistant.endpoint || '/api/chat';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lang: app.lang,
        page: location.pathname,
        messages: messages.slice(-MAX_TURNS * 2).map(({ role, content: c }) => ({ role, content: c }))
      })
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      answer += decoder.decode(value, { stream: true });
      reply.innerHTML = renderMarkdown(answer);
      body.scrollTop = body.scrollHeight;
    }
    if (!answer.trim()) throw new Error('empty');
    offline = false;
  } catch (err) {
    console.info('[chat] using offline answers:', err.message);
    answer = await localAnswer(content).catch(() => t('chat.error'));
    usedOffline = true;
    offline = true;
    reply.innerHTML = renderMarkdown(answer) + `<span class="msg__note">${esc(t('chat.offlineNote'))}</span>`;
  }
  setStatus();
  messages.push({ role: 'assistant', content: answer, offline: usedOffline });
  saveHistory();
  busy = false;
  sendBtn.disabled = false;
  body.scrollTop = body.scrollHeight;
}

function autosize() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
}

/* ------------------------------------------------------------ open/close */
function open() {
  panel.hidden = false;
  fab.classList.add('is-hidden');
  fab.setAttribute('aria-expanded', 'true');
  setTimeout(() => input.focus(), 50);
  body.scrollTop = body.scrollHeight;
}
function close() {
  panel.hidden = true;
  fab.classList.remove('is-hidden');
  fab.setAttribute('aria-expanded', 'false');
  fab.focus();
}

function build() {
  const a = app.site.assistant;
  fab.innerHTML = `<span class="chat-fab__orb">${icon('sparkles')}</span><span class="chat-fab__label">${esc(t('chat.open'))}</span>`;
  fab.setAttribute('aria-label', t('chat.open'));
  panel.setAttribute('aria-label', tx(a.name));
  panel.innerHTML = `
    <div class="chat-head">
      <span class="chat-head__orb">${icon('sparkles')}</span>
      <div class="chat-head__text"><b>${esc(tx(a.name))}</b><span class="chat-status"></span></div>
      <button type="button" class="icon-btn icon-btn--sm" data-clear aria-label="${esc(t('chat.clear'))}" title="${esc(t('chat.clear'))}">${icon('refresh')}</button>
      <button type="button" class="icon-btn icon-btn--sm" data-close aria-label="${esc(t('common.close'))}">${icon('close')}</button>
    </div>
    <div class="chat-body" aria-live="polite"></div>
    <div class="chat-suggest"></div>
    <form class="chat-form">
      <label class="sr-only" for="chat-input">${esc(t('chat.placeholder'))}</label>
      <textarea id="chat-input" rows="1" maxlength="1500" placeholder="${esc(t('chat.placeholder'))}"></textarea>
      <button type="submit" class="icon-btn" aria-label="${esc(t('chat.send'))}">${icon('send', 'flip-rtl')}</button>
    </form>
    <p class="chat-disclaimer">${esc(t('chat.disclaimer'))}</p>`;
  body = $('.chat-body', panel);
  form = $('.chat-form', panel);
  input = $('textarea', panel);
  sendBtn = $('button[type="submit"]', panel);
  statusEl = $('.chat-status', panel);
  setStatus();
  renderAll();

  form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); }
  });
  $('[data-close]', panel).addEventListener('click', close);
  $('[data-clear]', panel).addEventListener('click', () => { messages = []; saveHistory(); renderAll(); input.focus(); });
}

export function initChat() {
  loadHistory();
  fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'chat-fab';
  fab.setAttribute('aria-controls', 'chat-panel');
  fab.setAttribute('aria-expanded', 'false');
  panel = document.createElement('section');
  panel.className = 'chat-panel';
  panel.id = 'chat-panel';
  panel.setAttribute('role', 'dialog');
  panel.hidden = true;
  document.body.append(fab, panel);
  build();

  fab.addEventListener('click', open);
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.addEventListener('app:openchat', open);
  document.addEventListener('app:langchange', build);
  if (location.hash === '#chat') open();
}
