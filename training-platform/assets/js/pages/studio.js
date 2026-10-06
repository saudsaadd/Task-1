// Owner-only AI studio: chat with Claude, and image / video generation on fal.ai.
// Everything secret (password, API keys, allowed models) lives on the server in
// api/studio.js; this page keeps the chat, drafts and generated media in this browser.
import {
  app, boot, loadJSON, t, tx, esc, icon, safeUrl, toast, setTitle, confirmDialog, openModal,
  fmtNum, fmtDate, fmtClock, $, $$
} from '../app.js';

const API = '/api/studio';
const TOKEN_KEY = 'agilix.studio.token.v1';
const CHAT_KEY = 'agilix.studio.chat.v1';
const JOBS_KEY = 'agilix.studio.jobs.v1';
const UI_KEY = 'agilix.studio.ui.v1';
const TABS = ['chat', 'image', 'video', 'library'];
const POLL_MS = { image: 3000, video: 6000 };
const JOB_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_UPLOAD_SIDE = 1600;
const MAX_UPLOAD_BYTES = 2.8 * 1024 * 1024;
const MARKERS = { continue: '[[continue]]', refused: '[[refused]]' };

const S = {
  phase: 'checking', // checking | offline | setup | gate | ready
  token: null,
  features: { chat: false, image: false, video: false },
  models: { image: [], video: [] },
  tab: 'chat',
  chat: [],
  streaming: null,
  drafts: { chat: '', image: '', video: '' },
  original: { image: null, video: null },
  enhancing: { image: false, video: false },
  form: { image: { model: '', options: {} }, video: { model: '', options: {}, image: null } },
  jobs: [],
  libFilter: 'all',
  gateError: ''
};

/* ------------------------------------------------------------ storage */
function readJSON(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}
const saveChat = () => writeJSON(CHAT_KEY, S.chat.filter((m) => m.status !== 'streaming').slice(-80));
const saveJobs = () => writeJSON(JOBS_KEY, S.jobs.slice(0, 300));
function saveUi() {
  writeJSON(UI_KEY, {
    tab: S.tab,
    libFilter: S.libFilter,
    drafts: S.drafts,
    form: { image: S.form.image, video: { model: S.form.video.model, options: S.form.video.options } }
  });
}
function loadSaved() {
  S.chat = readJSON(CHAT_KEY, []).filter((m) => m && typeof m.content === 'string');
  S.jobs = readJSON(JOBS_KEY, []).filter((j) => j && j.job && j.kind);
  const ui = readJSON(UI_KEY, {});
  if (TABS.includes(ui.tab)) S.tab = ui.tab;
  if (['all', 'image', 'video'].includes(ui.libFilter)) S.libFilter = ui.libFilter;
  for (const k of ['chat', 'image', 'video']) if (typeof ui.drafts?.[k] === 'string') S.drafts[k] = ui.drafts[k];
  for (const k of ['image', 'video']) {
    if (ui.form?.[k]?.model) S.form[k].model = ui.form[k].model;
    if (ui.form?.[k]?.options && typeof ui.form[k].options === 'object') S.form[k].options = ui.form[k].options;
  }
  const fromHash = location.hash.slice(1);
  if (TABS.includes(fromHash)) S.tab = fromHash;
}

/* ---------------------------------------------------------------- API */
class StudioError extends Error {
  constructor(code, detail = '', status = 0) { super(code); this.code = code; this.detail = detail; this.status = status; }
}

