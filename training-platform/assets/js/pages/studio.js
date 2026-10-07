// Owner-only AI studio, free of charge:
//   • Text: Cloudflare Workers AI free allowance (through api/studio.js), or a
//     language model that runs on this device with WebLLM: no limits, no keys.
//   • Images: Cloudflare Workers AI free allowance (FLUX), saved in this browser.
//   • Video: assembled here from images, captions and narration, then exported
//     with the browser's own recorder. Nothing is uploaded and nothing is billed.
import {
  app, boot, loadJSON, t, tx, esc, icon, safeUrl, toast, setTitle, confirmDialog, openModal,
  fmtNum, fmtDate, fmtClock, $, $$
} from '../app.js';

const API = '/api/studio';
const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';
const TOKEN_KEY = 'agilix.studio.token.v1';
const CHAT_KEY = 'agilix.studio.chat.v1';
const UI_KEY = 'agilix.studio.ui.v2';
const VIDEO_KEY = 'agilix.studio.video.v1';
const TABS = ['chat', 'image', 'video', 'library'];
const MARKERS = { continue: '[[continue]]', refused: '[[refused]]' };
const LOCAL_MAX_TOKENS = 1200;
const LOCAL_HISTORY_CHARS = 5000;
const MAX_SCENES = 12;
const isArabic = (s) => /[؀-ۿ]/.test(s);

