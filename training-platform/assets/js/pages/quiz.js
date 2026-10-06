// Quiz engine: single / multiple choice, true-false and short text answers;
// exam mode (results at the end) and practice mode (instant feedback);
// timer, flags, question palette, partial credit, negative marking and a
// configurable grading scale. Results are saved to the learner's dashboard.
import {
  app, boot, data, t, tx, esc, icon, fmtNum, fmtDate, fmtClock, canAccess, attemptsFor, bestAttempt,
  addAttempt, isComplete, gradeFor, confirmDialog, toast, setTitle, param, requireAuth, $, $$
} from '../app.js';

let quiz, scale, course, questions, answers, flags, checked, index, startedAt, timerId, phase;

const KEYS = { ar: ['أ', 'ب', 'ج', 'د', 'هـ', 'و'], en: ['A', 'B', 'C', 'D', 'E', 'F'] };
const keyFor = (i) => (KEYS[app.lang] || KEYS.en)[i] || String(i + 1);

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const normalize = (s) => String(s ?? '').trim().toLowerCase()
  .replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[.,;:!?؟،"'`()]/g, '').replace(/\s+/g, ' ');

function prepare() {
  const qs = quiz.shuffleQuestions ? shuffle(quiz.questions) : [...quiz.questions];
  return qs.map((q) => {
    const options = (q.options || []).map((label, i) => ({ i, label }));
    return { ...q, points: q.points ?? 1, options: quiz.shuffleOptions ? shuffle(options) : options };
  });
}

const isAnswered = (q) => {
  const a = answers[q.id];
  return !(a == null || a === '' || (Array.isArray(a) && !a.length));
};

function score(q) {
  const max = q.points;
  const a = answers[q.id];
  if (!isAnswered(q)) return { earned: 0, max, status: 'skipped' };
  const neg = Number(quiz.negativeMarking || 0);
  if (q.type === 'single' || q.type === 'truefalse') {
    return a === q.answer ? { earned: max, max, status: 'correct' } : { earned: -neg, max, status: 'wrong' };
  }
  if (q.type === 'multiple') {
    const correct = new Set(q.answer);
    const right = a.filter((x) => correct.has(x)).length;
    const wrong = a.length - right;
    if (right === correct.size && !wrong) return { earned: max, max, status: 'correct' };
    if (!quiz.partialCredit) return { earned: 0, max, status: 'wrong' };
    const frac = Math.max(0, (right - wrong) / correct.size);
    return { earned: max * frac, max, status: frac > 0 ? 'partial' : 'wrong' };
  }
  const ok = (q.answer || []).some((acc) => normalize(acc) === normalize(a));
  return ok ? { earned: max, max, status: 'correct' } : { earned: 0, max, status: 'wrong' };
}

function answerText(q, value) {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return t('quiz.noAnswer');
  if (q.type === 'truefalse') return value ? t('quiz.true') : t('quiz.false');
  if (q.type === 'text') {
    if (!Array.isArray(value)) return String(value);
    const arabic = (v) => /[\u0600-\u06FF]/.test(v);
    return value.find((v) => arabic(v) === (app.lang === 'ar')) || value[0];
  }
  const list = Array.isArray(value) ? value : [value];
  return list.map((i) => tx(q.options.find((o) => o.i === i)?.label)).join(app.lang === 'ar' ? '، ' : ', ');
}

/* ---------------------------------------------------------------- timer */
function stopTimer() { clearInterval(timerId); timerId = null; }

function remaining() {
  return quiz.timeLimit ? quiz.timeLimit * 60 - (Date.now() - startedAt) / 1000 : null;
}

function tickTimer() {
  const el = $('#quiz-timer');
  const left = remaining();
  if (left == null) return;
  if (el) {
    el.querySelector('span').textContent = fmtClock(left);
    el.classList.toggle('is-low', left < 60);
  }
  if (left <= 0) {
    stopTimer();
    toast(t('quiz.timeUp'), 'info');
    finish();
  }
}

/* ---------------------------------------------------------------- views */
function renderIntro(root) {
  phase = 'intro';
  const attempts = attemptsFor(quiz.id);
  const best = bestAttempt(quiz.id);
  const locked = course && !canAccess(course);
  root.innerHTML = `<div class="quiz-shell quiz-intro">
    <nav class="breadcrumbs"><a href="courses.html">${esc(t('nav.courses'))}</a><span aria-hidden="true">/</span>${course ? `<a href="course.html?id=${encodeURIComponent(course.id)}">${esc(tx(course.title))}</a><span aria-hidden="true">/</span>` : ''}<span>${esc(t('quiz.label'))}</span></nav>
    <div class="stack" style="gap:12px">
      <span class="eyebrow">${esc(t(quiz.mode === 'practice' ? 'quiz.mode.practice' : 'quiz.mode.exam'))}</span>
      <h1 class="display" style="font-size:clamp(30px,4.2vw,52px)">${esc(tx(quiz.title))}</h1>
      <p class="lead">${esc(tx(quiz.description))}</p>
    </div>
    <div class="quiz-facts">
      <div class="quiz-fact">${icon('book')}<b>${fmtNum(quiz.questions.length)}</b><span>${esc(t('quiz.questions'))}</span></div>
      <div class="quiz-fact">${icon('clock')}<b>${quiz.timeLimit ? esc(t('common.min', { n: fmtNum(quiz.timeLimit) })) : '∞'}</b><span>${esc(t('quiz.timeLimit'))}</span></div>
      <div class="quiz-fact">${icon('target')}<b>${fmtNum(quiz.passMark)}%</b><span>${esc(t('quiz.passMark'))}</span></div>
      <div class="quiz-fact">${icon('trophy')}<b>${best ? `${fmtNum(best.percent)}%` : '—'}</b><span>${esc(t('quiz.best'))}${attempts.length ? ` · ${esc(t('quiz.attemptsCount', { n: fmtNum(attempts.length) }))}` : ''}</span></div>
    </div>
    <div class="card">
      <h2 class="card__title" style="margin-bottom:14px">${esc(t('quiz.rulesTitle'))}</h2>
      <ul class="rules">
        <li>${icon('check')}<span>${esc(t(quiz.mode === 'practice' ? 'quiz.rule.practice' : 'quiz.rule.exam'))}</span></li>
        ${quiz.timeLimit ? `<li>${icon('clock')}<span>${esc(t('quiz.rule.time', { n: fmtNum(quiz.timeLimit) }))}</span></li>` : ''}
        ${quiz.partialCredit ? `<li>${icon('check')}<span>${esc(t('quiz.rule.partial'))}</span></li>` : ''}
        ${quiz.negativeMarking ? `<li>${icon('warning')}<span>${esc(t('quiz.rule.negative', { n: fmtNum(quiz.negativeMarking) }))}</span></li>` : ''}
        <li>${icon('flag')}<span>${esc(t('quiz.rule.flag'))}</span></li>
        <li>${icon('award')}<span>${esc(t('quiz.rule.pass', { n: fmtNum(quiz.passMark) }))}</span></li>
      </ul>
    </div>
    ${locked ? `<div class="cert-locked">${icon('lock')}<div><b>${esc(t('quiz.locked'))}</b><p class="muted">${esc(t('quiz.lockedText'))}</p>
        <div class="row" style="margin-top:12px"><a class="btn btn--primary btn--sm" href="course.html?id=${encodeURIComponent(course.id)}#enroll">${esc(t('course.unlock'))}</a></div></div></div>`
      : `<div class="row"><button type="button" class="btn btn--primary btn--lg" data-start>${esc(attempts.length ? t('quiz.retake') : t('quiz.start'))}<span class="btn__arrow">${icon('arrow', 'flip-rtl')}</span></button>
        ${course ? `<a class="btn btn--ghost btn--lg" href="course.html?id=${encodeURIComponent(course.id)}">${esc(t('quiz.backToCourse'))}</a>` : ''}</div>`}
    ${attempts.length ? `<div class="table-wrap"><table class="table">
      <caption class="sr-only">${esc(t('quiz.history'))}</caption>
      <thead><tr><th>${esc(t('dash.table.date'))}</th><th class="num">${esc(t('dash.table.score'))}</th><th>${esc(t('dash.table.grade'))}</th><th>${esc(t('dash.table.status'))}</th></tr></thead>
      <tbody>${[...attempts].reverse().map((a) => `<tr><td>${esc(fmtDate(a.date, { day: 'numeric', month: 'short', year: 'numeric' }))}</td><td class="num">${fmtNum(a.percent)}%</td><td>${esc(a.grade)}</td><td><span class="chip ${a.passed ? 'chip--success' : 'chip--danger'}">${esc(a.passed ? t('dash.passed') : t('dash.failed'))}</span></td></tr>`).join('')}</tbody>
    </table></div>` : ''}
  </div>`;
  $('[data-start]', root)?.addEventListener('click', start);
}

function start() {
  if (!requireAuth({ reason: t('auth.reason.quiz') })) return;
  questions = prepare();
  answers = {}; flags = new Set(); checked = {}; index = 0;
  startedAt = Date.now();
  phase = 'running';
  stopTimer();
  if (quiz.timeLimit) timerId = setInterval(tickTimer, 1000);
  renderQuestion();
  $('#quiz-root').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function questionTypeLabel(q) {
  return t({ single: 'quiz.type.single', multiple: 'quiz.type.multiple', truefalse: 'quiz.type.truefalse', text: 'quiz.type.text' }[q.type]);
}

function optionsMarkup(q, locked) {
  const value = answers[q.id];
  const result = locked ? q : null;
  const cls = (isCorrect, isChosen) => (result ? (isCorrect ? ' is-correct' : isChosen ? ' is-wrong' : '') : '');
  if (q.type === 'text') {
    return `<div class="field"><label class="sr-only" for="q-text">${esc(t('quiz.typeAnswer'))}</label>
      <input class="input" id="q-text" autocomplete="off" placeholder="${esc(t('quiz.typeAnswer'))}" value="${esc(value ?? '')}"${locked ? ' disabled' : ''}></div>`;
  }
  if (q.type === 'truefalse') {
    return `<div class="options${locked ? ' is-locked' : ''}" role="radiogroup" aria-labelledby="q-title">
      ${[true, false].map((v, i) => `<label class="option${cls(q.answer === v, value === v)}">
        <input type="radio" name="q" value="${v}"${value === v ? ' checked' : ''}${locked ? ' disabled' : ''}>
        <span class="option__key">${esc(keyFor(i))}</span><span>${esc(v ? t('quiz.true') : t('quiz.false'))}</span></label>`).join('')}
    </div>`;
  }
  const multi = q.type === 'multiple';
  const chosen = multi ? (value || []) : [value];
  return `<div class="options${locked ? ' is-locked' : ''}" role="${multi ? 'group' : 'radiogroup'}" aria-labelledby="q-title">
    ${q.options.map((o, i) => {
      const isCorrect = multi ? q.answer.includes(o.i) : q.answer === o.i;
      const isChosen = chosen.includes(o.i);
      return `<label class="option${multi ? ' option--multi' : ''}${cls(isCorrect, isChosen)}">
        <input type="${multi ? 'checkbox' : 'radio'}" name="q" value="${o.i}"${isChosen ? ' checked' : ''}${locked ? ' disabled' : ''}>
        <span class="option__key">${esc(keyFor(i))}</span><span>${esc(tx(o.label))}</span></label>`;
    }).join('')}
  </div>`;
}

function feedbackMarkup(q) {
  const r = score(q);
  const ok = r.status === 'correct';
  const title = ok ? t('quiz.correct') : r.status === 'partial' ? t('quiz.partial') : t('quiz.incorrect');
  return `<div class="feedback ${ok ? 'feedback--ok' : 'feedback--bad'}" role="status">
    ${icon(ok ? 'success' : 'warning')}
    <div><b>${esc(title)}</b>
      ${!ok ? `<p>${esc(t('quiz.correctAnswer'))}: ${esc(answerText(q, q.answer))}</p>` : ''}
      ${q.explanation ? `<p>${esc(tx(q.explanation))}</p>` : ''}</div>
  </div>`;
}

function readInput() {
  const q = questions[index];
  const root = $('#quiz-root');
  if (q.type === 'text') { answers[q.id] = $('#q-text', root)?.value ?? ''; return; }
  if (q.type === 'multiple') { answers[q.id] = $$('input[name="q"]:checked', root).map((i) => Number(i.value)); return; }
  const sel = $('input[name="q"]:checked', root);
  if (!sel) return;
  answers[q.id] = q.type === 'truefalse' ? sel.value === 'true' : Number(sel.value);
}

function renderQuestion() {
  const root = $('#quiz-root');
  const q = questions[index];
  const practice = quiz.mode === 'practice';
  const locked = practice && checked[q.id];
  const answeredCount = questions.filter(isAnswered).length;
  const last = index === questions.length - 1;

  root.innerHTML = `<div class="quiz-shell">
    <div class="quiz-top">
      <div class="stack" style="gap:2px"><span class="muted" style="font-size:13px">${esc(tx(quiz.title))}</span>
        <b>${esc(t('quiz.questionOf', { n: fmtNum(index + 1), total: fmtNum(questions.length) }))}</b></div>
      <div class="row">
        ${quiz.timeLimit ? `<span class="quiz-timer" id="quiz-timer" role="timer" aria-label="${esc(t('quiz.timeLeft'))}">${icon('clock')}<span>${fmtClock(remaining())}</span></span>` : ''}
        ${practice ? '' : `<button type="button" class="btn btn--ghost btn--sm" data-flag aria-pressed="${flags.has(q.id)}">${icon('flag')}${esc(flags.has(q.id) ? t('quiz.flagged') : t('quiz.flag'))}</button>`}
      </div>
    </div>
    <div class="meter" role="progressbar" aria-valuenow="${answeredCount}" aria-valuemin="0" aria-valuemax="${questions.length}" aria-label="${esc(t('quiz.answered'))}"><span style="width:${(answeredCount / questions.length) * 100}%"></span></div>
    <article class="card question-card" style="margin-top:18px">
      <div class="question-card__label"><span>${esc(questionTypeLabel(q))}</span><span>${esc(t('quiz.points', { n: fmtNum(q.points) }))}</span></div>
      <h2 id="q-title">${esc(tx(q.question))}</h2>
      ${optionsMarkup(q, locked)}
      ${locked ? feedbackMarkup(q) : ''}
    </article>
    <div class="quiz-nav">
      <button type="button" class="btn btn--ghost" data-prev${index === 0 ? ' disabled' : ''}>${icon('arrow', 'flip-ltr')}${esc(t('quiz.prev'))}</button>
      <div class="row">
        ${practice && !locked ? `<button type="button" class="btn btn--accent" data-check${isAnswered(q) ? '' : ' disabled'}>${esc(t('quiz.check'))}</button>` : ''}
        ${last ? `<button type="button" class="btn btn--primary" data-submit>${esc(t('quiz.submit'))}${icon('check')}</button>`
          : `<button type="button" class="btn ${practice && !locked ? 'btn--ghost' : 'btn--primary'}" data-next>${esc(t('quiz.next'))}${icon('arrow', 'flip-rtl')}</button>`}
      </div>
    </div>
    <nav class="palette" aria-label="${esc(t('quiz.palette'))}">
      ${questions.map((x, i) => `<button type="button" data-jump="${i}" class="${i === index ? 'is-current ' : ''}${isAnswered(x) ? 'is-answered ' : ''}${flags.has(x.id) ? 'is-flagged' : ''}" aria-label="${esc(t('quiz.questionOf', { n: i + 1, total: questions.length }))}${flags.has(x.id) ? ` (${esc(t('quiz.flagged'))})` : ''}"${i === index ? ' aria-current="step"' : ''}>${fmtNum(i + 1)}</button>`).join('')}
    </nav>
    <p class="kbd-hint" style="margin-top:14px">${esc(t('quiz.kbd'))}</p>
  </div>`;

  const onChange = () => {
    readInput();
    const btn = $('[data-check]', root);
    if (btn) btn.disabled = !isAnswered(q);
    const pal = $(`[data-jump="${index}"]`, root);
    pal?.classList.toggle('is-answered', isAnswered(q));
    const meter = $('.meter span', root);
    if (meter) meter.style.width = `${(questions.filter(isAnswered).length / questions.length) * 100}%`;
  };
  root.querySelectorAll('input[name="q"], #q-text').forEach((el) => el.addEventListener(el.type === 'text' ? 'input' : 'change', onChange));
  $('[data-prev]', root)?.addEventListener('click', () => go(index - 1));
  $('[data-next]', root)?.addEventListener('click', () => go(index + 1));
  $('[data-submit]', root)?.addEventListener('click', submit);
  $('[data-check]', root)?.addEventListener('click', () => { readInput(); checked[q.id] = true; renderQuestion(); });
  $('[data-flag]', root)?.addEventListener('click', () => { flags.has(q.id) ? flags.delete(q.id) : flags.add(q.id); renderQuestion(); });
  $$('[data-jump]', root).forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.jump))));
  $('#q-text', root)?.focus({ preventScroll: true });
}