async function api(action, { method = 'POST', body, raw = false, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (S.token) headers.Authorization = `Bearer ${S.token}`;
  const res = await fetch(`${API}?action=${action}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal, cache: 'no-store' });
  if (raw && res.ok) return res;
  let payload = null;
  try { payload = await res.json(); } catch { /* not JSON (static host 404 page) */ }
  if (res.status === 401 && action !== 'login' && S.token) { endSession(true); throw new StudioError('session', '', 401); }
  if (!res.ok) throw new StudioError(payload?.error || `http_${res.status}`, payload?.detail || '', res.status);
  return payload;
}

function errorText(err) {
  if (!err) return t('studio.error.generic');
  if (err.name === 'AbortError') return '';
  if (err instanceof TypeError) return t('studio.error.network');
  const key = `studio.error.${err.code}`;
  const text = t(key, { detail: err.detail || '—' });
  return text === key ? t('studio.error.generic') : text;
}

/* ------------------------------------------------------------ session */
async function startup() {
  loadSaved();
  try { S.models = await loadJSON('data/studio.json'); } catch { S.models = { image: [], video: [] }; }
  for (const kind of ['image', 'video']) normalizeForm(kind);
  const saved = readJSON(TOKEN_KEY);
  if (saved?.token && saved.expiresAt > Date.now()) S.token = saved.token;
  try {
    const r = await api('session', { method: 'GET' });
    S.features = r.features;
    S.phase = 'ready';
  } catch (err) {
    if (err.code === 'studio_not_configured') S.phase = 'setup';
    else if (err.status === 401) S.phase = 'gate';
    else S.phase = 'offline';
  }
  render();
  if (S.phase === 'ready') schedulePoll(400);
}

function endSession(expired = false) {
  S.token = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  S.streaming?.controller.abort();
  clearTimeout(pollTimer);
  S.phase = 'gate';
  S.gateError = expired ? t('studio.error.session') : '';
  render();
}

async function login(form) {
  const input = $('#studio-password', form);
  const btn = $('[type="submit"]', form);
  if (!input.value) { input.focus(); return; }
  btn.disabled = true;
  btn.classList.add('is-busy');
  try {
    const r = await api('login', { body: { password: input.value } });
    S.token = r.token;
    writeJSON(TOKEN_KEY, { token: r.token, expiresAt: r.expiresAt });
    S.features = r.features;
    S.phase = 'ready';
    S.gateError = '';
    render();
    schedulePoll(400);
  } catch (err) {
    S.gateError = err.code === 'wrong_password' ? t('studio.gate.wrong')
      : err.code === 'too_many_attempts' ? t('studio.gate.locked')
        : err.code === 'studio_not_configured' ? '' : errorText(err);
    if (err.code === 'studio_not_configured') { S.phase = 'setup'; render(); return; }
    btn.disabled = false;
    btn.classList.remove('is-busy');
    const box = $('.studio-error', form);
    box.textContent = S.gateError;
    box.hidden = false;
    input.select();
  }
}

/* ------------------------------------------------------------ helpers */
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
const modelsOf = (kind) => S.models?.[kind] || [];
const currentModel = (kind) => modelsOf(kind).find((m) => m.id === S.form[kind].model) || modelsOf(kind)[0] || null;
const excerpt = (s, n = 140) => (s.length > n ? `${s.slice(0, n).trim()}…` : s);
const pending = () => S.jobs.filter((j) => j.state === 'queued' || j.state === 'running');

function normalizeForm(kind) {
  const model = currentModel(kind);
  if (!model) return;
  S.form[kind].model = model.id;
  const next = {};
  for (const opt of model.options || []) {
    const v = S.form[kind].options?.[opt.param];
    next[opt.param] = opt.values.includes(v) ? v : opt.default;
  }
  S.form[kind].options = next;
}

function valueLabel(opt, v) {
  if (typeof v === 'boolean') return t(`studio.gen.value.${v}`);
  if (v === 'auto') return t('studio.gen.value.auto');
  if (typeof v === 'number') return fmtNum(v);
  const sec = String(v).match(/^(\d+)s$/);
  if (sec) return t('studio.gen.seconds', { n: fmtNum(Number(sec[1])) });
  return String(v);
}

async function copyText(text, done = t('studio.chat.copied')) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = Object.assign(document.createElement('textarea'), { value: text });
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.append(area);
    area.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    area.remove();
  }
  toast(done);
}

async function download(url, name) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(String(res.status));
    const href = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60000);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

function fileName(job, media, index) {
  const ext = (media.contentType || '').split('/')[1]?.replace('jpeg', 'jpg') || media.url.split('?')[0].split('.').pop() || (media.type === 'video' ? 'mp4' : 'png');
  const stamp = new Date(job.doneAt || job.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `agilix-${media.type}-${stamp}${index ? `-${index + 1}` : ''}.${ext.slice(0, 5)}`;
}

/** Downscale an uploaded image and return it as a JPEG data URI. */
async function readImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, MAX_UPLOAD_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.8, 0.65, 0.5]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length * 0.75 <= MAX_UPLOAD_BYTES) return dataUrl;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ----------------------------------------------------------- markdown */
function inlineMd(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,:;!?]|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
      const u = safeUrl(url.replace(/&amp;/g, '&'));
      return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${label}</a>` : label;
    });
}

