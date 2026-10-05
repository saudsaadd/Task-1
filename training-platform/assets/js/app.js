// Core of the platform: data loading, i18n (AR/EN + RTL/LTR), the learner's local
// progress store, shared layout (header, footer, notifications, banner), toasts and modals.
// Every page module calls boot(render); render runs once the data is ready and again
// whenever the language changes.
import { icon } from './icons.js';

export { icon };

const STATE_KEY = 'academy.state.v1';
const LANG_KEY = 'academy.lang';
const DAY = 864e5;

/* ---------------------------------------------------------------- storage */
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }
};

/* ------------------------------------------------------------------- data */
const jsonCache = new Map();
export function loadJSON(path) {
  if (!jsonCache.has(path)) {
    jsonCache.set(path, fetch(path, { cache: 'no-cache' }).then((res) => {
      if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
      return res.json();
    }));
  }
  return jsonCache.get(path);
}

export const data = {
  site: () => loadJSON('data/site.json'),
  courses: () => loadJSON('data/courses.json'),
  quizzes: () => loadJSON('data/quizzes.json'),
  plans: () => loadJSON('data/plans.json'),
  faq: () => loadJSON('data/faq.json'),
  testimonials: () => loadJSON('data/testimonials.json'),
  announcements: () => loadJSON('data/announcements.json'),
  student: () => loadJSON('data/student.json')
};

export const app = { lang: 'ar', site: null, strings: {} };

/* ------------------------------------------------------------------- i18n */
export function t(key, vars) {
  let s = app.strings[key];
  // Plural forms: { "one": …, "two": …, "few": …, "many": …, "other": … } chosen by vars.n.
  if (s && typeof s === 'object') {
    const num = Number(String(vars?.n ?? '').replace(/[^\d.]/g, ''));
    let form = 'other';
    try { form = new Intl.PluralRules(app.lang).select(Number.isFinite(num) ? num : 0); } catch { /* old browsers */ }
    s = s[form] ?? s.other;
  }
  if (s == null) s = key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
}

/** Pick the current language from a { ar, en } object (strings pass through). */
export function tx(value) {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  return value[app.lang] ?? value.en ?? value.ar ?? '';
}