const S = {
  phase: 'checking', // checking | offline | setup | gate | ready
  token: null,
  features: { cloud: false },
  cfg: { cloud: {}, local: { models: [] }, image: [], video: { sizes: { '16:9': [1280, 720] } } },
  gpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
  tab: 'chat',
  engine: 'cloud',
  localModel: '',
  local: { status: 'idle', progress: 0, text: '', error: '', engine: null, loadedId: null },
  chat: [],
  streaming: null,
  drafts: { chat: '', image: '' },
  original: null,
  enhancing: false,
  img: { model: '', ratio: '16:9', count: 1, pending: 0, error: '' },
  lib: [],
  libFilter: 'all',
  video: {
    format: '16:9', title: '', topic: '', sceneCount: 5, intro: true, outro: true, motion: true, fitAudio: true,
    scenes: [], audio: null, recording: null, scripting: false, filling: null, playing: null, rendering: null, resultId: null
  },
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
function saveUi() {
  writeJSON(UI_KEY, { tab: S.tab, engine: S.engine, localModel: S.localModel, libFilter: S.libFilter, drafts: S.drafts, img: { model: S.img.model, ratio: S.img.ratio, count: S.img.count } });
}
function saveVideo() {
  const v = S.video;
  writeJSON(VIDEO_KEY, {
    format: v.format, title: v.title, topic: v.topic, sceneCount: v.sceneCount, intro: v.intro, outro: v.outro, motion: v.motion, fitAudio: v.fitAudio,
    scenes: v.scenes.map(({ id, mediaId, text, duration, imagePrompt }) => ({ id, mediaId, text, duration, imagePrompt }))
  });
}
function loadSaved() {
  S.chat = readJSON(CHAT_KEY, []).filter((m) => m && typeof m.content === 'string');
  const ui = readJSON(UI_KEY, {});
  if (TABS.includes(ui.tab)) S.tab = ui.tab;
  if (['cloud', 'local'].includes(ui.engine)) S.engine = ui.engine;
  if (typeof ui.localModel === 'string') S.localModel = ui.localModel;
  if (['all', 'image', 'video'].includes(ui.libFilter)) S.libFilter = ui.libFilter;
  for (const k of ['chat', 'image']) if (typeof ui.drafts?.[k] === 'string') S.drafts[k] = ui.drafts[k];
  Object.assign(S.img, { model: ui.img?.model || '', ratio: ui.img?.ratio || '16:9', count: [1, 2, 3, 4].includes(ui.img?.count) ? ui.img.count : 1 });
  const v = readJSON(VIDEO_KEY, {});
  for (const k of ['format', 'title', 'topic']) if (typeof v[k] === 'string') S.video[k] = v[k];
  for (const k of ['intro', 'outro', 'motion', 'fitAudio']) if (typeof v[k] === 'boolean') S.video[k] = v[k];
  if (Number.isInteger(v.sceneCount)) S.video.sceneCount = v.sceneCount;
  if (Array.isArray(v.scenes)) S.video.scenes = v.scenes.filter((s) => s && s.id).slice(0, MAX_SCENES);
  const fromHash = location.hash.slice(1);
  if (TABS.includes(fromHash)) S.tab = fromHash;
}

/* ---------------------------------------------- media library (IndexedDB) */
let dbPromise;
function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('agilix-studio', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('media', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function store(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tr = db.transaction('media', mode);
    const req = fn(tr.objectStore('media'));
    tr.oncomplete = () => resolve(req?.result);
    tr.onerror = () => reject(tr.error);
    tr.onabort = () => reject(tr.error);
  });
}
const mediaAll = () => store('readonly', (s) => s.getAll());
const mediaPut = (item) => store('readwrite', (s) => s.put(item));
const mediaDelete = (id) => store('readwrite', (s) => s.delete(id));

const urlCache = new Map();
function urlOf(item) {
  if (!urlCache.has(item.id)) urlCache.set(item.id, URL.createObjectURL(item.blob));
  return urlCache.get(item.id);
}
const mediaById = (id) => S.lib.find((m) => m.id === id) || null;

async function addMedia(item) {
  const full = { id: uid(), createdAt: Date.now(), ...item };
  try {
    await mediaPut(full);
  } catch {
    toast(t('studio.lib.storageFull'), 'error');
    return null;
  }
  S.lib.unshift(full);
  return full;
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
  try { S.cfg = await loadJSON('data/studio.json'); } catch { /* keep defaults */ }
  if (!S.cfg.local.models.some((m) => m.id === S.localModel)) S.localModel = S.cfg.local.models[0]?.id || '';
  normalizeImageForm();
  if (!S.cfg.video.sizes[S.video.format]) S.video.format = Object.keys(S.cfg.video.sizes)[0];
  try { S.lib = (await mediaAll()).sort((a, b) => b.createdAt - a.createdAt); } catch { S.lib = []; }
  S.video.scenes.forEach((s) => { if (s.mediaId && !mediaById(s.mediaId)) s.mediaId = null; });
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
  if (S.phase === 'ready' && !S.features.cloud && S.gpu) S.engine = S.engine === 'cloud' ? 'local' : S.engine;
  render();
}

function endSession(expired = false) {
  S.token = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  S.streaming?.controller.abort();
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
    if (!S.features.cloud && S.gpu && S.engine === 'cloud') S.engine = 'local';
    render();
  } catch (err) {
    if (err.code === 'studio_not_configured') { S.phase = 'setup'; render(); return; }
    S.gateError = err.code === 'wrong_password' ? t('studio.gate.wrong')
      : err.code === 'too_many_attempts' ? t('studio.gate.locked') : errorText(err);
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
const excerpt = (s, n = 140) => (s.length > n ? `${s.slice(0, n).trim()}…` : s);
const imageModels = () => S.cfg.image || [];
const imageModel = () => imageModels().find((m) => m.id === S.img.model) || imageModels()[0] || null;
const localModelInfo = (id = S.localModel) => S.cfg.local.models.find((m) => m.id === id) || null;
const fmtMB = (bytes) => t('studio.lib.mb', { n: fmtNum(Math.max(0.1, bytes / 1048576), { maximumFractionDigits: 1 }) });
const textReady = () => (S.engine === 'local' ? S.local.status === 'ready' : S.features.cloud);

function normalizeImageForm() {
  const model = imageModel();
  if (!model) return;
  S.img.model = model.id;
  if (!model.sizes[S.img.ratio]) S.img.ratio = Object.keys(model.sizes)[0];
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

function downloadBlob(blob, name) {
  const href = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}

function fileName(item) {
  const ext = (item.mime || '').includes('mp4') ? 'mp4' : (item.mime || '').includes('webm') ? 'webm'
    : (item.mime || '').includes('png') ? 'png' : (item.mime || '').includes('webp') ? 'webp' : 'jpg';
  const stamp = new Date(item.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `agilix-${item.kind}-${stamp}.${ext}`;
}

function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Downscale an uploaded image and keep it as a JPEG blob. */
async function readImageFile(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  return { blob, width: canvas.width, height: canvas.height };
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

/** Safe Markdown for model replies: escapes first, then headings, lists, tables, quotes and code blocks. */
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

/* -------------------------------------------------------- text engines */
const LOCAL_SYSTEM = 'You are the content assistant of AGILIX, an Arabic/English online training platform. The name is always written "AGILIX" in Latin capitals, also inside Arabic text; never translate it. Reply in the language of the latest message; Arabic replies use clear Modern Standard Arabic. Give complete, ready-to-use answers with simple Markdown (headings, lists).';
const stripThinking = (text) => text.replace(/<think>[\s\S]*?(<\/think>|$)\s*/g, '');

function trimHistory(history) {
  const out = [];
  let size = 0;
  for (let i = history.length - 1; i >= 0 && out.length < 8; i--) {
    size += history[i].content.length;
    if (size > LOCAL_HISTORY_CHARS && out.length) break;
    out.unshift({ role: history[i].role, content: history[i].content.slice(-LOCAL_HISTORY_CHARS) });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

async function loadLocalModel() {
  if (S.local.status === 'loading') return;
  if (!S.gpu) { Object.assign(S.local, { status: 'error', error: t('studio.local.noGpu') }); renderPanel(); return; }
  Object.assign(S.local, { status: 'loading', progress: 0, text: '', error: '' });
  renderPanel();
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new StudioError('no_adapter');
    const progress = (report) => { S.local.progress = report.progress || 0; S.local.text = report.text || ''; paintLocalProgress(); };
    if (S.local.engine) {
      S.local.engine.setInitProgressCallback?.(progress);
      await S.local.engine.reload(S.localModel);
    } else {
      const lib = await import(WEBLLM_URL);
      const worker = new Worker(new URL('../studio-llm-worker.js', import.meta.url), { type: 'module' });
      S.local.engine = await lib.CreateWebWorkerMLCEngine(worker, S.localModel, { initProgressCallback: progress });
    }
    Object.assign(S.local, { status: 'ready', loadedId: S.localModel, progress: 1 });
    toast(t('studio.local.ready'));
  } catch (err) {
    const msg = String(err?.message || err || '');
    Object.assign(S.local, {
      status: 'error',
      error: err?.code === 'no_adapter' ? t('studio.local.noGpu')
        : /memory|OOM|device (was )?lost/i.test(msg) ? t('studio.local.noMemory')
          : t('studio.local.failed', { detail: excerpt(msg, 160) || '—' })
    });
  }
  if (S.phase === 'ready') renderPanel();
}

function paintLocalProgress() {
  const bar = $('#studio-local-bar');
  if (bar) bar.style.width = `${Math.round(S.local.progress * 100)}%`;
  const label = $('#studio-local-text');
  if (label) label.textContent = `${fmtNum(Math.round(S.local.progress * 100))}%`;
}

/** Streams a chat reply from the chosen engine; returns { text, status }. */
async function streamReply(history, onText, signal) {
  if (S.engine === 'local') {
    const engine = S.local.engine;
    const abort = () => engine.interruptGenerate();
    signal.addEventListener('abort', abort);
    let text = '';
    try {
      const chunks = await engine.chat.completions.create({
        messages: [{ role: 'system', content: LOCAL_SYSTEM }, ...trimHistory(history)],
        stream: true,
        max_tokens: LOCAL_MAX_TOKENS,
        extra_body: { enable_thinking: false }
      });
      let finish = null;
      for await (const chunk of chunks) {
        text += chunk.choices?.[0]?.delta?.content || '';
        finish = chunk.choices?.[0]?.finish_reason || finish;
        onText(stripThinking(text));
      }
      if (signal.aborted) throw new DOMException('stopped', 'AbortError');
      return { text: stripThinking(text), status: finish === 'length' ? 'cut' : 'done' };
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }
  const res = await api('chat', { body: { messages: history }, raw: true, signal });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(stripMarkers(text));
  }
  text += decoder.decode();
  for (const [status, marker] of [['cut', MARKERS.continue], ['refused', MARKERS.refused]]) {
    if (text.trimEnd().endsWith(marker)) return { text: text.trimEnd().slice(0, -marker.length).trimEnd(), status };
  }
  return { text, status: 'done' };
}

/** One complete answer from the chosen engine, for prompts and scripts. */
async function completeOnce(system, user, maxTokens = 900) {
  if (S.engine === 'local') {
    const reply = await S.local.engine.chat.completions.create({
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: maxTokens,
      extra_body: { enable_thinking: false }
    });
    return stripThinking(reply.choices?.[0]?.message?.content || '').trim();
  }
  const res = await api('chat', { body: { messages: [{ role: 'user', content: `${system}\n\n${user}` }] }, raw: true });
  return stripMarkers((await res.text()).trim());
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

/* ------------------------------------------------------------- render */
function renderHead() {
  const head = $('#studio-head');
  if (!head) return;
  const ready = S.phase === 'ready';
  const chip = (on, text) => `<span class="chip ${on ? 'chip--success' : 'chip--outline'}">${icon(on ? 'check' : 'info')}${esc(text)}</span>`;
  head.innerHTML = `<div class="studio-head">
    <div class="stack" style="gap:12px">
      <span class="eyebrow">${esc(t('studio.eyebrow'))}</span>
      <h1 class="h2">${esc(t('studio.title'))}</h1>
      <p class="lead">${esc(t('studio.lead'))}</p>
    </div>
    ${ready ? `<div class="studio-head__side">
      <div class="row">
        ${chip(S.features.cloud, t(S.features.cloud ? 'studio.service.cloudOn' : 'studio.service.cloudOff'))}
        ${chip(S.gpu, t(S.gpu ? 'studio.service.gpuOn' : 'studio.service.gpuOff'))}
      </div>
      <button type="button" class="btn btn--ghost btn--sm" data-signout-studio>${icon('logout', 'flip-rtl')}${esc(t('studio.signout'))}</button>
    </div>` : ''}
  </div>`;
}

function render() {
  if (painting) { repaint = true; return; }
  setTitle(t('studio.title'));
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
      ${row('CLOUDFLARE_ACCOUNT_ID', t('studio.setup.account'), 'studio.setup.forCloud')}
      ${row('CLOUDFLARE_API_TOKEN', t('studio.setup.token'), 'studio.setup.forCloud')}
    </ol>
    <p class="studio-off studio-off--info">${icon('info')}<span>${esc(t('studio.setup.free'))}</span></p>
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
  const count = S.lib.length;
  const tab = (id, ic) => `<button type="button" role="tab" class="tab" id="studio-tab-${id}" aria-controls="studio-panel" aria-selected="${S.tab === id}" data-studio-tab="${id}">${icon(ic)}${esc(t(`studio.tab.${id}`))}${id === 'library' && count ? `<span class="studio-count">${fmtNum(count)}</span>` : ''}</button>`;
  return `<div class="tabs studio-tabs" role="tablist" aria-label="${esc(t('studio.title'))}">
      ${tab('chat', 'chat')}${tab('image', 'image')}${tab('video', 'video')}${tab('library', 'grid')}
    </div>
    <div id="studio-panel" role="tabpanel" aria-labelledby="studio-tab-${S.tab}">${panelMarkup()}</div>`;
}

function panelMarkup() {
  if (S.tab === 'chat') return chatMarkup();
  if (S.tab === 'image') return imageMarkup();
  if (S.tab === 'video') return videoMarkup();
  return libraryMarkup();
}

// Replacing the panel blurs a focused field, which can fire its change handler (and
// another render) in the middle of the swap; such nested renders run right after.
let painting = false;
let repaint = false;
function renderPanel() {
  const panel = $('#studio-panel');
  if (!panel) return render();
  if (painting) { repaint = true; return; }
  painting = true;
  try {
    $$('[data-studio-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.studioTab === S.tab)));
    panel.setAttribute('aria-labelledby', `studio-tab-${S.tab}`);
    panel.innerHTML = panelMarkup();
  } finally {
    painting = false;
  }
  if (repaint) { repaint = false; renderPanel(); return; }
  afterPanelRender();
}

function refreshLibraryCount() {
  const tabLib = $('#studio-tab-library');
  if (tabLib) tabLib.innerHTML = `${icon('grid')}${esc(t('studio.tab.library'))}${S.lib.length ? `<span class="studio-count">${fmtNum(S.lib.length)}</span>` : ''}`;
}

function afterPanelRender() {
  if (S.tab === 'chat') {
    const log = $('#studio-log');
    if (log) log.scrollTop = log.scrollHeight;
    autosize($('#studio-chat-input'));
  }
  if (S.tab === 'video') drawPreviewStill();
}

const offNote = (key, vars) => `<p class="studio-off">${icon('info')}<span>${esc(t(key, vars))}</span></p>`;

/* ------------------------------------------------------------ engines UI */
function engineMarkup() {
  const seg = (id, ic, label) => `<label class="seg__item"><input type="radio" name="studio-engine" value="${id}" data-engine${S.engine === id ? ' checked' : ''}><span>${icon(ic)}${esc(t(label))}</span></label>`;
  return `<div class="studio-engine">
    <div class="seg" role="radiogroup" aria-label="${esc(t('studio.engine.label'))}">${seg('cloud', 'globe', 'studio.engine.cloud')}${seg('local', 'shield', 'studio.engine.local')}</div>
    ${S.engine === 'local' ? localMarkup() : (S.features.cloud ? `<p class="studio-engine__hint">${icon('info')}<span>${esc(t('studio.engine.cloudHint', { model: S.cfg.cloud.chatLabel || 'Gemma' }))}</span></p>` : offNote('studio.engine.cloudOff'))}
  </div>`;
}

function localMarkup() {
  if (!S.gpu) return offNote('studio.local.noGpu');
  const info = localModelInfo();
  const l = S.local;
  const loaded = l.status === 'ready' && l.loadedId === S.localModel;
  return `<div class="studio-local">
    <div class="studio-local__row">
      <label class="sr-only" for="studio-local-model">${esc(t('studio.local.model'))}</label>
      <select class="select" id="studio-local-model"${l.status === 'loading' ? ' disabled' : ''}>${S.cfg.local.models.map((m) => `<option value="${esc(m.id)}"${m.id === S.localModel ? ' selected' : ''}>${esc(tx(m.label))}</option>`).join('')}</select>
      ${loaded
        ? `<span class="chip chip--success">${icon('check')}${esc(t('studio.local.loaded'))}</span>`
        : `<button type="button" class="btn btn--ink btn--sm" data-local-load${l.status === 'loading' ? ' disabled' : ''}>${l.status === 'loading' ? '<span class="spinner"></span>' : icon('download')}${esc(t(l.status === 'loading' ? 'studio.local.loading' : 'studio.local.load'))}</button>`}
    </div>
    ${l.status === 'loading' ? `<div class="studio-progress" role="progressbar" aria-label="${esc(t('studio.local.loading'))}"><span id="studio-local-bar" style="width:${Math.round(l.progress * 100)}%"></span></div><p class="studio-engine__hint"><span id="studio-local-text">${fmtNum(Math.round(l.progress * 100))}%</span> · ${esc(t('studio.local.firstTime'))}</p>` : ''}
    ${l.status === 'error' ? `<p class="studio-error" role="alert">${esc(l.error)}</p>` : ''}
    ${!loaded && l.status !== 'loading' && info ? `<p class="studio-engine__hint">${icon('info')}<span>${esc(t('studio.local.size', { gb: fmtNum(info.download), vram: fmtNum(info.vram) }))}</span></p>` : ''}
  </div>`;
}

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
      ${engineMarkup()}
      <button type="button" class="btn btn--ghost btn--sm studio-chat__new" data-chat-new aria-label="${esc(t('studio.chat.new'))}"${S.chat.length && !busy ? '' : ' disabled'}>${icon('refresh')}<span>${esc(t('studio.chat.new'))}</span></button>
    </div>
    <div class="studio-chat__log" id="studio-log">${log}</div>
    <form class="studio-composer" id="studio-composer">
      <label class="sr-only" for="studio-chat-input">${esc(t('studio.chat.placeholder'))}</label>
      <textarea class="textarea" id="studio-chat-input" rows="1" dir="auto" placeholder="${esc(t('studio.chat.placeholder'))}"${textReady() ? '' : ' disabled'}>${esc(S.drafts.chat)}</textarea>
      ${busy
        ? `<button type="button" class="btn btn--ink studio-composer__btn" data-chat-stop aria-label="${esc(t('studio.chat.stop'))}">${icon('stop')}</button>`
        : `<button type="submit" class="btn btn--primary studio-composer__btn" aria-label="${esc(t('studio.chat.send'))}"${textReady() ? '' : ' disabled'}>${icon('send', 'flip-rtl')}</button>`}
    </form>
  </div>`;
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
  const body = m.content ? renderMarkdown(m.content) : (streaming ? `<span class="studio-typing" aria-label="${esc(t('studio.chat.writing'))}"><i></i><i></i><i></i></span>` : '');
  const actions = !streaming && m.content ? `<div class="smsg__actions">
      <button type="button" class="link-btn" data-msg-copy="${i}">${icon('copy')}${esc(t('studio.chat.copy'))}</button>
      <button type="button" class="link-btn" data-msg-to="image" data-i="${i}">${icon('image')}${esc(t('studio.chat.toImage'))}</button>
      <button type="button" class="link-btn" data-msg-to="video" data-i="${i}">${icon('video')}${esc(t('studio.chat.toVideo'))}</button>
    </div>` : '';
  const via = m.engine ? `<span class="smsg__via">${esc(t(m.engine === 'local' ? 'studio.engine.local' : 'studio.engine.cloud'))}</span>` : '';
  return `<div class="smsg smsg--bot" data-msg="${i}">
    <span class="smsg__avatar" aria-hidden="true">${icon('sparkles')}</span>
    <div class="smsg__main"><div class="smsg__body md" dir="auto">${body}</div>${messageNote(m)}${actions}${via}</div>
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
    el.innerHTML = renderMarkdown(S.chat[i].content) || el.innerHTML;
    if (nearBottom) log.scrollTop = log.scrollHeight;
  });
}

async function sendChat(text) {
  text = String(text || '').trim();
  if (!text || S.streaming || !textReady()) return;
  const history = S.chat.filter((m) => m.content).map(({ role, content }) => ({ role, content }));
  history.push({ role: 'user', content: text });
  S.chat.push({ role: 'user', content: text });
  const reply = { role: 'assistant', content: '', status: 'streaming', engine: S.engine };
  S.chat.push(reply);
  S.drafts.chat = '';
  saveUi();
  const controller = new AbortController();
  S.streaming = { controller };
  if (S.tab === 'chat') renderPanel();

  try {
    const out = await streamReply(history, (partial) => { reply.content = partial; paintStreaming(); }, controller.signal);
    reply.content = out.text;
    reply.status = out.status;
  } catch (err) {
    reply.content = stripMarkers(reply.content);
    if (err.name === 'AbortError') reply.status = 'stopped';
    else {
      reply.status = 'error';
      reply.error = S.engine === 'local' ? t('studio.local.failed', { detail: excerpt(String(err?.message || err), 160) }) : errorText(err);
    }
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
  return (block ? block[1] : text).trim().slice(0, 2000);
}

/* ------------------------------------------------------------- images */
function imageMarkup() {
  const model = imageModel();
  const on = S.features.cloud;
  const recent = S.lib.filter((m) => m.kind === 'image').slice(0, 12);
  const pending = Array.from({ length: S.img.pending }, () => `<article class="studio-job" style="aspect-ratio:${ratioCss(model?.sizes[S.img.ratio])}"><span class="studio-job__shimmer" aria-hidden="true"></span><div class="studio-job__text"><span class="chip chip--soft"><span class="spinner"></span>${esc(t('studio.img.generating'))}</span></div></article>`).join('');
  return `<div class="studio-gen">
    <form class="card studio-gen__form" id="studio-img-form" novalidate>
      ${on ? '' : offNote('studio.img.off')}
      <div class="field">
        <div class="studio-gen__labelrow">
          <label for="studio-prompt">${esc(t('studio.gen.prompt'))}</label>
          ${textReady() ? `<button type="button" class="link-btn" data-enhance${S.enhancing ? ' disabled' : ''}>${S.enhancing ? '<span class="spinner"></span>' : icon('sparkles')}${esc(t(S.enhancing ? 'studio.gen.enhancing' : 'studio.gen.enhance'))}</button>` : ''}
        </div>
        <textarea class="textarea" id="studio-prompt" dir="auto" placeholder="${esc(t('studio.gen.placeholder'))}">${esc(S.drafts.image)}</textarea>
        ${S.original != null ? `<p class="field__hint">${esc(t('studio.gen.enhanced'))} <button type="button" class="link-btn" data-undo-enhance>${esc(t('studio.gen.undo'))}</button></p>` : ''}
      </div>
      ${imageModels().length > 1 ? `<div class="field">
        <label for="studio-model">${esc(t('studio.gen.model'))}</label>
        <select class="select" id="studio-model">${imageModels().map((m) => `<option value="${esc(m.id)}"${m.id === model?.id ? ' selected' : ''}>${esc(tx(m.label))}</option>`).join('')}</select>
        ${model?.hint ? `<p class="field__hint">${esc(tx(model.hint))}</p>` : ''}
      </div>` : ''}
      ${model && Object.keys(model.sizes).length > 1 ? `<fieldset class="studio-opt"><legend>${esc(t('studio.gen.ratio'))}</legend><div class="seg">${Object.keys(model.sizes).map((r) => `<label class="seg__item"><input type="radio" name="studio-ratio" value="${esc(r)}" data-img-ratio${r === S.img.ratio ? ' checked' : ''}><span>${esc(r)}</span></label>`).join('')}</div></fieldset>` : ''}
      <fieldset class="studio-opt"><legend>${esc(t('studio.gen.count'))}</legend><div class="seg">${[1, 2, 3, 4].map((n) => `<label class="seg__item"><input type="radio" name="studio-count" value="${n}" data-img-count${n === S.img.count ? ' checked' : ''}><span>${fmtNum(n)}</span></label>`).join('')}</div></fieldset>
      <p class="studio-gen__cost">${icon('info')}<span>${esc(t('studio.img.quota', { n: fmtNum(Math.floor((S.cfg.cloud.dailyNeurons || 10000) / (model?.neurons || 100))) }))}</span></p>
      <p class="studio-error" role="alert"${S.img.error ? '' : ' hidden'}>${esc(S.img.error)}</p>
      <button type="submit" class="btn btn--primary btn--lg btn--block"${on && model && !S.img.pending ? '' : ' disabled'}>${icon('sparkles')}${esc(t('studio.img.submit'))}</button>
    </form>
    <section class="studio-gen__results" aria-labelledby="studio-results-title">
      <h2 class="h4" id="studio-results-title">${esc(t('studio.gen.results'))}</h2>
      <div class="studio-grid" id="studio-results">${pending}${recent.map(mediaMarkup).join('')}${!pending && !recent.length ? `<p class="studio-grid__empty muted">${icon('image')}<span>${esc(t('studio.img.empty'))}</span></p>` : ''}</div>
    </section>
  </div>`;
}

function ratioCss(size) {
  return size ? `${size[0]} / ${size[1]}` : '16 / 9';
}

async function generateImages() {
  const prompt = S.drafts.image.trim();
  const model = imageModel();
  if (!prompt) { S.img.error = t('studio.gen.need'); renderPanel(); $('#studio-prompt')?.focus(); return; }
  S.img.error = '';
  S.img.pending = S.img.count;
  renderPanel();
  for (let i = 0; i < S.img.count; i++) {
    try {
      const r = await api('image', { body: { model: model.id, prompt, ratio: S.img.ratio } });
      await addMedia({ kind: 'image', blob: base64ToBlob(r.image, r.mime), mime: r.mime, prompt, model: model.id, width: r.width, height: r.height, source: 'cloud' });
    } catch (err) {
      if (err.code === 'session') return;
      S.img.error = errorText(err);
      S.img.pending = 0;
      break;
    }
    S.img.pending = Math.max(0, S.img.pending - 1);
    if (S.tab === 'image') renderPanel(); else refreshLibraryCount();
  }
  S.img.pending = 0;
  if (!S.img.error) toast(t('studio.img.done'));
  if (S.phase === 'ready') { if (S.tab === 'image') renderPanel(); refreshLibraryCount(); }
}

async function enhancePrompt() {
  const brief = S.drafts.image.trim();
  if (!brief) { S.img.error = t('studio.gen.need'); renderPanel(); return; }
  S.enhancing = true;
  renderPanel();
  try {
    let prompt;
    if (S.engine === 'local') {
      prompt = await completeOnce('Rewrite the brief (often Arabic) as one English prompt for a text-to-image model: subject, composition, setting, lighting, colours and style, at most 90 words. The brand name is always "AGILIX". Answer with the prompt only.', brief, 300);
    } else {
      ({ prompt } = await api('enhance', { body: { prompt: brief, kind: 'image' } }));
    }
    prompt = prompt.replace(/^["“]|["”]$/g, '').trim();
    if (prompt) { S.original = brief; S.drafts.image = prompt; saveUi(); }
  } catch (err) {
    if (err.code !== 'session') toast(errorText(err) || t('studio.error.generic'), 'error');
  }
  S.enhancing = false;
  if (S.phase === 'ready' && S.tab === 'image') renderPanel();
}

/* ------------------------------------------------------- media cards */
function mediaMarkup(item) {
  const url = urlOf(item);
  const btn = (attr, ic, label) => `<button type="button" class="icon-btn icon-btn--sm" ${attr}="${item.id}" title="${esc(label)}" aria-label="${esc(label)}">${icon(ic)}</button>`;
  const ratio = item.width && item.height ? `${item.width} / ${item.height}` : '16 / 9';
  const label = item.kind === 'video' ? (item.prompt || t('studio.lib.video')) : (item.prompt || t('studio.lib.upload'));
  const meta = [item.kind === 'video' ? fmtClock(Math.round(item.duration || 0)) : (item.source === 'upload' ? t('studio.lib.uploaded') : t('studio.lib.generated')), fmtMB(item.blob?.size || 0), fmtDate(item.createdAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })];
  return `<figure class="studio-media" data-media="${item.id}">
    <div class="studio-media__frame" style="aspect-ratio:${ratio}">
      ${item.kind === 'video'
        ? `<video src="${url}" controls playsinline preload="metadata"></video>`
        : `<img src="${url}" alt="${esc(excerpt(label, 120))}" loading="lazy">`}
    </div>
    <figcaption>
      <p class="studio-media__prompt" dir="auto" title="${esc(label)}">${esc(excerpt(label, 110))}</p>
      <small class="muted">${esc(meta.join(' · '))}</small>
      <div class="studio-media__actions">
        ${btn('data-media-download', 'download', t('studio.media.download'))}
        ${item.kind === 'image' ? btn('data-media-scene', 'video', t('studio.media.toScene')) : ''}
        ${item.kind === 'image' && item.prompt ? btn('data-media-reuse', 'edit', t('studio.media.reuse')) : ''}
        ${btn('data-media-delete', 'trash', t('studio.media.delete'))}
      </div>
    </figcaption>
  </figure>`;
}

function libraryMarkup() {
  const items = S.lib.filter((m) => S.libFilter === 'all' || m.kind === S.libFilter);
  const size = S.lib.reduce((n, m) => n + (m.blob?.size || 0), 0);
  const filter = (id, label) => `<button type="button" class="chip${S.libFilter === id ? ' is-active' : ''}" data-lib-filter="${id}" aria-pressed="${S.libFilter === id}">${esc(t(label))}</button>`;
  return `<div class="studio-lib">
    <div class="studio-lib__bar">
      <div class="row">${filter('all', 'studio.library.all')}${filter('image', 'studio.library.images')}${filter('video', 'studio.library.videos')}</div>
      <div class="row">
        <span class="muted">${esc(t('studio.library.count', { n: fmtNum(S.lib.length) }))} · ${esc(fmtMB(size))}</span>
        <label class="btn btn--ghost btn--sm studio-upload">${icon('upload')}${esc(t('studio.lib.uploadBtn'))}<input type="file" accept="image/png,image/jpeg,image/webp" multiple data-lib-upload></label>
      </div>
    </div>
    <p class="studio-off studio-off--info">${icon('info')}<span>${esc(t('studio.library.note'))}</span></p>
    <div class="studio-grid studio-grid--lib">${items.length ? items.map(mediaMarkup).join('') : `<p class="studio-grid__empty muted">${icon('grid')}<span>${esc(t('studio.library.empty'))}</span></p>`}</div>
  </div>`;
}

async function uploadImages(files, sceneId = null) {
  let last = null;
  for (const file of files) {
    try {
      const { blob, width, height } = await readImageFile(file);
      last = await addMedia({ kind: 'image', blob, mime: 'image/jpeg', prompt: '', model: '', width, height, source: 'upload', name: file.name });
    } catch {
      toast(t('studio.gen.image.bad'), 'error');
    }
  }
  if (last && sceneId) {
    const scene = S.video.scenes.find((s) => s.id === sceneId);
    if (scene) { scene.mediaId = last.id; saveVideo(); }
  }
  refreshLibraryCount();
  return last;
}

function openLibraryPicker(onPick) {
  const images = S.lib.filter((m) => m.kind === 'image');
  const dlg = openModal({
    title: t('studio.gen.image.pickTitle'),
    size: 'modal--lg',
    body: images.length
      ? `<div class="studio-picker">${images.map((m) => `<button type="button" class="studio-picker__item" data-pick="${m.id}"><img src="${urlOf(m)}" alt="${esc(excerpt(m.prompt || '', 80))}" loading="lazy"></button>`).join('')}</div>`
      : `<p class="muted">${esc(t('studio.gen.image.emptyLib'))}</p>`
  });
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    onPick(b.dataset.pick);
    dlg.close('cancel');
  });
}

/* -------------------------------------------------------------- video */
const newScene = (text = '', imagePrompt = '', mediaId = null) => ({ id: uid(), mediaId, text, imagePrompt, duration: autoDuration(text) });
function autoDuration(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.min(10, Math.round((2 + words * 0.42) * 2) / 2));
}
const videoSize = () => S.cfg.video.sizes[S.video.format] || [1280, 720];

function videoMarkup() {
  const v = S.video;
  const busy = !!(v.rendering || v.playing || v.scripting || v.filling);
  const total = timelineLength();
  const result = v.resultId ? mediaById(v.resultId) : null;
  const scenes = v.scenes.map((s, i) => sceneMarkup(s, i, busy)).join('');
  const formatSeg = Object.keys(S.cfg.video.sizes).map((f) => `<label class="seg__item"><input type="radio" name="studio-format" value="${esc(f)}" data-video-format${f === v.format ? ' checked' : ''}${busy ? ' disabled' : ''}><span>${esc(f)}</span></label>`).join('');
  const toggle = (key, label) => `<label class="check"><input type="checkbox" data-video-toggle="${key}"${v[key] ? ' checked' : ''}${busy ? ' disabled' : ''}><span>${esc(t(label))}</span></label>`;
  const audio = v.audio;
  return `<div class="studio-video">
    <div class="studio-video__edit">
      <section class="card studio-script">
        <h2 class="h4">${icon('sparkles')}${esc(t('studio.video.scriptTitle'))}</h2>
        <p class="muted">${esc(t('studio.video.scriptText'))}</p>
        <div class="field">
          <label for="studio-topic">${esc(t('studio.video.topic'))}</label>
          <textarea class="textarea studio-script__topic" id="studio-topic" dir="auto" placeholder="${esc(t('studio.video.topicPlaceholder'))}"${busy ? ' disabled' : ''}>${esc(v.topic)}</textarea>
        </div>
        <div class="studio-script__row">
          <label class="studio-script__count"><span>${esc(t('studio.video.sceneCount'))}</span>
            <select class="select" id="studio-scene-count"${busy ? ' disabled' : ''}>${[3, 4, 5, 6, 7, 8].map((n) => `<option value="${n}"${n === v.sceneCount ? ' selected' : ''}>${fmtNum(n)}</option>`).join('')}</select></label>
          <button type="button" class="btn btn--primary" data-video-script${textReady() && !busy ? '' : ' disabled'}>${v.scripting ? '<span class="spinner"></span>' : icon('sparkles')}${esc(t(v.scripting ? 'studio.video.scripting' : 'studio.video.writeScript'))}</button>
        </div>
        ${textReady() ? '' : offNote('studio.video.needText')}
      </section>

      <section class="card studio-scenes">
        <div class="studio-scenes__head">
          <h2 class="h4">${esc(t('studio.video.scenes'))} <span class="muted">(${fmtNum(v.scenes.length)})</span></h2>
          <div class="row">
            ${S.features.cloud ? `<button type="button" class="btn btn--accent btn--sm" data-video-fill${v.scenes.some((s) => !s.mediaId) && !busy ? '' : ' disabled'}>${v.filling ? '<span class="spinner"></span>' : icon('image')}${esc(v.filling ? t('studio.video.filling', { done: fmtNum(v.filling.done), total: fmtNum(v.filling.total) }) : t('studio.video.fillImages'))}</button>` : ''}
            <button type="button" class="btn btn--ghost btn--sm" data-scene-add${v.scenes.length >= MAX_SCENES || busy ? ' disabled' : ''}>${icon('plus')}${esc(t('studio.video.addScene'))}</button>
          </div>
        </div>
        <ol class="studio-scenes__list">${scenes || `<li class="studio-grid__empty muted">${icon('video')}<span>${esc(t('studio.video.noScenes'))}</span></li>`}</ol>
      </section>

      <section class="card studio-vset">
        <h2 class="h4">${esc(t('studio.video.settings'))}</h2>
        <fieldset class="studio-opt"><legend>${esc(t('studio.gen.ratio'))}</legend><div class="seg">${formatSeg}</div></fieldset>
        <div class="field">
          <label for="studio-video-title">${esc(t('studio.video.title'))}</label>
          <input class="input" id="studio-video-title" dir="auto" value="${esc(v.title)}" placeholder="${esc(t('studio.video.titlePlaceholder'))}"${busy ? ' disabled' : ''}>
        </div>
        <div class="studio-vset__toggles">${toggle('intro', 'studio.video.intro')}${toggle('outro', 'studio.video.outro')}${toggle('motion', 'studio.video.motion')}</div>
        <div class="field">
          <span class="label">${esc(t('studio.video.audio'))}</span>
          ${audio ? `<div class="studio-audio">
              <audio src="${audio.url}" controls preload="metadata"></audio>
              <span class="muted">${esc(audio.name)} · ${fmtClock(Math.round(audio.duration))}</span>
              <button type="button" class="icon-btn icon-btn--sm" data-audio-remove aria-label="${esc(t('studio.video.audioRemove'))}"${busy ? ' disabled' : ''}>${icon('trash')}</button>
            </div>
            ${toggle('fitAudio', 'studio.video.fitAudio')}`
          : `<div class="row">
              ${v.recording
                ? `<button type="button" class="btn btn--danger btn--sm" data-audio-stop>${icon('stop')}${esc(t('studio.video.recStop'))} · <span data-rec-clock dir="ltr">00:00</span></button>`
                : `<button type="button" class="btn btn--ghost btn--sm" data-audio-record${busy ? ' disabled' : ''}>${icon('live')}${esc(t('studio.video.record'))}</button>`}
              <label class="btn btn--ghost btn--sm studio-upload">${icon('upload')}${esc(t('studio.video.audioUpload'))}<input type="file" accept="audio/*" data-audio-file${busy ? ' disabled' : ''}></label>
            </div>
            <p class="field__hint">${esc(t('studio.video.audioHint'))}</p>`}
        </div>
      </section>
    </div>

    <aside class="card studio-video__preview">
      <div class="studio-canvas" style="aspect-ratio:${videoSize()[0]} / ${videoSize()[1]}"><canvas id="studio-canvas" width="${videoSize()[0]}" height="${videoSize()[1]}" aria-label="${esc(t('studio.video.preview'))}"></canvas></div>
      <p class="studio-video__len muted">${esc(t('studio.video.length', { time: fmtClock(Math.round(total)) }))}</p>
      ${v.rendering ? `<div class="studio-progress" role="progressbar" aria-label="${esc(t('studio.video.rendering'))}"><span id="studio-render-bar" style="width:${Math.round(v.rendering.progress * 100)}%"></span></div>
        <p class="studio-engine__hint">${icon('info')}<span>${esc(t('studio.video.keepOpen'))}</span></p>` : ''}
      <div class="studio-video__actions">
        ${v.playing
          ? `<button type="button" class="btn btn--ghost" data-video-stop>${icon('stop')}${esc(t('studio.video.stop'))}</button>`
          : `<button type="button" class="btn btn--ghost" data-video-play${v.scenes.length && !busy ? '' : ' disabled'}>${icon('play')}${esc(t('studio.video.play'))}</button>`}
        ${v.rendering
          ? `<button type="button" class="btn btn--danger" data-video-cancel>${icon('close')}${esc(t('studio.video.cancel'))}</button>`
          : `<button type="button" class="btn btn--primary" data-video-render${v.scenes.length && !busy ? '' : ' disabled'}>${icon('download')}${esc(t('studio.video.render'))}</button>`}
      </div>
      <p class="field__hint">${esc(t('studio.video.renderHint'))}</p>
      ${result ? `<div class="studio-video__result">
          <video src="${urlOf(result)}" controls playsinline preload="metadata"></video>
          <div class="row"><button type="button" class="btn btn--primary btn--sm" data-media-download="${result.id}">${icon('download')}${esc(t('studio.media.download'))}</button><span class="muted">${esc(fmtMB(result.blob.size))} · ${esc((result.mime || '').split(';')[0])}</span></div>
        </div>` : ''}
    </aside>
  </div>`;
}

function sceneMarkup(s, i, busy) {
  const media = s.mediaId ? mediaById(s.mediaId) : null;
  const last = S.video.scenes.length - 1;
  return `<li class="studio-scene" data-scene="${s.id}">
    <div class="studio-scene__thumb" style="aspect-ratio:${videoSize()[0]} / ${videoSize()[1]}">
      ${media ? `<img src="${urlOf(media)}" alt="">` : `<span>${icon('image')}</span>`}
      <b class="studio-scene__num">${fmtNum(i + 1)}</b>
    </div>
    <div class="studio-scene__body">
      <label class="sr-only" for="scene-text-${s.id}">${esc(t('studio.video.caption'))}</label>
      <textarea class="textarea" id="scene-text-${s.id}" dir="auto" rows="2" data-scene-text="${s.id}" placeholder="${esc(t('studio.video.caption'))}"${busy ? ' disabled' : ''}>${esc(s.text)}</textarea>
      <div class="studio-scene__tools">
        <button type="button" class="link-btn" data-scene-pick="${s.id}"${busy ? ' disabled' : ''}>${icon('grid')}${esc(t('studio.gen.image.pick'))}</button>
        <label class="link-btn studio-upload">${icon('upload')}${esc(t('studio.gen.image.upload'))}<input type="file" accept="image/png,image/jpeg,image/webp" data-scene-file="${s.id}"${busy ? ' disabled' : ''}></label>
        ${S.features.cloud ? `<button type="button" class="link-btn" data-scene-gen="${s.id}"${busy ? ' disabled' : ''}>${icon('sparkles')}${esc(t('studio.video.genImage'))}</button>` : ''}
        <label class="studio-scene__dur"><span>${esc(t('studio.video.seconds'))}</span><input class="input" type="number" min="2" max="30" step="0.5" value="${s.duration}" data-scene-dur="${s.id}"${busy ? ' disabled' : ''}></label>
      </div>
      ${s.imagePrompt ? `<p class="studio-scene__prompt" dir="auto" title="${esc(s.imagePrompt)}">${icon('image')}${esc(excerpt(s.imagePrompt, 90))}</p>` : ''}
    </div>
    <div class="studio-scene__order">
      <button type="button" class="icon-btn icon-btn--sm" data-scene-up="${s.id}" aria-label="${esc(t('studio.video.up'))}"${i === 0 || busy ? ' disabled' : ''}>${icon('chevronDown', 'studio-flip')}</button>
      <button type="button" class="icon-btn icon-btn--sm" data-scene-down="${s.id}" aria-label="${esc(t('studio.video.down'))}"${i === last || busy ? ' disabled' : ''}>${icon('chevronDown')}</button>
      <button type="button" class="icon-btn icon-btn--sm" data-scene-del="${s.id}" aria-label="${esc(t('studio.video.delScene'))}"${busy ? ' disabled' : ''}>${icon('trash')}</button>
    </div>
  </li>`;
}

/** Parses the model's script reply into { title, scenes }. */
function parseScript(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(text.slice(start, end + 1));
    const scenes = (Array.isArray(data.scenes) ? data.scenes : [])
      .map((s) => ({ text: String(s?.text || s?.caption || '').trim(), imagePrompt: String(s?.image_prompt || s?.imagePrompt || '').trim() }))
      .filter((s) => s.text);
    return scenes.length ? { title: String(data.title || '').trim(), scenes } : null;
  } catch {
    return null;
  }
}

async function writeScript() {
  const v = S.video;
  const topic = v.topic.trim();
  if (!topic) { toast(t('studio.video.needTopic'), 'error'); $('#studio-topic')?.focus(); return; }
  if (v.scenes.length && !(await confirmDialog(t('studio.video.replaceTitle'), t('studio.video.replaceText')))) return;
  const lang = isArabic(topic) || app.lang === 'ar' ? 'Arabic (Modern Standard Arabic)' : 'English';
  const system = 'You write short scripts for AGILIX training videos. The name is always "AGILIX" in Latin capitals. Reply with JSON only, no Markdown and no commentary.';
  const user = `Topic: ${topic}
Write a video script with exactly ${v.sceneCount} scenes, as JSON: {"title":"…","scenes":[{"text":"…","image_prompt":"…"}]}
- "title": a short video title in ${lang}.
- "text": the caption shown and spoken in that scene, in ${lang}, one or two short sentences, at most 22 words.
- "image_prompt": an English description of a photo or illustration for that scene, with no words or letters in the image.`;
  v.scripting = true;
  renderPanel();
  try {
    let parsed = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) parsed = parseScript(await completeOnce(system, user, 1400));
    if (!parsed) throw new StudioError('bad_script');
    v.title = parsed.title || v.title;
    v.scenes = parsed.scenes.slice(0, MAX_SCENES).map((s) => newScene(s.text, s.imagePrompt));
    saveVideo();
    toast(t('studio.video.scriptDone'));
  } catch (err) {
    if (err.code !== 'session') toast(err.code === 'bad_script' ? t('studio.video.badScript') : (S.engine === 'local' ? t('studio.local.failed', { detail: excerpt(String(err?.message || ''), 120) }) : errorText(err)), 'error');
  }
  v.scripting = false;
  if (S.phase === 'ready' && S.tab === 'video') renderPanel();
}