const tableCells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/** Safe Markdown for Claude's replies: escapes first, then headings, lists, tables, quotes and code blocks. */
function renderMarkdown(src) {
  const lines = String(src).replace(/\r/g, '').split('\n');
  const out = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inlineMd).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const flush = () => { flushPara(); flushList(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/);
    if (fence) {
      flush();
      const code = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
      out.push(`<div class="md-code"><div class="md-code__bar"><span>${esc(fence[1] || 'text')}</span><button type="button" class="link-btn" data-copy-code>${icon('copy')}${esc(t('studio.chat.copy'))}</button></div><pre dir="ltr"><code>${esc(code.join('\n'))}</code></pre></div>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      flush();
      const head = tableCells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(tableCells(lines[i++]));
      i--;
      out.push(`<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${inlineMd(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inlineMd(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) { flush(); out.push(heading[1].length <= 2 ? `<h3>${inlineMd(heading[2])}</h3>` : `<h4>${inlineMd(heading[2])}</h4>`); continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); out.push('<hr>'); continue; }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) { flush(); out.push(`<blockquote>${inlineMd(quote[1])}</blockquote>`); continue; }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushPara();
      const type = bullet ? 'ul' : 'ol';
      if (list !== type) { flushList(); list = type; out.push(`<${type}>`); }
      out.push(`<li>${inlineMd((bullet || numbered)[1])}</li>`);
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    flushList();
    para.push(line);
  }
  flush();
  return out.join('');
}

/* ------------------------------------------------------------- render */
function renderHead() {
  const head = $('#studio-head');
  if (!head) return;
  const ready = S.phase === 'ready';
  const chip = (on, name) => `<span class="chip ${on ? 'chip--success' : 'chip--outline'}">${icon(on ? 'check' : 'info')}${esc(t(on ? 'studio.service.on' : 'studio.service.off', { name }))}</span>`;
  head.innerHTML = `<div class="studio-head">
    <div class="stack" style="gap:12px">
      <span class="eyebrow">${esc(t('studio.eyebrow'))}</span>
      <h1 class="h2">${esc(t('studio.title'))}</h1>
      <p class="lead">${esc(t('studio.lead'))}</p>
    </div>
    ${ready ? `<div class="studio-head__side">
      <div class="row">${chip(S.features.chat, 'Claude')}${chip(S.features.image || S.features.video, 'fal.ai')}</div>
      <button type="button" class="btn btn--ghost btn--sm" data-signout-studio>${icon('logout', 'flip-rtl')}${esc(t('studio.signout'))}</button>
    </div>` : ''}
  </div>`;
}

function render() {
  setTitle(t('studio.title'));
  document.documentElement.classList.toggle('studio-ready', S.phase === 'ready');
  renderHead();
  const root = $('#studio-root');
  if (!root) return;
  if (S.phase === 'checking') root.innerHTML = `<div class="studio-loading"><span class="spinner"></span></div>`;
  else if (S.phase === 'offline') root.innerHTML = noticeMarkup('warning', t('studio.title'), t('studio.gate.offline'));
  else if (S.phase === 'setup') root.innerHTML = setupMarkup();
  else if (S.phase === 'gate') root.innerHTML = gateMarkup();
  else root.innerHTML = workspaceMarkup();
  if (S.phase === 'gate') setTimeout(() => $('#studio-password')?.focus(), 30);
  if (S.phase === 'ready') afterPanelRender();
}

function noticeMarkup(iconName, title, text) {
  return `<div class="card studio-notice">${icon(iconName)}<div><h2 class="h4">${esc(title)}</h2><p class="muted">${esc(text)}</p></div></div>`;
}

function setupMarkup() {
  const row = (name, text, tag, required = false) => `<li><div class="studio-env"><code dir="ltr">${name}</code><button type="button" class="icon-btn icon-btn--sm" data-copy-text="${name}" aria-label="${esc(t('studio.chat.copy'))} ${name}">${icon('copy')}</button>
    <span class="chip ${required ? 'chip--soft' : 'chip--outline'}">${esc(t(tag))}</span></div><p class="muted">${esc(text)}</p></li>`;
  return `<div class="card studio-setup">
    <span class="studio-setup__icon">${icon('shield')}</span>
    <h2 class="h3">${esc(t('studio.setup.title'))}</h2>
    <p class="muted">${esc(t('studio.setup.text'))}</p>
    <ol class="studio-setup__list">
      ${row('ADMIN_PASSWORD', t('studio.setup.password'), 'studio.setup.required', true)}
      ${row('ANTHROPIC_API_KEY', t('studio.setup.anthropic'), 'studio.setup.forChat')}
      ${row('FAL_KEY', t('studio.setup.fal'), 'studio.setup.forMedia')}
    </ol>
  </div>`;
}

function gateMarkup() {
  return `<form class="card studio-gate" id="studio-gate" novalidate>
    <span class="studio-setup__icon">${icon('lock')}</span>
    <h2 class="h3">${esc(t('studio.gate.title'))}</h2>
    <p class="muted">${esc(t('studio.gate.text'))}</p>
    <div class="field">
      <label for="studio-password">${esc(t('studio.gate.password'))}</label>
      <div class="input-group input-group--password">${icon('lock')}
        <input class="input ltr" id="studio-password" type="password" autocomplete="current-password" required>
        <button type="button" class="pw-toggle" data-pw-toggle aria-label="${esc(t('auth.show'))}" aria-pressed="false">${icon('eye')}</button>
      </div>
    </div>
    <p class="studio-error" role="alert"${S.gateError ? '' : ' hidden'}>${esc(S.gateError)}</p>
    <button type="submit" class="btn btn--primary btn--lg btn--block">${esc(t('studio.gate.submit'))}<span class="btn__arrow">${icon('arrow', 'flip-rtl')}</span></button>
  </form>`;
}

function workspaceMarkup() {
  const done = S.jobs.reduce((n, j) => n + (j.state === 'done' ? j.media.length : 0), 0);
  const tab = (id, ic) => `<button type="button" role="tab" class="tab" id="studio-tab-${id}" aria-controls="studio-panel" aria-selected="${S.tab === id}" data-studio-tab="${id}">${icon(ic)}${esc(t(`studio.tab.${id}`))}${id === 'library' && done ? `<span class="studio-count">${fmtNum(done)}</span>` : ''}</button>`;
  return `<div class="tabs studio-tabs" role="tablist" aria-label="${esc(t('studio.title'))}">
      ${tab('chat', 'chat')}${tab('image', 'image')}${tab('video', 'video')}${tab('library', 'grid')}
    </div>
    <div id="studio-panel" role="tabpanel" aria-labelledby="studio-tab-${S.tab}">${panelMarkup()}</div>`;
}

function panelMarkup() {
  if (S.tab === 'chat') return chatMarkup();
  if (S.tab === 'library') return libraryMarkup();
  return generatorMarkup(S.tab);
}

function renderPanel() {
  const panel = $('#studio-panel');
  if (!panel) return render();
  $$('[data-studio-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.studioTab === S.tab)));
  panel.setAttribute('aria-labelledby', `studio-tab-${S.tab}`);
  panel.innerHTML = panelMarkup();
  afterPanelRender();
}

function afterPanelRender() {
  if (S.tab === 'chat') {
    const log = $('#studio-log');
    if (log) log.scrollTop = log.scrollHeight;
    autosize($('#studio-chat-input'));
  }
  tickElapsed();
}

const featureOff = (key) => `<p class="studio-off">${icon('info')}<span>${esc(t('studio.feature.off', { key }))}</span></p>`;

/* --------------------------------------------------------------- chat */
const PRESETS = [['script', 'video'], ['quiz', 'target'], ['course', 'book'], ['social', 'megaphone']];

function chatMarkup() {
  const log = S.chat.length
    ? S.chat.map(messageMarkup).join('')
    : `<div class="studio-empty">
        <span class="studio-empty__icon">${icon('sparkles')}</span>
        <h2 class="h4">${esc(t('studio.chat.empty.title'))}</h2>
        <p class="muted">${esc(t('studio.chat.empty.text'))}</p>
        <div class="studio-presets">${PRESETS.map(([id, ic]) => `<button type="button" class="studio-preset" data-preset="${id}">${icon(ic)}<span><b>${esc(t(`studio.chat.preset.${id}.title`))}</b><small>${esc(t(`studio.chat.preset.${id}.text`))}</small></span></button>`).join('')}</div>
      </div>`;
  const busy = !!S.streaming;
  return `<div class="card studio-chat">
    <div class="studio-chat__bar">
      <span class="studio-chat__who">${icon('sparkles')}Claude · AGILIX</span>
      <button type="button" class="btn btn--ghost btn--sm" data-chat-new${S.chat.length && !busy ? '' : ' disabled'}>${icon('refresh')}${esc(t('studio.chat.new'))}</button>
    </div>
    <div class="studio-chat__log" id="studio-log">${log}</div>
    ${S.features.chat ? `<form class="studio-composer" id="studio-composer">
      <label class="sr-only" for="studio-chat-input">${esc(t('studio.chat.placeholder'))}</label>
      <textarea class="textarea" id="studio-chat-input" rows="1" dir="auto" placeholder="${esc(t('studio.chat.placeholder'))}">${esc(S.drafts.chat)}</textarea>
      ${busy
        ? `<button type="button" class="btn btn--ink studio-composer__btn" data-chat-stop aria-label="${esc(t('studio.chat.stop'))}">${icon('stop')}</button>`
        : `<button type="submit" class="btn btn--primary studio-composer__btn" aria-label="${esc(t('studio.chat.send'))}">${icon('send', 'flip-rtl')}</button>`}
    </form>` : featureOff('ANTHROPIC_API_KEY')}
  </div>`;
}

/** Hide a server marker (or the start of one still streaming in) at the end of a reply. */
function stripMarkers(text) {
  for (const marker of Object.values(MARKERS)) {
    for (let n = marker.length; n >= 2; n--) {
      if (text.endsWith(marker.slice(0, n))) return text.slice(0, -n).replace(/\s+$/, '');
    }
  }
  return text;
}

function messageNote(m) {
  const note = (cls, text, extra = '') => `<p class="studio-note studio-note--${cls}">${icon(cls === 'warn' ? 'warning' : 'info')}<span>${esc(text)}</span>${extra}</p>`;
  if (m.status === 'cut') return note('info', t('studio.chat.cut'), `<button type="button" class="btn btn--accent btn--sm" data-chat-continue>${esc(t('studio.chat.continue'))}</button>`);
  if (m.status === 'refused') return note('warn', t('studio.chat.refused'));
  if (m.status === 'stopped') return note('info', t('studio.chat.stopped'));
  if (m.status === 'error') return note('warn', m.error || t('studio.error.generic'));
  return '';
}

function messageMarkup(m, i) {
  if (m.role === 'user') {
    return `<div class="smsg smsg--user" data-msg="${i}"><span class="sr-only">${esc(t('studio.chat.you'))}:</span><div class="smsg__body" dir="auto">${esc(m.content).replace(/\n/g, '<br>')}</div></div>`;
  }
  const streaming = m.status === 'streaming';
  const body = m.content ? renderMarkdown(streaming ? stripMarkers(m.content) : m.content) : (streaming ? `<span class="studio-typing" aria-label="${esc(t('studio.chat.writing'))}"><i></i><i></i><i></i></span>` : '');
  const actions = !streaming && m.content ? `<div class="smsg__actions">
      <button type="button" class="link-btn" data-msg-copy="${i}">${icon('copy')}${esc(t('studio.chat.copy'))}</button>
      ${S.features.image ? `<button type="button" class="link-btn" data-msg-to="image" data-i="${i}">${icon('image')}${esc(t('studio.chat.toImage'))}</button>` : ''}
      ${S.features.video ? `<button type="button" class="link-btn" data-msg-to="video" data-i="${i}">${icon('video')}${esc(t('studio.chat.toVideo'))}</button>` : ''}
    </div>` : '';
  return `<div class="smsg smsg--bot" data-msg="${i}">
    <span class="smsg__avatar" aria-hidden="true">${icon('sparkles')}</span>
    <div class="smsg__main"><div class="smsg__body md" dir="auto">${body}</div>${messageNote(m)}${actions}</div>
  </div>`;
}

let paintQueued = false;
function paintStreaming() {
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => {
    paintQueued = false;
    const i = S.chat.findIndex((m) => m.status === 'streaming');
    const el = $(`#studio-log [data-msg="${i}"] .smsg__body`);
    if (!el || i < 0) return;
    const log = $('#studio-log');
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
    el.innerHTML = renderMarkdown(stripMarkers(S.chat[i].content)) || el.innerHTML;
    if (nearBottom) log.scrollTop = log.scrollHeight;
  });
}

async function sendChat(text) {
  text = String(text || '').trim();
  if (!text || S.streaming || !S.features.chat) return;
  const history = S.chat.filter((m) => m.content).map(({ role, content }) => ({ role, content }));
  history.push({ role: 'user', content: text });
  S.chat.push({ role: 'user', content: text });
  const reply = { role: 'assistant', content: '', status: 'streaming' };
  S.chat.push(reply);
  S.drafts.chat = '';
  saveUi();
  const controller = new AbortController();
  S.streaming = { controller };
  if (S.tab === 'chat') renderPanel();

  try {
    const res = await api('chat', { body: { messages: history }, raw: true, signal: controller.signal });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      reply.content += decoder.decode(value, { stream: true });
      paintStreaming();
    }
    reply.content += decoder.decode();
    reply.status = 'done';
    for (const [status, marker] of [['cut', MARKERS.continue], ['refused', MARKERS.refused]]) {
      if (reply.content.trimEnd().endsWith(marker)) {
        reply.content = reply.content.trimEnd().slice(0, -marker.length).trimEnd();
        reply.status = status;
      }
    }
  } catch (err) {
    reply.content = stripMarkers(reply.content);
    if (err.name === 'AbortError') reply.status = 'stopped';
    else { reply.status = 'error'; reply.error = errorText(err); }
  }
  S.streaming = null;
  saveChat();
  if (S.phase === 'ready' && S.tab === 'chat') {
    renderPanel();
    $('#studio-chat-input')?.focus();
  }
}

