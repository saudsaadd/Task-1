// Course page: overview, enrolment, the lesson player (video / live / reading),
// curriculum with progress, resources, live schedule and reviews.
import {
  boot, data, t, tx, esc, icon, safeUrl, fmtNum, fmtDate, fmtPrice, fmtMinutes, fmtCompact, courseCover, levelLabel,
  enrollment, enroll, canAccess, hasPlanAccess, completeLesson, setLastLesson, progress, bestAttempt, isComplete,
  liveStatus, stars, avatar, toast, setTitle, param, $, $$
} from '../app.js';
import { reviewCard } from '../ui.js';

let course, catalog, reviews, currentId, countdownTimer, activeTab = 'overview';

/* --------------------------------------------------------------- media */
export function embedFor(url) {
  const u = safeUrl(url);
  if (!u || u.startsWith('#')) return null;
  const yt = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|live\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&modestbranding=1` };
  const vimeo = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vimeo[1]}` };
  if (/\.(mp4|webm|ogv|mov)(\?|#|$)/i.test(u)) return { kind: 'video', src: u };
  if (/^https:\/\//i.test(u)) return { kind: 'iframe', src: u };
  return null;
}

function mediaMarkup(url, title) {
  const e = embedFor(url);
  if (!e) return null;
  return e.kind === 'video'
    ? `<video controls playsinline preload="metadata" src="${esc(e.src)}" aria-label="${esc(title)}"></video>`
    : `<iframe src="${esc(e.src)}" title="${esc(title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

function overlay(iconName, title, text = '', actions = '', extra = '') {
  return `<div class="player__overlay">
    <span class="icon-circle">${icon(iconName)}</span>
    <h3>${esc(title)}</h3>
    ${text ? `<p class="muted" style="max-width:52ch">${esc(text)}</p>` : ''}
    ${extra}
    ${actions ? `<div class="row" style="justify-content:center">${actions}</div>` : ''}
  </div>`;
}

function calendarLink(lesson) {
  const start = new Date(lesson.startsAt);
  const end = new Date(start.getTime() + (lesson.duration || 60) * 60000);
  const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${tx(lesson.title)} · ${tx(course.title)}`,
    dates: `${f(start)}/${f(end)}`,
    details: `${tx(lesson.summary)}\n${lesson.liveUrl || ''}`,
    location: lesson.liveUrl || ''
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/* -------------------------------------------------------------- helpers */
const lessonIcon = (l) => (l.type === 'live' ? 'live' : l.type === 'reading' ? 'file' : 'video');
const lessonOpen = (l) => canAccess(course) || !!l.preview;
const doneIds = () => enrollment(course.id)?.done || [];

function nextLesson(fromId) {
  const i = course.lessons.findIndex((l) => l.id === fromId);
  return course.lessons[i + 1] || null;
}

function firstIncomplete() {
  const done = doneIds();
  return course.lessons.find((l) => !done.includes(l.id)) || course.lessons[0];
}

/* --------------------------------------------------------------- player */
function renderPlayer() {
  clearInterval(countdownTimer);
  try { drawPlayer(); } finally {
    const player = $('#player-host .player');
    if (player && $('.player__overlay', player)) player.classList.add('player--overlay');
  }
}

function drawPlayer() {
  const lesson = course.lessons.find((l) => l.id === currentId);
  const host = $('#player-host');
  const title = tx(lesson.title);

  if (!lessonOpen(lesson)) {
    host.innerHTML = `<div class="player">${overlay('lock', t('course.locked'), t('course.lockedText'),
      `<a class="btn btn--primary" href="#enroll">${esc(t('course.unlock'))}</a>`)}</div>`;
    return;
  }

  if (lesson.type === 'reading') {
    host.innerHTML = `<article class="card" style="padding:clamp(24px,4vw,44px)">
      <span class="chip chip--soft">${icon('file')}${esc(t('lesson.reading'))} · ${esc(fmtMinutes(lesson.duration))}</span>
      <div class="reading" style="margin-top:20px">${esc(tx(lesson.content))}</div>
    </article>`;
    return;
  }

  if (lesson.type === 'video') {
    host.innerHTML = `<div class="player">${mediaMarkup(lesson.videoUrl, title) || overlay('video', t('course.videoMissing'), t('course.videoMissingText'))}</div>`;
    $('video', host)?.addEventListener('ended', () => markDone(lesson));
    return;
  }

  // live
  const status = liveStatus(lesson);
  const when = fmtDate(lesson.startsAt, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  const join = lesson.liveUrl ? `<a class="btn btn--primary" href="${esc(safeUrl(lesson.liveUrl))}" target="_blank" rel="noopener">${icon('live')}${esc(t('course.live.join'))}</a>` : '';
  if (status === 'live' && lesson.embedUrl && mediaMarkup(lesson.embedUrl, title)) {
    host.innerHTML = `<div class="player">${mediaMarkup(lesson.embedUrl, title)}</div>`;
    return;
  }
  if (status === 'ended') {
    const rec = lesson.recordingUrl && mediaMarkup(lesson.recordingUrl, title);
    host.innerHTML = `<div class="player">${rec || overlay('clock', t('course.live.ended'), t('course.live.noRecording'))}</div>`;
    $('video', host)?.addEventListener('ended', () => markDone(lesson));
    return;
  }
  const chip = status === 'live' ? `<span class="chip chip--live">${esc(t('course.live.now'))}</span>` : `<span class="chip chip--outline">${icon('calendar')}${esc(when)}</span>`;
  const countdown = status === 'upcoming' ? `<div class="countdown" aria-label="${esc(t('course.live.startsIn'))}">
      ${['d', 'h', 'm', 's'].map((k) => `<div><b data-cd="${k}">00</b><span>${esc(t(`time.${k}`))}</span></div>`).join('')}
    </div>` : '';
  const actions = `${join}${status === 'upcoming' ? `<a class="btn btn--glass" href="${esc(calendarLink(lesson))}" target="_blank" rel="noopener">${icon('calendar')}${esc(t('course.live.addCalendar'))}</a>` : ''}`;
  host.innerHTML = `<div class="player">${overlay('live', title, `${lesson.platform ? `${lesson.platform} · ` : ''}${tx(lesson.summary)}`, actions, `${chip}${countdown}`)}</div>`;

  if (status === 'upcoming') {
    const tick = () => {
      const diff = Math.max(0, new Date(lesson.startsAt) - Date.now());
      const parts = { d: Math.floor(diff / 864e5), h: Math.floor(diff / 36e5) % 24, m: Math.floor(diff / 6e4) % 60, s: Math.floor(diff / 1e3) % 60 };
      for (const [k, v] of Object.entries(parts)) { const el = $(`[data-cd="${k}"]`, host); if (el) el.textContent = String(v).padStart(2, '0'); }
      if (!diff) renderPlayer();
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }
}

/* ------------------------------------------------------------ lesson bar */
function renderLessonBar() {
  const lesson = course.lessons.find((l) => l.id === currentId);
  const index = course.lessons.indexOf(lesson);
  const done = doneIds().includes(lesson.id);
  const next = nextLesson(lesson.id);
  const open = lessonOpen(lesson);
  $('#lesson-bar').innerHTML = `
    <div class="stack" style="gap:6px">
      <span class="muted" style="font-size:13px">${esc(t('course.lessonOf', { n: fmtNum(index + 1), total: fmtNum(course.lessons.length) }))} · ${esc(t(`lesson.${lesson.type}`))} · ${esc(fmtMinutes(lesson.duration))}</span>
      <h2>${esc(tx(lesson.title))}</h2>
      <p class="muted">${esc(tx(lesson.summary))}</p>
    </div>
    <div class="row">
      ${open ? (done
        ? `<span class="chip chip--success">${icon('check')}${esc(t('course.completed'))}</span>`
        : `<button type="button" class="btn btn--accent" data-complete>${icon('check')}${esc(t('course.markComplete'))}</button>`) : ''}
      ${next ? `<button type="button" class="btn btn--ghost" data-goto="${esc(next.id)}">${esc(t('course.next'))}${icon('arrow', 'flip-rtl')}</button>` : ''}
    </div>`;
  $('[data-complete]', $('#lesson-bar'))?.addEventListener('click', () => markDone(lesson));
}

function markDone(lesson) {
  if (!lessonOpen(lesson)) return;
  const wasNew = completeLesson(course, lesson);
  if (!wasNew) return;
  toast(t('toast.lessonDone'));
  renderLessonBar();
  renderCurriculum();
  renderEnrollBox();
  if (progress(course) === 100 && course.quizId && !bestAttempt(course.quizId)?.passed) toast(t('toast.readyForQuiz'), 'info');
}

/* ------------------------------------------------------------ curriculum */
function renderCurriculum() {
  const done = doneIds();
  const p = progress(course);
  const best = course.quizId ? bestAttempt(course.quizId) : null;
  const complete = isComplete(course);
  $('#curriculum').innerHTML = `
    <div class="curriculum__head">
      <div class="row"><h2 class="card__title" style="margin:0">${esc(t('course.curriculum'))}</h2><span class="muted" style="font-size:13px">${esc(t('course.doneOf', { n: fmtNum(done.filter((id) => course.lessons.some((l) => l.id === id)).length), total: fmtNum(course.lessons.length) }))}</span></div>
      <div class="meter${p === 100 ? ' meter--success' : ''}" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(t('course.progress'))}"><span style="width:${p}%"></span></div>
    </div>
    <ol>
      ${course.lessons.map((l, i) => {
        const isDone = done.includes(l.id);
        const open = lessonOpen(l);
        const live = l.type === 'live' ? liveStatus(l) : null;
        return `<li class="lesson-item${l.id === currentId ? ' is-current' : ''}${isDone ? ' is-done' : ''}${open ? '' : ' is-locked'}">
          <a href="?id=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(l.id)}" data-goto="${esc(l.id)}"${l.id === currentId ? ' aria-current="true"' : ''}>
            <span class="lesson-item__state">${isDone ? icon('check') : open ? fmtNum(i + 1) : icon('lock')}</span>
            <span class="lesson-item__text"><b>${esc(tx(l.title))}</b>
              <span>${icon(lessonIcon(l))}${esc(t(`lesson.${l.type}`))} · ${esc(fmtMinutes(l.duration))}${l.preview && !canAccess(course) ? ` · ${esc(t('course.preview'))}` : ''}${live === 'live' ? ` · ${esc(t('course.live.now'))}` : ''}</span>
            </span>
          </a>
        </li>`;
      }).join('')}
    </ol>
    <div class="curriculum__foot">
      ${course.quizId ? `<a class="btn ${p === 100 ? 'btn--primary' : 'btn--ghost'} btn--block" href="quiz.html?id=${encodeURIComponent(course.quizId)}">${icon('target')}${esc(t('course.takeQuiz'))}${best ? ` · ${fmtNum(best.percent)}%` : ''}</a>` : ''}
      ${complete
        ? `<a class="btn btn--accent btn--block" href="certificate.html?course=${encodeURIComponent(course.id)}">${icon('award')}${esc(t('course.viewCertificate'))}</a>`
        : `<a class="btn btn--ghost btn--block" href="certificate.html?course=${encodeURIComponent(course.id)}">${icon('award')}${esc(t('course.certificatePreview'))}</a>
           <p class="muted" style="font-size:12.5px;text-align:center">${esc(t('course.certificateHint'))}</p>`}
    </div>`;
}

/* ------------------------------------------------------------ enrol box */
function renderEnrollBox() {
  const e = enrollment(course.id);
  const p = progress(course);
  let main;
  if (e) {
    main = `<div class="stack" style="gap:10px">
        <div class="row" style="justify-content:space-between"><span class="chip chip--success">${icon('check')}${esc(t('course.enrolled'))}</span><b>${fmtNum(p)}%</b></div>
        <div class="meter meter--lg${p === 100 ? ' meter--success' : ''}"><span style="width:${p}%"></span></div>
      </div>
      <button type="button" class="btn btn--primary btn--block btn--lg" data-continue>${esc(p ? t('course.continue') : t('course.start'))}<span class="btn__arrow">${icon('arrow', 'flip-rtl')}</span></button>`;
  } else if (!course.price || hasPlanAccess()) {
    main = `<div class="enroll-box__price">${esc(course.price ? t('course.includedInPlan') : t('common.free'))}</div>
      <button type="button" class="btn btn--primary btn--block btn--lg" data-enroll>${esc(t('course.enrollFree'))}<span class="btn__arrow">${icon('arrow', 'flip-rtl')}</span></button>`;
  } else {
    main = `<div class="enroll-box__price">${esc(fmtPrice(course.price))}</div>
      <a class="btn btn--primary btn--block btn--lg" href="checkout.html?course=${encodeURIComponent(course.id)}">${esc(t('course.buy'))}<span class="btn__arrow">${icon('arrow', 'flip-rtl')}</span></a>
      <a class="btn btn--ghost btn--block" href="pricing.html">${esc(t('course.orSubscribe'))}</a>`;
  }
  const lives = course.lessons.filter((l) => l.type === 'live').length;
  $('#enroll').innerHTML = `${courseCover(course)}
    <div class="enroll-box" style="padding:22px">
      ${main}
      <ul class="rules" style="font-size:14px;margin-top:6px">
        <li>${icon('clock')}${esc(t('course.inc.hours', { n: fmtNum(course.hours) }))}</li>
        <li>${icon('video')}${esc(t('course.inc.lessons', { n: fmtNum(course.lessons.length) }))}</li>
        ${lives ? `<li>${icon('live')}${esc(t('course.inc.live', { n: fmtNum(lives) }))}</li>` : ''}
        ${course.quizId ? `<li>${icon('target')}${esc(t('course.inc.quiz'))}</li>` : ''}
        <li>${icon('award')}${esc(t('course.inc.certificate'))}</li>
        <li>${icon('sparkles')}${esc(t('course.inc.assistant'))}</li>
      </ul>
    </div>`;
  $('[data-enroll]', $('#enroll'))?.addEventListener('click', () => {
    enroll(course.id);
    toast(t('toast.enrolled'));
    renderEnrollBox(); renderCurriculum(); renderLessonBar(); renderPlayer();
  });
  $('[data-continue]', $('#enroll'))?.addEventListener('click', () => {
    selectLesson(firstIncomplete().id);
    $('#learn').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/* ----------------------------------------------------------------- tabs */
function renderPanel() {
  const lesson = course.lessons.find((l) => l.id === currentId);
  const panel = $('#course-panel');
  if (activeTab === 'overview') {
    panel.innerHTML = `<div class="stack" style="gap:24px">
      <p class="lead" style="max-width:none">${esc(tx(course.description))}</p>
      <div><h3 class="card__title" style="margin-bottom:14px">${esc(t('course.outcomes'))}</h3>
        <ul class="outcomes">${course.outcomes.map((o) => `<li>${icon('check')}<span>${esc(tx(o))}</span></li>`).join('')}</ul></div>
      <div class="card"><div class="instructor">${avatar(tx(course.instructor.name), course.instructor.avatar, 'avatar--lg')}
        <div><span>${esc(t('course.instructor'))}</span><b>${esc(tx(course.instructor.name))}</b><span>${esc(tx(course.instructor.title))}</span></div></div></div>
    </div>`;
  } else if (activeTab === 'resources') {
    const mine = lesson.resources || [];
    const others = course.lessons.filter((l) => l.id !== lesson.id).flatMap((l) => (l.resources || []).map((r) => ({ ...r, lesson: l })));
    const item = (r) => `<a class="resource" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener">${icon('download')}<span>${esc(tx(r.label))}${r.lesson ? `<br><small class="muted">${esc(tx(r.lesson.title))}</small>` : ''}</span>${icon('external')}</a>`;
    panel.innerHTML = mine.length || others.length
      ? `<div class="stack">
          <h3 class="card__title">${esc(t('course.lessonResources'))}</h3>
          ${mine.length ? mine.map(item).join('') : `<p class="muted">${esc(t('course.noLessonResources'))}</p>`}
          ${others.length ? `<h3 class="card__title" style="margin-top:12px">${esc(t('course.allResources'))}</h3>${others.map(item).join('')}` : ''}
        </div>`
      : `<p class="muted">${esc(t('course.noResources'))}</p>`;
  } else if (activeTab === 'live') {
    const lives = course.lessons.filter((l) => l.type === 'live');
    panel.innerHTML = lives.length ? `<div class="card">${lives.map((l) => {
      const st = liveStatus(l);
      const d = new Date(l.startsAt);
      return `<a class="live-item" href="?id=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(l.id)}" data-goto="${esc(l.id)}">
        <span class="date-badge"><b>${esc(fmtDate(d, { day: 'numeric' }))}</b><span>${esc(fmtDate(d, { month: 'short' }))}</span></span>
        <span class="live-item__text"><b>${esc(tx(l.title))}</b><span>${esc(fmtDate(d, { weekday: 'long', hour: 'numeric', minute: '2-digit' }))} · ${esc(l.platform || '')}</span></span>
        <span class="chip ${st === 'live' ? 'chip--live' : st === 'ended' ? '' : 'chip--outline'}">${esc(t(`course.live.${st}`))}</span>
      </a>`;
    }).join('')}</div>` : `<p class="muted">${esc(t('course.noLive'))}</p>`;
  } else {
    const items = reviews.items.filter((r) => r.course === course.id);
    panel.innerHTML = `<div class="row" style="margin-bottom:18px">${stars(course.rating)}<span class="muted">${esc(t('common.reviews', { n: fmtNum(course.reviews) }))}</span></div>
      ${items.length ? `<div class="grid grid--2">${items.map((r) => reviewCard(r, catalog.courses).replace('class="review"', 'class="review" style="width:auto"')).join('')}</div>` : `<p class="muted">${esc(t('course.noReviews'))}</p>`}`;
  }
  $$('[data-goto]', panel).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); selectLesson(a.dataset.goto); $('#learn').scrollIntoView({ behavior: 'smooth' }); }));
}

function renderTabs() {
  const tabs = ['overview', 'resources', 'live', 'reviews'];
  $('#course-tabs').innerHTML = tabs.map((k) => `<button type="button" class="tab" role="tab" id="tab-${k}" aria-controls="course-panel" aria-selected="${activeTab === k}" tabindex="${activeTab === k ? 0 : -1}" data-tab="${k}">${esc(t(`course.tab.${k}`))}</button>`).join('');
  $('#course-panel').setAttribute('aria-labelledby', `tab-${activeTab}`);
  $$('[data-tab]').forEach((b) => {
    b.addEventListener('click', () => { activeTab = b.dataset.tab; renderTabs(); renderPanel(); });
    b.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(b.dataset.tab);
      const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!dir) return;
      const rtl = document.documentElement.dir === 'rtl' ? -1 : 1;
      activeTab = tabs[(i + dir * rtl + tabs.length) % tabs.length];
      renderTabs(); renderPanel();
      $(`#tab-${activeTab}`).focus();
    });
  });
}

function selectLesson(id) {
  if (!course.lessons.some((l) => l.id === id)) return;
  currentId = id;
  if (enrollment(course.id)) setLastLesson(course.id, id);
  const url = new URL(location.href);
  url.searchParams.set('lesson', id);
  history.replaceState(null, '', url);
  renderPlayer(); renderLessonBar(); renderCurriculum(); renderPanel();
}

/* --------------------------------------------------------------- render */
async function render() {
  [catalog, reviews] = await Promise.all([data.courses(), data.testimonials()]);
  course = catalog.courses.find((c) => c.id === param('id'));
  const root = $('#course-root');
  if (!course) {
    setTitle(t('course.notFound'));
    root.innerHTML = `<section class="container page-section"><div class="empty-state">${icon('search')}<h1>${esc(t('course.notFound'))}</h1>
      <a class="btn btn--primary" href="courses.html">${esc(t('course.browse'))}</a></div></section>`;
    return;
  }
  setTitle(tx(course.title));
  const e = enrollment(course.id);
  const wanted = param('lesson');
  currentId = course.lessons.some((l) => l.id === wanted) ? wanted : e ? firstIncomplete().id : course.lessons[0].id;
  const cat = catalog.categories.find((c) => c.id === course.category);
  const upcoming = course.lessons.find((l) => l.type === 'live' && liveStatus(l) !== 'ended');

  root.innerHTML = `
    <section class="page-hero">
      <span class="glow-orb" aria-hidden="true" style="background:hsl(${Number(course.hue) || 260} 90% 60%)"></span><span class="glow-orb" aria-hidden="true"></span>
      <div class="container">
        <nav class="breadcrumbs" aria-label="${esc(t('course.breadcrumbs'))}"><a href="index.html">${esc(t('nav.home'))}</a><span aria-hidden="true">/</span><a href="courses.html">${esc(t('nav.courses'))}</a><span aria-hidden="true">/</span><span>${esc(tx(course.title))}</span></nav>
        <div class="course-hero">
          <div class="stack" style="gap:20px">
            <div class="row" style="gap:8px">
              ${cat ? `<span class="chip chip--soft">${esc(tx(cat.label))}</span>` : ''}
              <span class="chip chip--outline">${esc(levelLabel(course.level))}</span>
              ${upcoming ? `<span class="chip ${liveStatus(upcoming) === 'live' ? 'chip--live' : 'chip--outline'}">${icon('live')}${esc(t('course.hasLive'))}</span>` : ''}
            </div>
            <h1 class="display" style="font-size:clamp(32px,4.4vw,58px)">${esc(tx(course.title))}</h1>
            <p class="lead">${esc(tx(course.subtitle))}</p>
            <div class="course-hero__meta">
              <span>${stars(course.rating)}<span class="muted">(${esc(fmtCompact(course.reviews))})</span></span>
              <span>${icon('users')}${esc(t('common.students', { n: fmtCompact(course.students) }))}</span>
              <span>${icon('clock')}${esc(t('common.hours', { n: fmtNum(course.hours) }))}</span>
              <span>${icon('book')}${esc(t('common.lessons', { n: fmtNum(course.lessons.length) }))}</span>
            </div>
            <div class="instructor">${avatar(tx(course.instructor.name), course.instructor.avatar)}<div><b>${esc(tx(course.instructor.name))}</b><span>${esc(tx(course.instructor.title))}</span></div></div>
          </div>
          <aside class="card card--glow" id="enroll" style="padding:0;overflow:hidden"></aside>
        </div>
      </div>
    </section>
    <section class="container" id="learn" style="padding-bottom:clamp(64px,8vw,110px);scroll-margin-top:100px">
      <div class="learn">
        <div>
          <div id="player-host"></div>
          <div class="lesson-bar" id="lesson-bar"></div>
          <div class="tabs panel-tabs" role="tablist" id="course-tabs" aria-label="${esc(t('course.sections'))}"></div>
          <div class="panel" role="tabpanel" id="course-panel"></div>
        </div>
        <aside class="card curriculum" id="curriculum" aria-label="${esc(t('course.curriculum'))}"></aside>
      </div>
    </section>`;

  renderEnrollBox();
  renderPlayer();
  renderLessonBar();
  renderCurriculum();
  renderTabs();
  renderPanel();

  // Delegated navigation inside the curriculum / lesson bar.
  root.onclick = (ev) => {
    const a = ev.target.closest('#curriculum [data-goto], #lesson-bar [data-goto]');
    if (!a) return;
    ev.preventDefault();
    selectLesson(a.dataset.goto);
    if (innerWidth < 1080) $('#learn').scrollIntoView({ behavior: 'smooth' });
  };
}

boot(render);