const videoRatioForImages = () => (S.video.format === '9:16' ? '9:16' : S.video.format === '1:1' ? '1:1' : '16:9');

async function generateSceneImage(scene) {
  const model = imageModels().find((m) => m.sizes[videoRatioForImages()]) || imageModels()[0];
  const prompt = (scene.imagePrompt || scene.text).trim();
  if (!prompt) return false;
  const r = await api('image', { body: { model: model.id, prompt, ratio: videoRatioForImages() } });
  const item = await addMedia({ kind: 'image', blob: base64ToBlob(r.image, r.mime), mime: r.mime, prompt, model: model.id, width: r.width, height: r.height, source: 'cloud' });
  if (!item) return false;
  scene.mediaId = item.id;
  saveVideo();
  return true;
}

async function fillSceneImages(only = null) {
  const v = S.video;
  const targets = only ? [only] : v.scenes.filter((s) => !s.mediaId && (s.imagePrompt || s.text));
  if (!targets.length) return;
  v.filling = { done: 0, total: targets.length };
  renderPanel();
  for (const scene of targets) {
    try {
      await generateSceneImage(scene);
    } catch (err) {
      if (err.code !== 'session') toast(errorText(err), 'error');
      break;
    }
    v.filling.done += 1;
    if (S.tab === 'video') renderPanel();
  }
  v.filling = null;
  refreshLibraryCount();
  if (S.phase === 'ready' && S.tab === 'video') renderPanel();
}