function autosize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight + 2, 240)}px`;
}

/** The part of a reply worth sending to a generator: its first code block, or the whole text. */
function promptFromReply(text) {
  const block = text.match(/```[\w-]*\n([\s\S]*?)```/);
  return (block ? block[1] : text).trim().slice(0, 4000);
}

/* ---------------------------------------------------------- generator */
function optionMarkup(kind, opt) {
  const current = S.form[kind].options[opt.param];
  return `<fieldset class="studio-opt">
    <legend>${esc(t(`studio.gen.opt.${opt.label}`))}</legend>
    <div class="seg">${opt.values.map((v) => `<label class="seg__item"><input type="radio" name="opt-${esc(opt.param)}" value="${esc(JSON.stringify(v))}" data-opt="${esc(opt.param)}"${v === current ? ' checked' : ''}><span>${esc(valueLabel(opt, v))}</span></label>`).join('')}</div>
  </fieldset>`;
}

function sourceMarkup(kind) {
  const src = S.form[kind].image;
  return `<div class="field">
    <span class="label">${esc(t('studio.gen.image'))}</span>
    <div class="studio-src${src ? ' has-image' : ''}">
      ${src ? `<img src="${esc(src)}" alt=""><button type="button" class="icon-btn icon-btn--sm studio-src__remove" data-src-remove aria-label="${esc(t('studio.gen.image.remove'))}">${icon('close')}</button>`
        : `<p class="muted">${icon('image')}<span>${esc(t('studio.gen.image.none'))}</span></p>`}
    </div>
    <div class="row">
      <button type="button" class="btn btn--ghost btn--sm" data-src-pick>${icon('grid')}${esc(t('studio.gen.image.pick'))}</button>
      <label class="btn btn--ghost btn--sm studio-upload">${icon('upload')}${esc(t('studio.gen.image.upload'))}<input type="file" accept="image/png,image/jpeg,image/webp" data-src-file></label>
    </div>
  </div>`;
}

function generatorMarkup(kind) {
  const models = modelsOf(kind);
  const model = currentModel(kind);
  const on = S.features[kind];
  const enhancing = S.enhancing[kind];
  const jobs = S.jobs.filter((j) => j.kind === kind).slice(0, 12);
  return `<div class="studio-gen">
    <form class="card studio-gen__form" id="studio-gen" data-kind="${kind}" novalidate>
      ${on ? '' : featureOff('FAL_KEY')}
      <div class="field">
        <div class="studio-gen__labelrow">
          <label for="studio-prompt">${esc(t('studio.gen.prompt'))}</label>
          ${S.features.chat ? `<button type="button" class="link-btn" data-enhance${enhancing ? ' disabled' : ''}>${enhancing ? '<span class="spinner"></span>' : icon('sparkles')}${esc(t(enhancing ? 'studio.gen.enhancing' : 'studio.gen.enhance'))}</button>` : ''}
        </div>
        <textarea class="textarea" id="studio-prompt" dir="auto" placeholder="${esc(t(`studio.gen.placeholder.${kind}`))}">${esc(S.drafts[kind])}</textarea>
        ${S.original[kind] != null ? `<p class="field__hint">${esc(t('studio.gen.enhanced'))} <button type="button" class="link-btn" data-undo-enhance>${esc(t('studio.gen.undo'))}</button></p>` : ''}
      </div>
      ${models.length > 1 ? `<div class="field">
        <label for="studio-model">${esc(t('studio.gen.model'))}</label>
        <select class="select" id="studio-model">${models.map((m) => `<option value="${esc(m.id)}"${m.id === model?.id ? ' selected' : ''}>${esc(tx(m.label))}</option>`).join('')}</select>
        ${model?.hint ? `<p class="field__hint">${esc(tx(model.hint))}</p>` : ''}
      </div>` : ''}
      ${model?.image ? sourceMarkup(kind) : ''}
      ${(model?.options || []).map((opt) => optionMarkup(kind, opt)).join('')}
      <p class="studio-gen__cost">${icon('info')}<span>${esc(t(`studio.gen.cost.${kind}`))}</span></p>
      <p class="studio-error" role="alert" hidden></p>
      <button type="submit" class="btn btn--primary btn--lg btn--block"${on && model ? '' : ' disabled'}>${icon('sparkles')}${esc(t(`studio.gen.submit.${kind}`))}</button>
    </form>
    <section class="studio-gen__results" aria-labelledby="studio-results-title">
      <h2 class="h4" id="studio-results-title">${esc(t('studio.gen.results'))}</h2>
      <div class="studio-grid" id="studio-jobs">${jobs.length ? jobs.map(jobMarkup).join('') : `<p class="studio-grid__empty muted">${icon(kind === 'video' ? 'video' : 'image')}<span>${esc(t(`studio.gen.empty.${kind}`))}</span></p>`}</div>
    </section>
  </div>`;
}

function ratioOf(job, media) {
  if (media.width && media.height) return `${media.width} / ${media.height}`;
  const r = String(job.options?.aspect_ratio || '').match(/^(\d+):(\d+)$/);
  if (r) return `${r[1]} / ${r[2]}`;
  return media.type === 'video' ? '16 / 9' : '1 / 1';
}

function modelLabel(id) {
  const m = [...modelsOf('image'), ...modelsOf('video')].find((x) => x.id === id);
  return m ? tx(m.label) : id;
}

function jobMarkup(j) {
  if (j.state === 'done') return j.media.map((m, i) => mediaMarkup(j, m, i)).join('');
  if (j.state === 'failed') {
    return `<article class="studio-job studio-job--failed">
      <span class="studio-job__icon">${icon('warning')}</span>
      <div class="studio-job__text"><b>${esc(t('studio.job.failed'))}</b><p>${esc(j.error || t('studio.error.generic'))}</p><p class="studio-job__prompt" dir="auto">${esc(excerpt(j.prompt, 100))}</p></div>
      <div class="row"><button type="button" class="btn btn--accent btn--sm" data-job-reuse="${j.localId}">${icon('refresh')}${esc(t('studio.job.retry'))}</button>
      <button type="button" class="btn btn--ghost btn--sm" data-job-dismiss="${j.localId}">${esc(t('studio.job.dismiss'))}</button></div>
    </article>`;
  }
  const status = j.state === 'queued' ? t('studio.job.queued') : t('studio.job.running');
  return `<article class="studio-job" style="aspect-ratio:${ratioOf(j, { type: j.kind })}">
    <span class="studio-job__shimmer" aria-hidden="true"></span>
    <div class="studio-job__text">
      <span class="chip chip--soft"><span class="spinner"></span>${esc(status)} · <span data-elapsed="${j.createdAt}" dir="ltr">00:00</span></span>
      ${j.state === 'queued' && Number.isFinite(j.position) ? `<small>${esc(t('studio.job.position', { n: fmtNum(j.position + 1) }))}</small>` : ''}
      <p class="studio-job__prompt" dir="auto">${esc(excerpt(j.prompt, 120))}</p>
      <small class="muted">${esc(modelLabel(j.model))}</small>
    </div>
  </article>`;
}

function mediaMarkup(j, m, i) {
  const url = safeUrl(m.url);
  if (!url) return '';
  const key = `${j.localId}:${i}`;
  const btn = (attr, ic, label) => `<button type="button" class="icon-btn icon-btn--sm" ${attr}="${key}" title="${esc(label)}" aria-label="${esc(label)}">${icon(ic)}</button>`;
  return `<figure class="studio-media" data-media="${key}">
    <div class="studio-media__frame" style="aspect-ratio:${ratioOf(j, m)}">
      ${m.type === 'video'
        ? `<video src="${esc(url)}" controls playsinline preload="metadata"></video>`
        : `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(excerpt(j.prompt, 120))}" loading="lazy"></a>`}
    </div>
    <figcaption>
      <p class="studio-media__prompt" dir="auto" title="${esc(j.prompt)}">${esc(excerpt(j.prompt, 110))}</p>
      <small class="muted">${esc(modelLabel(j.model))} · ${esc(fmtDate(j.doneAt || j.createdAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</small>
      <div class="studio-media__actions">
        <a class="icon-btn icon-btn--sm" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(t('studio.media.open'))}" aria-label="${esc(t('studio.media.open'))}">${icon('external')}</a>
        ${btn('data-media-download', 'download', t('studio.media.download'))}
        ${btn('data-media-copy', 'copy', t('studio.media.copyLink'))}
        ${m.type === 'image' && modelsOf('video').some((x) => x.image) ? btn('data-media-animate', 'video', t('studio.media.animate')) : ''}
        ${btn('data-media-reuse', 'edit', t('studio.media.reuse'))}
        ${btn('data-media-delete', 'trash', t('studio.media.delete'))}
      </div>
    </figcaption>
  </figure>`;
}

function libraryMarkup() {
  const items = S.jobs.filter((j) => j.state !== 'failed' && (S.libFilter === 'all' || j.kind === S.libFilter));
  const count = items.reduce((n, j) => n + (j.state === 'done' ? j.media.length : 0), 0);
  const filter = (id, label) => `<button type="button" class="chip${S.libFilter === id ? ' is-active' : ''}" data-lib-filter="${id}" aria-pressed="${S.libFilter === id}">${esc(t(label))}</button>`;
  return `<div class="studio-lib">
    <div class="studio-lib__bar">
      <div class="row">${filter('all', 'studio.library.all')}${filter('image', 'studio.library.images')}${filter('video', 'studio.library.videos')}</div>
      <span class="muted">${esc(t('studio.library.count', { n: fmtNum(count) }))}</span>
    </div>
    <p class="studio-off studio-off--info">${icon('info')}<span>${esc(t('studio.library.note'))}</span></p>
    <div class="studio-grid studio-grid--lib">${items.length ? items.map(jobMarkup).join('') : `<p class="studio-grid__empty muted">${icon('grid')}<span>${esc(t('studio.library.empty'))}</span></p>`}</div>
  </div>`;
}

function refreshJobs() {
  if (S.phase !== 'ready') return;
  const tabLib = $('#studio-tab-library');
  if (tabLib) {
    const done = S.jobs.reduce((n, j) => n + (j.state === 'done' ? j.media.length : 0), 0);
    tabLib.innerHTML = `${icon('grid')}${esc(t('studio.tab.library'))}${done ? `<span class="studio-count">${fmtNum(done)}</span>` : ''}`;
  }
  if (S.tab === 'library') { renderPanel(); return; }
  const box = $('#studio-jobs');
  if (box && (S.tab === 'image' || S.tab === 'video')) {
    const jobs = S.jobs.filter((j) => j.kind === S.tab).slice(0, 12);
    box.innerHTML = jobs.length ? jobs.map(jobMarkup).join('') : `<p class="studio-grid__empty muted">${icon(S.tab === 'video' ? 'video' : 'image')}<span>${esc(t(`studio.gen.empty.${S.tab}`))}</span></p>`;
    tickElapsed();
  }
}

async function submitGeneration(form) {
  const kind = form.dataset.kind;
  const errorBox = $('.studio-error', form);
  const showError = (text) => { errorBox.textContent = text; errorBox.hidden = !text; };
  const prompt = S.drafts[kind].trim();
  const model = currentModel(kind);
  if (!prompt) { showError(t('studio.gen.need')); $('#studio-prompt').focus(); return; }
  if (model.image && !S.form[kind].image) { showError(t('studio.gen.needImage')); return; }
  showError('');
  const btn = $('[type="submit"]', form);
  btn.disabled = true;
  btn.classList.add('is-busy');
  try {
    const image = model.image ? S.form[kind].image : undefined;
    const { job } = await api('submit', { body: { kind, model: model.id, prompt, options: S.form[kind].options, image } });
    S.jobs.unshift({
      localId: uid(), kind, model: model.id, prompt, options: { ...S.form[kind].options },
      image: image && image.startsWith('https://') ? image : null,
      job, state: 'queued', position: null, createdAt: Date.now(), media: []
    });
    saveJobs();
    toast(t('studio.gen.started'), 'info');
    refreshJobs();
    schedulePoll(1500);
  } catch (err) {
    if (err.code !== 'session') showError(errorText(err));
  } finally {
    if (btn.isConnected) { btn.disabled = false; btn.classList.remove('is-busy'); }
  }
}

async function enhancePrompt(kind) {
  const brief = S.drafts[kind].trim();
  if (!brief) { const box = $('#studio-gen .studio-error'); box.textContent = t('studio.gen.need'); box.hidden = false; return; }
  S.enhancing[kind] = true;
  renderPanel();
  try {
    const { prompt } = await api('enhance', { body: { prompt: brief, kind } });
    S.original[kind] = brief;
    S.drafts[kind] = prompt;
    saveUi();
  } catch (err) {
    if (err.code !== 'session') toast(errorText(err), 'error');
  }
  S.enhancing[kind] = false;
  if (S.phase === 'ready' && S.tab === kind) renderPanel();
}

/* ------------------------------------------------------------ polling */
let pollTimer = null;
let elapsedTimer = null;

function schedulePoll(delay) {
  clearTimeout(pollTimer);
  if (S.phase !== 'ready' || !pending().length) return;
  pollTimer = setTimeout(pollOnce, delay);
}

async function pollOnce() {
  const list = pending();
  let changed = false;
  await Promise.all(list.map(async (j) => {
    if (Date.now() - j.createdAt > JOB_TIMEOUT_MS) { Object.assign(j, { state: 'failed', error: t('studio.job.timeout') }); changed = true; return; }
    try {
      const r = await api('status', { body: { job: { statusUrl: j.job.statusUrl, responseUrl: j.job.responseUrl } } });
      if (r.status === 'done') {
        Object.assign(j, { state: 'done', media: r.media, doneAt: Date.now() });
        toast(t(`studio.done.${j.kind}`));
      } else if (r.status === 'failed') {
        Object.assign(j, { state: 'failed', error: r.error === 'no_media' ? t('studio.error.generic') : r.error });
      } else {
        if (j.state === r.status && j.position === (r.position ?? null)) return;
        Object.assign(j, { state: r.status, position: r.position ?? null });
      }
      changed = true;
    } catch (err) {
      if (err.code === 'job_not_found') { Object.assign(j, { state: 'failed', error: t('studio.error.generic') }); changed = true; }
      // other errors are transient: keep polling
    }
  }));
  if (changed) { saveJobs(); refreshJobs(); }
  const next = pending();
  if (next.length) schedulePoll(Math.min(...next.map((j) => POLL_MS[j.kind] || 5000)));
}

function tickElapsed() {
  const els = $$('[data-elapsed]');
  els.forEach((el) => { el.textContent = fmtClock(Math.max(0, Math.round((Date.now() - Number(el.dataset.elapsed)) / 1000))); });
  clearTimeout(elapsedTimer);
  if (els.length) elapsedTimer = setTimeout(tickElapsed, 1000);
}

/* ------------------------------------------------------------- events */
function findMedia(key) {
  const [id, index] = String(key).split(':');
  const job = S.jobs.find((j) => j.localId === id);
  return job ? { job, media: job.media[Number(index)], index: Number(index) } : {};
}

function reuse(job) {
  S.tab = job.kind;
  S.drafts[job.kind] = job.prompt;
  S.original[job.kind] = null;
  S.form[job.kind].model = job.model;
  S.form[job.kind].options = { ...job.options };
  if (job.kind === 'video') S.form.video.image = job.image || S.form.video.image;
  normalizeForm(job.kind);
  saveUi();
  renderPanel();
  history.replaceState(null, '', `#${S.tab}`);
  $('#studio-prompt')?.focus();
}

function openLibraryPicker() {
  const images = S.jobs.filter((j) => j.state === 'done').flatMap((j) => j.media.filter((m) => m.type === 'image' && safeUrl(m.url)));
  const dlg = openModal({
    title: t('studio.gen.image.pickTitle'),
    size: 'modal--lg',
    body: images.length
      ? `<div class="studio-picker">${images.map((m) => `<button type="button" class="studio-picker__item" data-pick="${esc(m.url)}"><img src="${esc(m.url)}" alt="" loading="lazy"></button>`).join('')}</div>`
      : `<p class="muted">${esc(t('studio.gen.image.emptyLib'))}</p>`
  });
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    S.form.video.image = b.dataset.pick;
    dlg.close('cancel');
    renderPanel();
  });
}