function go(i) {
  readInput();
  if (i < 0 || i >= questions.length) return;
  index = i;
  renderQuestion();
}

async function submit() {
  readInput();
  const unanswered = questions.filter((q) => !isAnswered(q)).length;
  if (unanswered && !(await confirmDialog(t('quiz.confirmTitle'), t('quiz.confirmText', { n: fmtNum(unanswered) })))) return;
  finish();
}

function finish() {
  if (phase !== 'running') return;
  phase = 'result';
  stopTimer();
  const durationSec = Math.round((Date.now() - startedAt) / 1000);
  const results = questions.map((q) => ({ q, ...score(q) }));
  const max = results.reduce((s, r) => s + r.max, 0);
  const earned = Math.max(0, results.reduce((s, r) => s + r.earned, 0));
  const percent = max ? Math.round((earned / max) * 100) : 0;
  const attempt = addAttempt(quiz, scale, { percent, durationSec, score: Math.round(earned * 100) / 100, max });
  renderResult(results, attempt, earned, max);
}

function renderResult(results, attempt, earned, max) {
  const root = $('#quiz-root');
  const grade = gradeFor(attempt.percent, scale);
  const count = (s) => results.filter((r) => r.status === s).length;
  const C = 2 * Math.PI * 88;
  const certReady = course && isComplete(course);
  root.innerHTML = `<div class="quiz-shell stack" style="gap:28px">
    <div class="card card--glow" style="padding:clamp(24px,4vw,44px)">
      <div class="result-hero">
        <div class="score-ring ${attempt.passed ? 'is-pass' : 'is-fail'}" role="img" aria-label="${esc(t('quiz.result.score'))}: ${attempt.percent}%">
          <svg viewBox="0 0 200 200"><circle class="track" cx="100" cy="100" r="88"/><circle class="bar" cx="100" cy="100" r="88" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>
          <div class="score-ring__value"><b>${fmtNum(attempt.percent)}%</b><span>${esc(t('quiz.result.score'))}</span></div>
        </div>
        <div class="stack" style="gap:12px">
          <span class="chip ${attempt.passed ? 'chip--success' : 'chip--danger'}" style="width:fit-content">${icon(attempt.passed ? 'success' : 'warning')}${esc(attempt.passed ? t('quiz.result.passed') : t('quiz.result.failed'))}</span>
          <h1 class="h2">${esc(attempt.passed ? t('quiz.result.passTitle') : t('quiz.result.failTitle'))}</h1>
          <p class="lead">${esc(t('quiz.result.grade'))}: <b style="color:var(--text)">${esc(grade.letter)} · ${esc(tx(grade.label))}</b> — ${esc(t('quiz.result.passMark', { n: fmtNum(quiz.passMark) }))}</p>
          <div class="row">
            <button type="button" class="btn btn--primary" data-retry>${icon('refresh')}${esc(t('quiz.retry'))}</button>
            ${certReady ? `<a class="btn btn--accent" href="certificate.html?course=${encodeURIComponent(course.id)}">${icon('award')}${esc(t('quiz.viewCertificate'))}</a>` : ''}
            ${course ? `<a class="btn btn--ghost" href="course.html?id=${encodeURIComponent(course.id)}">${esc(t('quiz.backToCourse'))}</a>` : ''}
            <a class="btn btn--ghost" href="dashboard.html">${esc(t('nav.dashboard'))}</a>
          </div>
        </div>
      </div>
      <div class="result-stats">
        <div class="quiz-fact">${icon('success')}<b>${fmtNum(count('correct'))}</b><span>${esc(t('quiz.result.correct'))}</span></div>
        <div class="quiz-fact">${icon('warning')}<b>${fmtNum(count('wrong') + count('partial'))}</b><span>${esc(t('quiz.result.wrong'))}${count('partial') ? ` (${esc(t('quiz.result.partialN', { n: fmtNum(count('partial')) }))})` : ''}</span></div>
        <div class="quiz-fact">${icon('info')}<b>${fmtNum(count('skipped'))}</b><span>${esc(t('quiz.result.skipped'))}</span></div>
        <div class="quiz-fact">${icon('clock')}<b>${fmtClock(attempt.durationSec)}</b><span>${esc(t('quiz.result.time'))} · ${esc(t('quiz.result.pointsOf', { n: fmtNum(Math.round(earned * 100) / 100), total: fmtNum(max) }))}</span></div>
      </div>
    </div>
    <section class="stack" aria-labelledby="review-title">
      <h2 class="h3" id="review-title">${esc(t('quiz.review'))}</h2>
      ${results.map((r, i) => `<article class="review-item is-${r.status === 'skipped' ? 'wrong' : r.status}">
        <div class="row" style="justify-content:space-between"><span class="muted" style="font-size:13px">${esc(t('quiz.questionOf', { n: fmtNum(i + 1), total: fmtNum(results.length) }))}</span>
          <span class="chip ${r.status === 'correct' ? 'chip--success' : r.status === 'partial' ? 'chip--warning' : 'chip--danger'}">${esc(t(`quiz.status.${r.status}`))} · ${esc(t('quiz.points', { n: fmtNum(Math.round(r.earned * 100) / 100) }))}</span></div>
        <h3>${esc(tx(r.q.question))}</h3>
        <dl><dt>${esc(t('quiz.yourAnswer'))}</dt><dd>${esc(answerText(r.q, answers[r.q.id]))}</dd>
          ${r.status !== 'correct' ? `<dt>${esc(t('quiz.correctAnswer'))}</dt><dd>${esc(answerText(r.q, r.q.answer))}</dd>` : ''}</dl>
        ${r.q.explanation ? `<p class="explain"><b>${esc(t('quiz.explanation'))}:</b> ${esc(tx(r.q.explanation))}</p>` : ''}
      </article>`).join('')}
    </section>
  </div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const bar = $('.score-ring .bar', root);
    if (bar) bar.style.strokeDashoffset = String(C * (1 - attempt.percent / 100));
  }));
  $('[data-retry]', root).addEventListener('click', start);
  root.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* --------------------------------------------------------- quiz picker */
function renderPicker(root, all, courses) {
  setTitle(t('quiz.pickTitle'));
  root.innerHTML = `<div class="stack" style="gap:28px">
    <div class="stack" style="gap:12px"><span class="eyebrow">${esc(t('quiz.label'))}</span><h1 class="display" style="font-size:clamp(30px,4.2vw,52px)">${esc(t('quiz.pickTitle'))}</h1><p class="lead">${esc(t('quiz.pickText'))}</p></div>
    <div class="grid grid--3">${all.map((q) => {
      const c = courses.find((x) => x.id === q.courseId);
      const best = bestAttempt(q.id);
      return `<a class="card stack reveal" href="quiz.html?id=${encodeURIComponent(q.id)}" style="gap:12px">
        <span class="chip ${q.mode === 'practice' ? 'chip--soft' : 'chip--outline'}" style="width:fit-content">${esc(t(`quiz.mode.${q.mode}`))}</span>
        <h2 class="card__title">${esc(tx(q.title))}</h2>
        <p class="muted" style="font-size:14px">${esc(c ? tx(c.title) : '')}</p>
        <div class="row muted" style="font-size:13px">${icon('book')}${fmtNum(q.questions.length)} · ${icon('clock')}${q.timeLimit ? esc(t('common.min', { n: fmtNum(q.timeLimit) })) : '∞'}${best ? ` · ${icon('trophy')}${fmtNum(best.percent)}%` : ''}</div>
      </a>`;
    }).join('')}</div>
  </div>`;
}

/* --------------------------------------------------------------- render */
async function render() {
  const [quizzes, catalog] = await Promise.all([data.quizzes(), data.courses()]);
  scale = quizzes.gradingScale;
  const root = $('#quiz-root');
  const id = param('id');
  if (!id) { renderPicker(root, quizzes.quizzes, catalog.courses); return; }
  const found = quizzes.quizzes.find((q) => q.id === id);
  if (!found) {
    root.innerHTML = `<div class="empty-state">${icon('search')}<h1>${esc(t('quiz.notFound'))}</h1><a class="btn btn--primary" href="quiz.html">${esc(t('quiz.pickTitle'))}</a></div>`;
    return;
  }
  // A language switch mid-quiz keeps the answers and simply redraws.
  if (quiz?.id === found.id && phase === 'running') { renderQuestion(); return; }
  if (quiz?.id === found.id && phase === 'result') return;
  quiz = found;
  course = catalog.courses.find((c) => c.id === quiz.courseId) || null;
  setTitle(tx(quiz.title));
  renderIntro(root);
}

document.addEventListener('keydown', (e) => {
  if (phase !== 'running' || e.target.closest('input[type="text"], input:not([type]), textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  const n = Number(e.key);
  const inputs = $$('#quiz-root input[name="q"]:not([disabled])');
  if (n >= 1 && n <= inputs.length) {
    const el = inputs[n - 1];
    el.checked = el.type === 'checkbox' ? !el.checked : true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (e.key === 'Enter' && !e.target.closest('button, a')) {
    ($('#quiz-root [data-check]:not([disabled])') || $('#quiz-root [data-next]') || $('#quiz-root [data-submit]'))?.click();
  }
});

boot(render);