/* ------------------------------------------------------ audio narration */
async function decodeDuration(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    return buffer.duration;
  } finally {
    ctx.close();
  }
}

async function setAudio(blob, name) {
  try {
    const duration = await decodeDuration(blob);
    if (S.video.audio) URL.revokeObjectURL(S.video.audio.url);
    S.video.audio = { blob, name, duration, url: URL.createObjectURL(blob) };
  } catch {
    toast(t('studio.video.audioBad'), 'error');
  }
  renderPanel();
}

let recClock = null;
async function startRecording() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    toast(t('studio.video.micDenied'), 'error');
    return;
  }
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    stream.getTracks().forEach((tr) => tr.stop());
    clearInterval(recClock);
    S.video.recording = null;
    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
    if (blob.size) setAudio(blob, t('studio.video.recorded')); else renderPanel();
  };
  rec.start(250);
  S.video.recording = { rec, startedAt: Date.now() };
  renderPanel();
  recClock = setInterval(() => {
    const el = $('[data-rec-clock]');
    if (el) el.textContent = fmtClock(Math.round((Date.now() - S.video.recording.startedAt) / 1000));
  }, 500);
}

/* ------------------------------------------------------- video engine */
const assets = {};
async function loadImage(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}
async function brandAssets() {
  assets.logo ??= await loadImage('assets/img/logo-bilingual-white.svg').catch(() => null);
  assets.mark ??= await loadImage('assets/img/logo-white.svg').catch(() => null);
  try { await Promise.all([document.fonts.load('700 40px Tajawal'), document.fonts.load('600 40px Poppins')]); } catch { /* fallback fonts */ }
  return assets;
}