function bindEvents(root) {
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'studio-gate') login(e.target);
    else if (e.target.id === 'studio-composer') sendChat($('#studio-chat-input').value);
    else if (e.target.id === 'studio-gen') submitGeneration(e.target);
  });

  root.addEventListener('input', (e) => {
    if (e.target.id === 'studio-chat-input') { S.drafts.chat = e.target.value; autosize(e.target); saveUi(); }
    if (e.target.id === 'studio-prompt') { S.drafts[S.tab] = e.target.value; saveUi(); }
  });

  root.addEventListener('keydown', (e) => {
    if (e.target.id === 'studio-chat-input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendChat(e.target.value);
    }
  });

  root.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.id === 'studio-model') {
      S.form[S.tab].model = el.value;
      normalizeForm(S.tab);
      saveUi();
      renderPanel();
    } else if (el.dataset.opt) {
      S.form[S.tab].options[el.dataset.opt] = JSON.parse(el.value);
      saveUi();
    } else if (el.matches('[data-src-file]') && el.files[0]) {
      const dataUrl = await readImage(el.files[0]).catch(() => null);
      if (!dataUrl) { toast(t('studio.gen.image.bad'), 'error'); return; }
      S.form.video.image = dataUrl;
      renderPanel();
    }
  });

  root.addEventListener('click', async (e) => {
    const el = e.target.closest('button, a');
    if (!el || !root.contains(el)) return;
    const d = el.dataset;

    if (d.studioTab) {
      if (S.tab === d.studioTab) return;
      S.tab = d.studioTab;
      saveUi();
      history.replaceState(null, '', `#${S.tab}`);
      renderPanel();
    } else if (el.matches('[data-pw-toggle]')) {
      const input = $('#studio-password');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      el.innerHTML = icon(show ? 'eyeOff' : 'eye');
      el.setAttribute('aria-label', t(show ? 'auth.hide' : 'auth.show'));
      el.setAttribute('aria-pressed', String(show));
    } else if (d.copyText) {
      copyText(d.copyText);
    } else if (d.preset) {
      const input = $('#studio-chat-input');
      if (!input) return;
      const text = t(`studio.chat.preset.${d.preset}.text`);
      input.value = text;
      S.drafts.chat = text;
      autosize(input);
      input.focus();
      const at = text.indexOf('…');
      if (at >= 0) input.setSelectionRange(at, at + 1);
    } else if (el.matches('[data-chat-stop]')) {
      S.streaming?.controller.abort();
    } else if (el.matches('[data-chat-new]')) {
      if (!(await confirmDialog(t('studio.chat.newConfirm.title'), t('studio.chat.newConfirm.text')))) return;
      S.chat = [];
      saveChat();
      renderPanel();
    } else if (el.matches('[data-chat-continue]')) {
      sendChat(t('studio.chat.continuePrompt'));
    } else if (d.msgCopy) {
      copyText(S.chat[Number(d.msgCopy)]?.content || '');
    } else if (d.msgTo) {
      const msg = S.chat[Number(d.i)];
      if (!msg) return;
      S.tab = d.msgTo;
      S.drafts[S.tab] = promptFromReply(msg.content);
      S.original[S.tab] = null;
      saveUi();
      history.replaceState(null, '', `#${S.tab}`);
      renderPanel();
      $('#studio-prompt')?.focus();
    } else if (el.matches('[data-copy-code]')) {
      copyText(el.closest('.md-code')?.querySelector('code')?.textContent || '');
    } else if (el.matches('[data-enhance]')) {
      enhancePrompt(S.tab);
    } else if (el.matches('[data-undo-enhance]')) {
      S.drafts[S.tab] = S.original[S.tab] ?? S.drafts[S.tab];
      S.original[S.tab] = null;
      saveUi();
      renderPanel();
    } else if (el.matches('[data-src-pick]')) {
      openLibraryPicker();
    } else if (el.matches('[data-src-remove]')) {
      S.form.video.image = null;
      renderPanel();
    } else if (d.libFilter) {
      S.libFilter = d.libFilter;
      saveUi();
      renderPanel();
    } else if (d.jobReuse) {
      const job = S.jobs.find((j) => j.localId === d.jobReuse);
      if (job) reuse(job);
    } else if (d.jobDismiss) {
      S.jobs = S.jobs.filter((j) => j.localId !== d.jobDismiss);
      saveJobs();
      refreshJobs();
    } else if (d.mediaDownload) {
      const { job, media, index } = findMedia(d.mediaDownload);
      if (media) download(media.url, fileName(job, media, index));
    } else if (d.mediaCopy) {
      const { media } = findMedia(d.mediaCopy);
      if (media) copyText(media.url, t('studio.media.linkCopied'));
    } else if (d.mediaAnimate) {
      const { job, media } = findMedia(d.mediaAnimate);
      if (!media) return;
      const i2v = modelsOf('video').find((m) => m.image);
      S.tab = 'video';
      S.form.video.model = i2v.id;
      normalizeForm('video');
      S.form.video.image = media.url;
      if (!S.drafts.video.trim()) S.drafts.video = job.prompt;
      saveUi();
      history.replaceState(null, '', '#video');
      renderPanel();
    } else if (d.mediaReuse) {
      const { job } = findMedia(d.mediaReuse);
      if (job) reuse(job);
    } else if (d.mediaDelete) {
      const { job, index } = findMedia(d.mediaDelete);
      if (!job) return;
      if (!(await confirmDialog(t('studio.media.deleteConfirm.title'), t('studio.media.deleteConfirm.text')))) return;
      job.media.splice(index, 1);
      if (!job.media.length) S.jobs = S.jobs.filter((j) => j !== job);
      saveJobs();
      refreshJobs();
    }
  });

  $('#studio-head')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-signout-studio]')) endSession(false);
  });
}

/* --------------------------------------------------------------- boot */
let started = false;
boot(() => {
  if (!started) {
    started = true;
    bindEvents($('#studio-root'));
    render();
    startup();
    return;
  }
  render(); // language switch
});