export function locale() {
  return app.site?.locales?.[app.lang] || (app.lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US');
}

export const fmtNum = (n, opts) => new Intl.NumberFormat(locale(), opts).format(n);

export function fmtCompact(n) {
  return new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function fmtDate(date, opts = { year: 'numeric', month: 'long', day: 'numeric' }) {
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(locale(), opts).format(d);
}

export function fmtPrice(amount, { free = true } = {}) {
  if (free && !amount) return t('common.free');
  const currency = app.site?.payments?.currency || 'SAR';
  return new Intl.NumberFormat(locale(), {
    style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0
  }).format(amount);
}

export function fmtMinutes(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (!h) return t('common.min', { n: fmtNum(m) });
  return m ? t('common.hm', { h: fmtNum(h), m: fmtNum(m) }) : t('common.hours', { n: fmtNum(h) });
}

export function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Only allow http(s), mailto, tel, hash and relative links in hrefs built from JSON. */
export function safeUrl(url) {
  const u = String(url ?? '').trim();
  if (!u) return '';
  if (/^(https?:|mailto:|tel:|#)/i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '';
  return u;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const param = (name) => new URLSearchParams(location.search).get(name);

export function setTitle(title) {
  const brand = tx(app.site?.brand?.name);
  document.title = title ? `${title} · ${brand}` : brand;
}

/* ------------------------------------------------------------------ state */
let state = null;

const emptyState = () => ({
  v: 1, demo: false,
  profile: { name: '', email: '', avatar: '' },
  plan: null,          // { id, cycle, since }
  enrollments: {},     // courseId → { at, done: [lessonIds], last }
  attempts: [],        // quiz attempts
  orders: [],
  read: [],            // announcement ids marked read
  dismissed: [],       // dismissed banner ids
  activity: {}         // 'YYYY-MM-DD' → minutes learned
});

export const dayKey = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export function gradeFor(percent, scale) {
  const list = [...(scale || [])].sort((a, b) => b.min - a.min);
  return list.find((g) => percent >= g.min) || { letter: '—', label: '' };
}

function makeAttempt(quiz, scale, { percent, durationSec = 0, date = new Date(), score = null, max = null, answers = null }) {
  const grade = gradeFor(percent, scale);
  return {
    id: `${quiz.id}-${new Date(date).getTime()}`,
    quizId: quiz.id, courseId: quiz.courseId,
    percent, score, max, durationSec,
    passed: percent >= (quiz.passMark ?? 60),
    grade: grade.letter,
    date: new Date(date).toISOString(),
    answers
  };
}

async function seedState() {
  const s = emptyState();
  try {
    const student = await data.student();
    if (!student.seedDemoData) return s;
    const now = Date.now();
    s.demo = true;
    s.profile = { name: student.profile?.name || '', email: student.profile?.email || '', avatar: student.profile?.avatar || '' };
    if (student.plan) s.plan = { id: student.plan, cycle: 'yearly', since: new Date(now - 45 * DAY).toISOString() };
    for (const e of student.enrollments || []) {
      s.enrollments[e.courseId] = {
        at: new Date(now - (e.daysAgo || 0) * DAY).toISOString(),
        done: [...(e.completed || [])],
        last: (e.completed || []).at(-1) || null
      };
    }
    const quizzes = await data.quizzes();
    for (const a of student.quizAttempts || []) {
      const quiz = quizzes.quizzes.find((q) => q.id === a.quizId);
      if (quiz) s.attempts.push(makeAttempt(quiz, quizzes.gradingScale, { percent: a.percent, durationSec: a.durationSec, date: new Date(now - (a.daysAgo || 0) * DAY) }));
    }
    const act = student.activity || [];
    act.forEach((min, i) => { s.activity[dayKey(new Date(now - (act.length - 1 - i) * DAY))] = min; });
  } catch (err) {
    console.warn('[academy] demo data not loaded:', err);
  }
  return s;
}

export function getState() { return state; }

function saveState() { storage.set(STATE_KEY, JSON.stringify(state)); }

export function update(mutator) {
  mutator(state);
  saveState();
  document.dispatchEvent(new CustomEvent('app:statechange'));
}

export async function resetState() {
  storage.remove(STATE_KEY);
  state = await seedState();
  saveState();
  document.dispatchEvent(new CustomEvent('app:statechange'));
}

export const enrollment = (courseId) => state.enrollments[courseId] || null;
export const hasPlanAccess = () => ['pro', 'teams'].includes(state.plan?.id);
export const canAccess = (course) => !course.price || !!enrollment(course.id) || hasPlanAccess();

export function enroll(courseId) {
  if (enrollment(courseId)) return;
  update((s) => { s.enrollments[courseId] = { at: new Date().toISOString(), done: [], last: null }; });
}

export function logActivity(minutes) {
  if (!minutes) return;
  update((s) => { const k = dayKey(); s.activity[k] = Math.min(24 * 60, (s.activity[k] || 0) + minutes); });
}

export function completeLesson(course, lesson) {
  enroll(course.id);
  const e = enrollment(course.id);
  if (e.done.includes(lesson.id)) return false;
  update(() => { e.done.push(lesson.id); e.last = lesson.id; });
  logActivity(Math.min(lesson.duration || 10, 120));
  return true;
}

export function setLastLesson(courseId, lessonId) {
  const e = enrollment(courseId);
  if (e && e.last !== lessonId) update(() => { e.last = lessonId; });
}

export function progress(course) {
  const e = enrollment(course.id);
  if (!e || !course.lessons?.length) return 0;
  const ids = new Set(course.lessons.map((l) => l.id));
  return Math.round((e.done.filter((id) => ids.has(id)).length / course.lessons.length) * 100);
}

export const attemptsFor = (quizId) => state.attempts.filter((a) => a.quizId === quizId);

export function bestAttempt(quizId) {
  return attemptsFor(quizId).reduce((best, a) => (!best || a.percent > best.percent ? a : best), null);
}

export function addAttempt(quiz, scale, result) {
  const attempt = makeAttempt(quiz, scale, result);
  update((s) => { s.attempts.push(attempt); });
  logActivity(Math.round((result.durationSec || 0) / 60));
  return attempt;
}

/** A course is complete when every lesson is done and its quiz (if any) is passed. */
export function isComplete(course) {
  return progress(course) === 100 && (!course.quizId || !!bestAttempt(course.quizId)?.passed);
}

export function completionDate(course) {
  const best = course.quizId ? attemptsFor(course.quizId).filter((a) => a.passed).sort((a, b) => a.date.localeCompare(b.date))[0] : null;
  return best ? new Date(best.date) : new Date();
}

/** Stable certificate number derived from the learner + course. */
export function certificateId(course) {
  const seed = `${state.profile.email || tx(state.profile.name) || 'learner'}|${course.id}`;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const code = (h >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(-7);
  return `${app.site?.certificate?.idPrefix || 'CRT'}-${completionDate(course).getFullYear()}-${code}`;
}

export function learnerName() {
  return tx(state.profile.name) || t('common.learner');
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || '?').slice(0, 2)).toUpperCase();
}

export function avatar(name, url, cls = '') {
  const u = safeUrl(url);
  return u
    ? `<img class="avatar ${cls}" src="${esc(u)}" alt="" loading="lazy">`
    : `<span class="avatar ${cls}" aria-hidden="true">${esc(initials(name))}</span>`;
}

export function stars(rating, label = true) {
  const full = Math.round(rating);
  const s = Array.from({ length: 5 }, (_, i) => `<span class="star${i < full ? ' is-on' : ''}">${icon('star')}</span>`).join('');
  return `<span class="stars" role="img" aria-label="${esc(t('common.rating', { n: rating }))}">${s}${label ? `<b>${fmtNum(rating, { minimumFractionDigits: 1 })}</b>` : ''}</span>`;
}

/* ------------------------------------------------------------ live */
/** 'upcoming' | 'live' | 'ended' | 'tbd' for a live lesson. */
export function liveStatus(lesson, now = Date.now()) {
  const start = new Date(lesson.startsAt).getTime();
  if (Number.isNaN(start)) return 'tbd';
  const end = start + (lesson.duration || 60) * 60000;
  return now < start ? 'upcoming' : now <= end ? 'live' : 'ended';
}

/** Live lessons across courses, soonest first (ongoing and upcoming only). */
export function upcomingLive(courses, courseIds = null) {
  const out = [];
  for (const course of courses) {
    if (courseIds && !courseIds.includes(course.id)) continue;
    for (const lesson of course.lessons) {
      if (lesson.type !== 'live') continue;
      const status = liveStatus(lesson);
      if (status === 'upcoming' || status === 'live') out.push({ course, lesson, status });
    }
  }
  return out.sort((a, b) => new Date(a.lesson.startsAt) - new Date(b.lesson.startsAt));
}

/* ------------------------------------------------------------ course ui */
export function courseCover(course, size = '') {
  const cover = safeUrl(course.cover);
  const hue = Number(course.hue ?? 260);
  const style = `--h:${hue}`;
  return `<div class="cover ${size}" style="${style}">
    ${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : `<span class="cover__grid"></span><span class="cover__icon">${icon(course.icon || 'book')}</span>`}
  </div>`;
}

export function levelLabel(level) { return t(`level.${level}`); }

export function courseCard(course, categories = []) {
  const cat = categories.find((c) => c.id === course.category);
  const p = progress(course);
  const e = enrollment(course.id);
  return `<article class="course-card reveal">
    <a class="course-card__link" href="course.html?id=${encodeURIComponent(course.id)}" aria-label="${esc(tx(course.title))}"></a>
    ${courseCover(course)}
    <div class="course-card__body">
      <div class="course-card__meta">
        ${cat ? `<span class="chip chip--soft">${esc(tx(cat.label))}</span>` : ''}
        <span class="chip chip--outline">${esc(levelLabel(course.level))}</span>
      </div>
      <h3 class="course-card__title">${esc(tx(course.title))}</h3>
      <p class="course-card__text">${esc(tx(course.subtitle))}</p>
      <div class="course-card__stats">
        <span>${icon('clock')}${esc(t('common.hours', { n: fmtNum(course.hours) }))}</span>
        <span>${icon('book')}${esc(t('common.lessons', { n: fmtNum(course.lessons.length) }))}</span>
        <span>${icon('star')}${fmtNum(course.rating, { minimumFractionDigits: 1 })}</span>
      </div>
      ${e ? `<div class="meter" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(t('course.progress'))}"><span style="width:${p}%"></span></div>
             <div class="course-card__foot"><span class="muted">${esc(t('course.progressValue', { n: fmtNum(p) }))}</span><span class="price">${esc(t('course.enrolled'))}</span></div>`
          : `<div class="course-card__foot"><span class="muted">${icon('users')}${esc(fmtCompact(course.students))}</span><span class="price">${esc(fmtPrice(course.price))}</span></div>`}
    </div>
  </article>`;
}

/* ----------------------------------------------------------------- toasts */
export function toast(message, type = 'success') {
  let box = $('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'warning' : type === 'info' ? 'info' : 'success')}<span></span>`;
  el.querySelector('span').textContent = message;
  box.append(el);
  setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 400); }, 3600);
}

/* ------------------------------------------------------------------ modal */
export function openModal({ title, body, actions = [], size = '', onDismiss }) {
  const dlg = document.createElement('dialog');
  dlg.className = `modal ${size}`;
  dlg.innerHTML = `<form method="dialog" class="modal__inner">
    <header class="modal__head"><h2 class="modal__title"></h2>
      <button class="icon-btn" value="cancel" aria-label="${esc(t('common.close'))}">${icon('close')}</button></header>
    <div class="modal__body">${body}</div>
    ${actions.length ? `<footer class="modal__foot">${actions.map((a, i) => `<button class="btn ${a.primary ? 'btn--primary' : 'btn--ghost'}" value="${i}" ${a.primary ? 'data-primary' : ''}>${esc(a.label)}</button>`).join('')}</footer>` : ''}
  </form>`;
  dlg.querySelector('.modal__title').textContent = title;
  document.body.append(dlg);
  dlg.addEventListener('close', () => {
    const a = actions[Number.parseInt(dlg.returnValue, 10)];
    if (a?.onClick) a.onClick(dlg);
    else onDismiss?.();
    dlg.remove();
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close('cancel'); });
  dlg.showModal();
  return dlg;
}

export function confirmDialog(title, text) {
  return new Promise((resolve) => {
    openModal({
      title,
      body: `<p>${esc(text)}</p>`,
      onDismiss: () => resolve(false),
      actions: [
        { label: t('common.cancel'), onClick: () => resolve(false) },
        { label: t('common.confirm'), primary: true, onClick: () => resolve(true) }
      ]
    });
  });
}

/* ------------------------------------------------------------- reveals */
let revealObserver;
export function observeReveals(root = document) {
  const items = $$('.reveal:not(.is-visible)', root);
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  revealObserver ??= new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-visible'); revealObserver.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach((el) => revealObserver.observe(el));
}

/* ---------------------------------------------------------------- layout */
function currentFile() {
  const f = location.pathname.split('/').pop();
  return f && f.includes('.') ? f : 'index.html';
}

function isActive(href) {
  const file = String(href).split(/[?#]/)[0] || 'index.html';
  return file === currentFile();
}

function brandMarkup(cls = '') {
  const b = app.site.brand;
  const showName = b.headerShowsName !== false;
  const src = safeUrl(showName ? b.logoMark || b.logo : b.logo || b.logoMark);
  return `<a class="brand ${cls}" href="index.html" aria-label="${esc(tx(b.name))}">
    ${src ? `<img class="brand__logo${showName ? '' : ' brand__logo--full'}" src="${esc(src)}" alt="" width="36" height="36">` : ''}
    ${showName ? `<span class="brand__name">${esc(tx(b.name))}</span>` : ''}
  </a>`;
}

const otherLang = () => (app.lang === 'ar' ? 'en' : 'ar');

function langButton(cls = '') {
  return `<button type="button" class="lang-switch ${cls}" data-lang-toggle lang="${otherLang()}" aria-label="${esc(t('lang.aria'))}">
    ${icon('globe')}<span>${esc(t('lang.switchTo'))}</span>
  </button>`;
}

async function renderHeader() {
  const el = document.getElementById('site-header');
  if (!el) return;
  const site = app.site;
  const links = site.navigation.map((n) => {
    const active = isActive(n.href);
    return `<a class="nav-link${active ? ' is-active' : ''}" href="${esc(safeUrl(n.href))}"${active ? ' aria-current="page"' : ''}>${esc(tx(n.label))}</a>`;
  }).join('');

  el.innerHTML = `
    <div class="announce-slot"></div>
    <div class="header-bar">
      <div class="container header-inner">
        ${brandMarkup()}
        <nav class="main-nav" id="main-nav" aria-label="${esc(t('nav.main'))}">
          <div class="main-nav__links">${links}</div>
          <div class="main-nav__extra">${langButton('lang-switch--block')}</div>
        </nav>
        <div class="header-actions">
          ${langButton('hide-mobile')}
          <div class="notif">
            <button type="button" class="icon-btn notif__toggle" aria-expanded="false" aria-controls="notif-panel" aria-label="${esc(t('notif.title'))}">
              ${icon('bell')}<span class="notif__count" hidden></span>
            </button>
            <div class="notif__panel" id="notif-panel" hidden></div>
          </div>
          <a class="btn btn--light btn--sm hide-mobile" href="dashboard.html">${esc(t('nav.start'))}${icon('arrow', 'flip-rtl')}</a>
          <button type="button" class="icon-btn menu-toggle" aria-expanded="false" aria-controls="main-nav" aria-label="${esc(t('nav.menu'))}">${icon('menu')}</button>
        </div>
      </div>
    </div>`;

  const toggle = $('.menu-toggle', el);
  toggle.addEventListener('click', () => {
    const open = !el.classList.contains('is-menu-open');
    el.classList.toggle('is-menu-open', open);
    document.body.classList.toggle('no-scroll', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.innerHTML = icon(open ? 'close' : 'menu');
  });
  $$('.main-nav a', el).forEach((a) => a.addEventListener('click', () => {
    el.classList.remove('is-menu-open'); document.body.classList.remove('no-scroll');
  }));

  await renderNotifications();
}

let notifDismissBound = false;
function bindNotifDismiss() {
  if (notifDismissBound) return;
  notifDismissBound = true;
  const close = (focus) => {
    const panel = $('#notif-panel');
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    const toggle = $('.notif__toggle');
    toggle?.setAttribute('aria-expanded', 'false');
    if (focus) toggle?.focus();
  };
  document.addEventListener('click', (e) => { if (!e.target.closest('#notif-panel')) close(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(true); });
}

async function renderNotifications() {
  const el = document.getElementById('site-header');
  const toggle = $('.notif__toggle', el);
  const panel = $('#notif-panel', el);
  const count = $('.notif__count', el);
  let items = [];
  try { items = (await data.announcements()).items || []; } catch { /* optional file */ }
  items = [...items].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const draw = () => {
    const unread = items.filter((i) => !state.read.includes(i.id));
    count.hidden = !unread.length;
    count.textContent = fmtNum(unread.length);
    toggle.setAttribute('aria-label', `${t('notif.title')}${unread.length ? ` (${t('notif.unread', { n: unread.length })})` : ''}`);
    panel.innerHTML = `
      <div class="notif__head"><strong>${esc(t('notif.title'))}</strong>
        ${unread.length ? `<button type="button" class="link-btn" data-read-all>${esc(t('notif.markAll'))}</button>` : ''}</div>
      <ul class="notif__list">
        ${items.length ? items.map((i) => `
          <li class="notif__item${state.read.includes(i.id) ? '' : ' is-unread'}">
            <a href="${esc(safeUrl(i.link) || 'dashboard.html#announcements')}" data-id="${esc(i.id)}">
              <span class="notif__icon notif__icon--${esc(i.type)}">${icon(i.type || 'info')}</span>
              <span class="notif__text"><b>${esc(tx(i.title))}</b><span>${esc(tx(i.body))}</span><time datetime="${esc(i.date)}">${esc(fmtDate(i.date, { month: 'short', day: 'numeric' }))}</time></span>
            </a>
          </li>`).join('') : `<li class="notif__empty">${esc(t('notif.empty'))}</li>`}
      </ul>
      <a class="notif__all" href="dashboard.html#announcements">${esc(t('notif.viewAll'))}</a>`;
    $('[data-read-all]', panel)?.addEventListener('click', () => {
      update((s) => { s.read = [...new Set([...s.read, ...items.map((i) => i.id)])]; });
      draw();
    });
    $$('a[data-id]', panel).forEach((a) => a.addEventListener('click', () => {
      update((s) => { if (!s.read.includes(a.dataset.id)) s.read.push(a.dataset.id); });
    }));
  };
  draw();

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });
  bindNotifDismiss();

  // Pinned announcement banner.
  const slot = $('.announce-slot', el);
  const pinned = items.find((i) => i.pinned && !state.dismissed.includes(i.id));
  slot.innerHTML = pinned ? `
    <div class="announce-bar">
      <div class="container announce-bar__inner">
        <span class="announce-bar__dot" aria-hidden="true"></span>
        <p><b>${esc(tx(pinned.title))}</b> <span class="hide-mobile">${esc(tx(pinned.body))}</span></p>
        ${pinned.link ? `<a href="${esc(safeUrl(pinned.link))}">${esc(t('common.learnMore'))}${icon('arrow', 'flip-rtl')}</a>` : ''}
        <button type="button" class="icon-btn icon-btn--sm" data-dismiss aria-label="${esc(t('common.close'))}">${icon('close')}</button>
      </div>
    </div>` : '';
  $('[data-dismiss]', slot)?.addEventListener('click', () => {
    update((s) => { s.dismissed.push(pinned.id); });
    slot.innerHTML = '';
  });
}

function renderFooter() {
  const el = document.getElementById('site-footer');
  if (!el) return;
  const { brand, navigation, contact, social } = app.site;
  el.innerHTML = `
    <div class="container footer-grid">
      <div class="footer-brand">
        ${brandMarkup('brand--footer')}
        <p class="muted">${esc(tx(brand.description))}</p>
        <div class="social">${(social || []).map((s) => `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener" class="chip chip--outline">${esc(s.name)}</a>`).join('')}</div>
      </div>
      <nav class="footer-col" aria-label="${esc(t('footer.platform'))}">
        <h3>${esc(t('footer.platform'))}</h3>
        ${navigation.map((n) => `<a href="${esc(safeUrl(n.href))}">${esc(tx(n.label))}</a>`).join('')}
      </nav>
      <nav class="footer-col" aria-label="${esc(t('footer.support'))}">
        <h3>${esc(t('footer.support'))}</h3>
        <a href="contact.html#faq">${esc(t('footer.faq'))}</a>
        <a href="contact.html">${esc(t('footer.contact'))}</a>
        <a href="#chat">${esc(t('footer.assistant'))}</a>
        <a href="certificate.html">${esc(t('footer.certificates'))}</a>
      </nav>
      <div class="footer-col">
        <h3>${esc(t('footer.reach'))}</h3>
        <a href="mailto:${esc(contact.email)}">${icon('mail')}<span dir="ltr">${esc(contact.email)}</span></a>
        <a href="tel:${esc(String(contact.phone).replace(/\s/g, ''))}">${icon('phone')}<span dir="ltr">${esc(contact.phone)}</span></a>
        <span>${icon('map')}${esc(tx(contact.address))}</span>
      </div>
    </div>
    <div class="container footer-bottom">
      <span class="muted">© ${new Date().getFullYear()} ${esc(tx(brand.name))}. ${esc(t('footer.rights'))}</span>
      ${langButton('lang-switch--ghost')}
    </div>`;
}

function renderChrome() {
  renderHeader();
  renderFooter();
}

/* --------------------------------------------------------------- language */
async function loadStrings(lang) {
  try { return await loadJSON(`data/i18n/${lang}.json`); } catch { return {}; }
}

function pickLang() {
  const fromUrl = param('lang');
  const saved = storage.get(LANG_KEY);
  const lang = fromUrl || saved || app.site?.defaultLanguage || 'ar';
  return lang === 'en' ? 'en' : 'ar';
}

async function applyLang(lang) {
  app.strings = await loadStrings(lang);
  app.lang = lang;
  const root = document.documentElement;
  root.lang = lang;
  root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  $$('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  const desc = $('meta[name="description"]');
  if (desc && app.site) desc.content = tx(app.site.brand.description);
}

export async function setLang(lang) {
  if (lang === app.lang) return;
  const root = document.documentElement;
  root.classList.add('is-switching-lang');
  storage.set(LANG_KEY, lang);
  await applyLang(lang);
  if (param('lang')) {
    const url = new URL(location.href);
    url.searchParams.delete('lang');
    history.replaceState(null, '', url);
  }
  renderChrome();
  document.dispatchEvent(new CustomEvent('app:langchange', { detail: { lang } }));
  requestAnimationFrame(() => setTimeout(() => root.classList.remove('is-switching-lang'), 60));
}

/* ------------------------------------------------------------------ theme */
function applyTheme(theme = {}) {
  const root = document.documentElement.style;
  const map = { primary: '--primary', secondary: '--secondary', highlight: '--highlight', background: '--bg' };
  for (const [k, v] of Object.entries(map)) if (theme[k]) root.setProperty(v, theme[k]);
  const fav = safeUrl(app.site?.brand?.favicon);
  if (fav) {
    let link = $('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.append(link); }
    link.href = fav;
  }
}

/* ------------------------------------------------------------------- boot */
function setupGlobalHandlers() {
  // Keep the bell badge and banner in sync with read/dismissed state.
  document.addEventListener('app:statechange', () => renderHeader());

  document.addEventListener('click', (e) => {
    const langBtn = e.target.closest('[data-lang-toggle]');
    if (langBtn) { e.preventDefault(); setLang(otherLang()); return; }
    const chatLink = e.target.closest('a[href="#chat"]');
    if (chatLink) { e.preventDefault(); document.dispatchEvent(new CustomEvent('app:openchat')); }
  });

  const header = document.getElementById('site-header');
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 24);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
}

function showFatal(err) {
  console.error('[academy]', err);
  const main = $('main') || document.body;
  const fileProtocol = location.protocol === 'file:';
  main.innerHTML = `<section class="container page-section"><div class="empty-state">
    <h1>${fileProtocol ? 'Open the site through a web server' : 'Could not load the platform data'}</h1>
    <p class="muted">${fileProtocol
      ? 'Browsers block reading the JSON files from file://. Run <code>npx serve .</code> inside the folder (or deploy to Vercel) and open the printed address.'
      : esc(err?.message || err)}</p>
  </div></section>`;
}

async function init() {
  app.site = await data.site();
  applyTheme(app.site.theme);
  await applyLang(pickLang());
  try { state = JSON.parse(storage.get(STATE_KEY)); } catch { state = null; }
  if (!state || state.v !== 1) { state = await seedState(); saveState(); }
  state = { ...emptyState(), ...state };
  renderChrome();
  setupGlobalHandlers();
  document.dispatchEvent(new CustomEvent('app:ready', { detail: { lang: app.lang } }));
  if (app.site.assistant?.enabled !== false) {
    import('./chat.js').then((m) => m.initChat()).catch((err) => console.warn('[academy] chat:', err));
  }
}

export const ready = init();
ready.catch(showFatal);

const renderers = [];

async function run(fn) {
  try { await fn(); } catch (err) { showPageError(err); }
  observeReveals();
}

function showPageError(err) {
  console.error('[academy]', err);
  toast(t('common.error'), 'error');
}

/** Register a page renderer: runs when data is ready and after each language switch. */
export function boot(render) {
  renderers.push(render);
  ready.then(() => run(render)).catch(() => {});
}

document.addEventListener('app:langchange', () => renderers.forEach(run));