function sceneDurations() {
  const v = S.video;
  const durations = v.scenes.map((s) => Math.max(2, Number(s.duration) || 4));
  if (v.audio && v.fitAudio && durations.length) {
    const fixed = (v.intro ? S.cfg.video.introSeconds : 0) + (v.outro ? S.cfg.video.outroSeconds : 0);
    const available = v.audio.duration - fixed;
    const sum = durations.reduce((a, b) => a + b, 0);
    if (available >= durations.length * 2) return durations.map((d) => (d / sum) * available);
  }
  return durations;
}

function timelineLength() {
  const v = S.video;
  if (!v.scenes.length) return 0;
  return (v.intro ? S.cfg.video.introSeconds : 0) + sceneDurations().reduce((a, b) => a + b, 0) + (v.outro ? S.cfg.video.outroSeconds : 0);
}

async function buildTimeline() {
  const v = S.video;
  await brandAssets();
  const segments = [];
  let at = 0;
  const push = (seg) => { segments.push({ ...seg, start: at, end: at + seg.duration }); at += seg.duration; };
  if (v.intro) push({ type: 'intro', duration: S.cfg.video.introSeconds });
  const durations = sceneDurations();
  for (const [i, scene] of v.scenes.entries()) {
    const media = scene.mediaId ? mediaById(scene.mediaId) : null;
    let bitmap = null;
    if (media) { try { bitmap = await createImageBitmap(media.blob); } catch { bitmap = null; } }
    push({ type: 'scene', duration: durations[i], index: i, text: scene.text.trim(), bitmap });
  }
  if (v.outro) push({ type: 'outro', duration: S.cfg.video.outroSeconds });
  return { segments, total: at, title: v.title.trim(), tagline: tx(app.site?.brand?.tagline) || '', host: location.host || 'agilix.space' };
}

const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

function brandBackground(ctx, W, H, tt) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0e1630');
  g.addColorStop(1, '#16245a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const glow = (x, y, r, color) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, color);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  };
  const m = Math.max(W, H);
  glow(W * (0.2 + 0.05 * Math.sin(tt * 0.6)), H * 0.25, m * 0.55, 'rgba(46,91,255,0.55)');
  glow(W * 0.85, H * (0.8 + 0.04 * Math.cos(tt * 0.5)), m * 0.5, 'rgba(20,184,196,0.38)');
  glow(W * 0.9, H * 0.1, m * 0.3, 'rgba(255,107,61,0.22)');
}

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawText(ctx, text, x, y, size, weight = 700, color = '#fff', align = 'center') {
  ctx.font = `${weight} ${size}px ${isArabic(text) ? 'Tajawal, Poppins' : 'Poppins, Tajawal'}, sans-serif`;
  ctx.direction = isArabic(text) ? 'rtl' : 'ltr';
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawLogo(ctx, img, cx, cy, width) {
  if (!img) return;
  const h = width * (img.naturalHeight / img.naturalWidth || 0.14);
  ctx.drawImage(img, cx - width / 2, cy - h / 2, width, h);
}

function drawSegment(ctx, tl, seg, lt, W, H) {
  const minSide = Math.min(W, H);
  if (seg.type === 'intro' || seg.type === 'outro') {
    brandBackground(ctx, W, H, seg.start + lt);
    const p = ease(lt / 0.9);
    ctx.save();
    ctx.globalAlpha *= p;
    const logoW = (W > H ? 0.42 : 0.72) * W;
    const scale = 0.92 + 0.08 * p;
    ctx.translate(W / 2, H * 0.44);
    ctx.scale(scale, scale);
    drawLogo(ctx, assets.logo, 0, 0, logoW);
    ctx.restore();
    const sub = seg.type === 'intro' ? (tl.title || tl.tagline) : tl.tagline;
    if (sub) {
      ctx.save();
      ctx.globalAlpha *= ease((lt - 0.35) / 0.8);
      ctx.font = `700 ${Math.round(minSide * 0.055)}px Tajawal, Poppins, sans-serif`;
      const lines = wrapLines(ctx, sub, W * 0.82).slice(0, 3);
      lines.forEach((ln, i) => drawText(ctx, ln, W / 2, H * 0.62 + i * minSide * 0.075, Math.round(minSide * 0.055)));
      ctx.restore();
    }
    if (seg.type === 'outro') {
      ctx.save();
      ctx.globalAlpha *= ease((lt - 0.7) / 0.8) * 0.85;
      drawText(ctx, tl.host, W / 2, H * 0.88, Math.round(minSide * 0.034), 600, '#cfd8ff');
      ctx.restore();
    }
    return;
  }

  // scene
  const progress = lt / seg.duration;
  if (seg.bitmap) {
    const bw = seg.bitmap.width;
    const bh = seg.bitmap.height;
    const cover = Math.max(W / bw, H / bh);
    const zoom = S.video.motion ? 1 + 0.09 * progress : 1;
    const dir = seg.index % 2 ? -1 : 1;
    const dw = bw * cover * zoom;
    const dh = bh * cover * zoom;
    const panX = S.video.motion ? dir * W * 0.025 * (progress - 0.5) : 0;
    ctx.fillStyle = '#0e1630';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(seg.bitmap, (W - dw) / 2 + panX, (H - dh) / 2, dw, dh);
  } else {
    brandBackground(ctx, W, H, seg.start + lt);
  }
  const shade = ctx.createLinearGradient(0, H * 0.45, 0, H);
  shade.addColorStop(0, 'rgba(14,22,48,0)');
  shade.addColorStop(1, 'rgba(14,22,48,0.78)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, H * 0.45, W, H * 0.55);

  // watermark
  if (assets.mark) {
    ctx.save();
    ctx.globalAlpha *= 0.9;
    const mw = minSide * 0.17;
    const mh = mw * (assets.mark.naturalHeight / assets.mark.naturalWidth || 0.3);
    const rtl = app.lang === 'ar';
    ctx.drawImage(assets.mark, rtl ? W - mw - minSide * 0.045 : minSide * 0.045, minSide * 0.045, mw, mh);
    ctx.restore();
  }

  if (seg.text) {
    const size = Math.round(minSide * (W > H ? 0.05 : 0.056));
    ctx.font = `700 ${size}px ${isArabic(seg.text) ? 'Tajawal, Poppins' : 'Poppins, Tajawal'}, sans-serif`;
    const lines = wrapLines(ctx, seg.text, W * 0.84).slice(0, 4);
    const lineH = size * 1.45;
    const boxH = lines.length * lineH + size * 0.9;
    const boxW = Math.min(W * 0.92, Math.max(...lines.map((l) => ctx.measureText(l).width)) + size * 1.6);
    const appear = ease(lt / 0.5);
    const y = H - boxH - minSide * 0.07 + (1 - appear) * size * 0.8;
    ctx.save();
    ctx.globalAlpha *= appear;
    ctx.fillStyle = 'rgba(14,22,48,0.62)';
    roundRect(ctx, (W - boxW) / 2, y, boxW, boxH, size * 0.45);
    ctx.fill();
    ctx.fillStyle = '#ff6b3d';
    roundRect(ctx, W / 2 - size * 1.1, y - size * 0.12, size * 2.2, size * 0.24, size * 0.12);
    ctx.fill();
    lines.forEach((ln, i) => drawText(ctx, ln, W / 2, y + size * 0.45 + lineH * i + size * 1.05, size));
    ctx.restore();
  }
}

function drawFrame(ctx, tl, t) {
  const { width: W, height: H } = ctx.canvas;
  const trans = S.cfg.video.transitionSeconds || 0.6;
  const segs = tl.segments;
  const i = Math.max(0, segs.findIndex((s) => t >= s.start && t < s.end));
  const seg = segs[i] || segs.at(-1);
  ctx.save();
  ctx.globalAlpha = 1;
  drawSegment(ctx, tl, seg, t - seg.start, W, H);
  const next = segs[i + 1];
  if (next && t > seg.end - trans) {
    ctx.globalAlpha = (t - (seg.end - trans)) / trans;
    drawSegment(ctx, tl, next, Math.max(0, t - next.start), W, H);
  }
  ctx.restore();
}

async function drawPreviewStill() {
  const canvas = $('#studio-canvas');
  if (!canvas || S.video.playing || S.video.rendering) return;
  const ctx = canvas.getContext('2d');
  if (!S.video.scenes.length) {
    await brandAssets();
    brandBackground(ctx, canvas.width, canvas.height, 0);
    drawLogo(ctx, assets.logo, canvas.width / 2, canvas.height / 2, canvas.width * (canvas.width > canvas.height ? 0.42 : 0.72));
    return;
  }
  const tl = await buildTimeline();
  if (!canvas.isConnected) return;
  const first = tl.segments.find((s) => s.type === 'scene');
  drawFrame(ctx, tl, first ? first.start + Math.min(1.2, first.duration / 2) : 0);
  tl.segments.forEach((s) => s.bitmap?.close?.());
}

function pickVideoMime(withAudio) {
  if (typeof MediaRecorder === 'undefined') return null;
  const list = withAudio
    ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

/** Plays the timeline on the preview canvas; with `record`, captures it to a video file. */
async function runTimeline({ record }) {
  const v = S.video;
  const tl = await buildTimeline();
  const canvas = $('#studio-canvas');
  if (!canvas || !tl.segments.length) return null;
  const ctx = canvas.getContext('2d');
  const state = { cancelled: false, progress: 0 };
  if (record) v.rendering = state; else v.playing = state;
  renderPanel();
  const live = $('#studio-canvas');
  const liveCtx = live.getContext('2d');

  let audioCtx = null;
  let source = null;
  let recorder = null;
  let chunks = [];
  let mime = '';
  try {
    if (v.audio) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = await audioCtx.decodeAudioData(await v.audio.blob.arrayBuffer());
      source = audioCtx.createBufferSource();
      source.buffer = buffer;
    }
    if (record) {
      const stream = live.captureStream(S.cfg.video.fps || 30);
      if (source) {
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        stream.addTrack(dest.stream.getAudioTracks()[0]);
      }
      mime = pickVideoMime(!!source);
      if (mime === null) throw new StudioError('no_recorder');
      recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 6_000_000 });
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.start(500);
    } else if (source) {
      source.connect(audioCtx.destination);
    }
    source?.start();
    const t0 = performance.now();
    await new Promise((resolve) => {
      const frame = () => {
        if (state.cancelled) return resolve();
        const t = (performance.now() - t0) / 1000;
        drawFrame(liveCtx, tl, Math.min(t, tl.total - 0.001));
        state.progress = Math.min(1, t / tl.total);
        const bar = $('#studio-render-bar');
        if (bar) bar.style.width = `${Math.round(state.progress * 100)}%`;
        if (t >= tl.total) return resolve();
        if (document.hidden) setTimeout(frame, 1000 / 30); else requestAnimationFrame(frame);
      };
      frame();
    });
    try { source?.stop(); } catch { /* already stopped */ }
    if (recorder) {
      const stopped = new Promise((r) => { recorder.onstop = r; });
      recorder.stop();
      await stopped;
    }
  } catch (err) {
    toast(err?.code === 'no_recorder' ? t('studio.video.noRecorder') : t('studio.video.renderFailed'), 'error');
    state.cancelled = true;
  } finally {
    audioCtx?.close();
    tl.segments.forEach((s) => s.bitmap?.close?.());
    if (record) v.rendering = null; else v.playing = null;
  }
  ctx.globalAlpha = 1;
  if (!record || state.cancelled || !chunks.length) {
    if (S.phase === 'ready' && S.tab === 'video') renderPanel();
    return null;
  }
  const type = (recorder.mimeType || mime || 'video/webm').split(';')[0];
  const [W, H] = videoSize();
  const item = await addMedia({ kind: 'video', blob: new Blob(chunks, { type }), mime: type, prompt: v.title.trim() || v.scenes[0]?.text.slice(0, 80) || '', model: '', width: W, height: H, duration: tl.total, source: 'studio' });
  if (item) { v.resultId = item.id; toast(t('studio.video.done')); }
  refreshLibraryCount();
  if (S.phase === 'ready' && S.tab === 'video') renderPanel();
  return item;
}

/* ------------------------------------------------------------- events */
function moveScene(id, delta) {
  const list = S.video.scenes;
  const i = list.findIndex((s) => s.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  saveVideo();
  renderPanel();
}

function reuseImagePrompt(item) {
  S.tab = 'image';
  S.drafts.image = item.prompt;
  S.original = null;
  if (imageModels().some((m) => m.id === item.model)) S.img.model = item.model;
  normalizeImageForm();
  saveUi();
  history.replaceState(null, '', '#image');
  renderPanel();
  $('#studio-prompt')?.focus();
}

function bindEvents(root) {
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'studio-gate') login(e.target);
    else if (e.target.id === 'studio-composer') sendChat($('#studio-chat-input').value);
    else if (e.target.id === 'studio-img-form') generateImages();
  });

  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'studio-chat-input') { S.drafts.chat = el.value; autosize(el); saveUi(); }
    else if (el.id === 'studio-prompt') { S.drafts.image = el.value; saveUi(); }
    else if (el.id === 'studio-topic') { S.video.topic = el.value; saveVideo(); }
    else if (el.id === 'studio-video-title') { S.video.title = el.value; saveVideo(); }
    else if (el.dataset.sceneText) {
      const scene = S.video.scenes.find((s) => s.id === el.dataset.sceneText);
      if (scene) { scene.text = el.value; saveVideo(); }
    }
  });

  root.addEventListener('keydown', (e) => {
    if (e.target.id === 'studio-chat-input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendChat(e.target.value);
    }
  });

  root.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.matches('[data-engine]')) {
      S.engine = el.value;
      saveUi();
      renderPanel();
    } else if (el.id === 'studio-local-model') {
      S.localModel = el.value;
      if (S.local.status !== 'loading') S.local.status = S.local.loadedId === el.value ? 'ready' : 'idle';
      saveUi();
      renderPanel();
    } else if (el.id === 'studio-model') {
      S.img.model = el.value;
      normalizeImageForm();
      saveUi();
      renderPanel();
    } else if (el.matches('[data-img-ratio]')) {
      S.img.ratio = el.value;
      saveUi();
      renderPanel();
    } else if (el.matches('[data-img-count]')) {
      S.img.count = Number(el.value);
      saveUi();
    } else if (el.matches('[data-lib-upload]') && el.files.length) {
      await uploadImages([...el.files]);
      renderPanel();
    } else if (el.id === 'studio-scene-count') {
      S.video.sceneCount = Number(el.value);
      saveVideo();
    } else if (el.matches('[data-video-format]')) {
      S.video.format = el.value;
      saveVideo();
      renderPanel();
    } else if (el.dataset.videoToggle) {
      S.video[el.dataset.videoToggle] = el.checked;
      saveVideo();
      renderPanel();
    } else if (el.dataset.sceneDur) {
      const scene = S.video.scenes.find((s) => s.id === el.dataset.sceneDur);
      const value = Math.max(2, Math.min(30, Number(el.value) || 4));
      if (scene) {
        scene.duration = value;
        el.value = value;
        saveVideo();
        const len = $('.studio-video__len');
        if (len) len.textContent = t('studio.video.length', { time: fmtClock(Math.round(timelineLength())) });
      }
    } else if (el.dataset.sceneFile && el.files[0]) {
      await uploadImages([el.files[0]], el.dataset.sceneFile);
      renderPanel();
    } else if (el.matches('[data-audio-file]') && el.files[0]) {
      setAudio(el.files[0], el.files[0].name);
    }
  });

  root.addEventListener('click', async (e) => {
    const el = e.target.closest('button, a');
    if (!el || !root.contains(el) || el.disabled) return;
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
    } else if (el.matches('[data-local-load]')) {
      loadLocalModel();
    } else if (d.preset) {
      const input = $('#studio-chat-input');
      if (!input || input.disabled) return;
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
      if (d.msgTo === 'image') {
        S.tab = 'image';
        S.drafts.image = promptFromReply(msg.content);
        S.original = null;
        saveUi();
      } else {
        S.tab = 'video';
        S.video.topic = promptFromReply(msg.content).slice(0, 600);
        saveVideo();
      }
      history.replaceState(null, '', `#${S.tab}`);
      renderPanel();
    } else if (el.matches('[data-copy-code]')) {
      copyText(el.closest('.md-code')?.querySelector('code')?.textContent || '');
    } else if (el.matches('[data-enhance]')) {
      enhancePrompt();
    } else if (el.matches('[data-undo-enhance]')) {
      S.drafts.image = S.original ?? S.drafts.image;
      S.original = null;
      saveUi();
      renderPanel();
    } else if (d.libFilter) {
      S.libFilter = d.libFilter;
      saveUi();
      renderPanel();
    } else if (d.mediaDownload) {
      const item = mediaById(d.mediaDownload);
      if (item) downloadBlob(item.blob, fileName(item));
    } else if (d.mediaScene) {
      if (S.video.scenes.length >= MAX_SCENES) { toast(t('studio.video.full'), 'error'); return; }
      const item = mediaById(d.mediaScene);
      S.video.scenes.push(newScene('', item?.prompt || '', d.mediaScene));
      saveVideo();
      toast(t('studio.media.addedToVideo'));
    } else if (d.mediaReuse) {
      const item = mediaById(d.mediaReuse);
      if (item) reuseImagePrompt(item);
    } else if (d.mediaDelete) {
      if (!(await confirmDialog(t('studio.media.deleteConfirm.title'), t('studio.media.deleteConfirm.text')))) return;
      await mediaDelete(d.mediaDelete).catch(() => {});
      const url = urlCache.get(d.mediaDelete);
      if (url) { URL.revokeObjectURL(url); urlCache.delete(d.mediaDelete); }
      S.lib = S.lib.filter((m) => m.id !== d.mediaDelete);
      S.video.scenes.forEach((s) => { if (s.mediaId === d.mediaDelete) s.mediaId = null; });
      if (S.video.resultId === d.mediaDelete) S.video.resultId = null;
      saveVideo();
      refreshLibraryCount();
      renderPanel();
    } else if (el.matches('[data-video-script]')) {
      writeScript();
    } else if (el.matches('[data-video-fill]')) {
      fillSceneImages();
    } else if (el.matches('[data-scene-add]')) {
      S.video.scenes.push(newScene());
      saveVideo();
      renderPanel();
      $$('[data-scene-text]').at(-1)?.focus();
    } else if (d.scenePick) {
      openLibraryPicker((id) => {
        const scene = S.video.scenes.find((s) => s.id === d.scenePick);
        if (scene) { scene.mediaId = id; saveVideo(); renderPanel(); }
      });
    } else if (d.sceneGen) {
      const scene = S.video.scenes.find((s) => s.id === d.sceneGen);
      if (scene && (scene.imagePrompt || scene.text).trim()) fillSceneImages(scene);
      else toast(t('studio.video.needCaption'), 'error');
    } else if (d.sceneUp) {
      moveScene(d.sceneUp, -1);
    } else if (d.sceneDown) {
      moveScene(d.sceneDown, 1);
    } else if (d.sceneDel) {
      S.video.scenes = S.video.scenes.filter((s) => s.id !== d.sceneDel);
      saveVideo();
      renderPanel();
    } else if (el.matches('[data-audio-record]')) {
      startRecording();
    } else if (el.matches('[data-audio-stop]')) {
      S.video.recording?.rec.stop();
    } else if (el.matches('[data-audio-remove]')) {
      if (S.video.audio) URL.revokeObjectURL(S.video.audio.url);
      S.video.audio = null;
      renderPanel();
    } else if (el.matches('[data-video-play]')) {
      runTimeline({ record: false });
    } else if (el.matches('[data-video-stop]')) {
      if (S.video.playing) S.video.playing.cancelled = true;
    } else if (el.matches('[data-video-render]')) {
      runTimeline({ record: true });
    } else if (el.matches('[data-video-cancel]')) {
      if (S.video.rendering) S.video.rendering.cancelled = true;
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
