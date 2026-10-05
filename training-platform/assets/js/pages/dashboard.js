// Learner dashboard: KPIs, enrolled courses with progress, weekly learning
// chart, quiz history, announcements, upcoming live sessions and certificates.
import {
  app, boot, data, t, tx, esc, icon, fmtNum, fmtDate, fmtMinutes, safeUrl, getState, update, resetState,
  enrollment, progress, isComplete, bestAttempt, upcomingLive, learnerName, avatar, courseCover,
  openModal, confirmDialog, toast, dayKey, setTitle, $, $$
} from '../app.js';

const DAY = 864e5;

function kpi(label, iconName, value, sub = '') {
  return `<div class="kpi reveal"><span class="kpi__label">${icon(iconName)}${esc(label)}</span><span class="kpi__value">${esc(value)}</span>${sub ? `<span class="kpi__sub">${esc(sub)}</span>` : ''}</div>`;
}

/* Weekly learning-time column chart (single series → no legend; the title names it). */
function activityChart(state) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * DAY);
    return { date: d, min: state.activity[dayKey(d)] || 0 };
  });
  const total = days.reduce((s, d) => s + d.min, 0);
  const W = 560, H = 220, padT = 26, padB = 30, padS = 40;
  const maxVal = Math.max(...days.map((d) => d.min), 1);
  const step = [15, 30, 60, 120, 240].find((s) => s * 4 >= maxVal) || 240;
  const top = Math.ceil(maxVal / step) * step;
  const plotH = H - padT - padB;
  const y = (v) => padT + plotH - (v / top) * plotH;
  const rtl = document.documentElement.dir === 'rtl';
  const band = (W - padS - 12) / 7;
  const barW = Math.min(24, band * 0.5);
  const xAt = (i) => {
    const slot = rtl ? 6 - i : i;
    return (rtl ? 12 : padS) + slot * band + band / 2;
  };
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const maxIdx = days.reduce((m, d, i) => (d.min > days[m].min ? i : m), 0);

  const bar = (cx, v) => {
    if (!v) return '';
    const x = cx - barW / 2, yy = y(v), base = y(0), r = Math.min(4, base - yy);
    return `<path class="bar" d="M${x},${base}V${yy + r}Q${x},${yy} ${x + r},${yy}H${x + barW - r}Q${x + barW},${yy} ${x + barW},${yy + r}V${base}Z"/>`;
  };

  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="chart-title chart-desc">
    <desc id="chart-desc">${esc(t('dash.activity.desc', { total: fmtMinutes(total) }))}</desc>
    ${ticks.map((v) => `<line class="${v ? 'grid-line' : 'baseline'}" x1="${rtl ? 12 : padS}" x2="${rtl ? W - padS : W - 12}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="axis" x="${rtl ? W - padS + 8 : padS - 8}" y="${y(v) + 4}" text-anchor="${rtl ? 'start' : 'end'}">${esc(fmtNum(v))}</text>`).join('')}
    ${days.map((d, i) => {
      const cx = xAt(i);
      return `<g>
        <rect class="bar-hit" x="${cx - band / 2}" y="${padT}" width="${band}" height="${plotH}" tabindex="0" data-i="${i}" aria-label="${esc(`${fmtDate(d.date, { weekday: 'long' })}: ${fmtMinutes(d.min)}`)}"/>
        ${bar(cx, d.min)}
        ${i === maxIdx && d.min ? `<text class="label" x="${cx}" y="${y(d.min) - 8}" text-anchor="middle">${esc(fmtMinutes(d.min))}</text>` : ''}
        <text class="axis" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(fmtDate(d.date, { weekday: 'short' }))}</text>
      </g>`;
    }).join('')}
  </svg>`;

  return {
    total,
    html: `<div class="chart" id="activity-chart">${svg}<div class="chart-tip" hidden></div></div>
      <details style="margin-top:12px"><summary class="muted" style="cursor:pointer;font-size:13px">${esc(t('dash.showTable'))}</summary>
        <div class="table-wrap" style="margin-top:10px"><table class="table"><thead><tr><th>${esc(t('dash.table.day'))}</th><th class="num">${esc(t('dash.table.minutes'))}</th></tr></thead>
        <tbody>${days.map((d) => `<tr><td>${esc(fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'short' }))}</td><td class="num">${fmtNum(d.min)}</td></tr>`).join('')}</tbody></table></div>
      </details>`,
    bind() {
      const chart = $('#activity-chart');
      const tip = $('.chart-tip', chart);
      const show = (el) => {
        const d = days[Number(el.dataset.i)];
        const box = chart.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        tip.innerHTML = `<b>${esc(fmtMinutes(d.min))}</b><span>${esc(fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'short' }))}</span>`;
        tip.style.left = `${r.left - box.left + r.width / 2}px`;
        tip.style.top = `${Math.max(0, (y(d.min) / H) * box.height)}px`;
        tip.hidden = false;
      };
      $$('.bar-hit', chart).forEach((el) => {
        el.addEventListener('pointerenter', () => show(el));
        el.addEventListener('focus', () => show(el));
        el.addEventListener('pointerleave', () => { tip.hidden = true; });
        el.addEventListener('blur', () => { tip.hidden = true; });
      });
    }
  };
}

function editProfile() {
  const s = getState();
  const dlg = openModal({
    title: t('dash.editProfile'),
    body: `<div class="form">
      <div class="field"><label for="pf-name">${esc(t('dash.profile.name'))}</label><input class="input" id="pf-name" value="${esc(tx(s.profile.name))}" maxlength="60" autocomplete="name"></div>
      <div class="field"><label for="pf-email">${esc(t('dash.profile.email'))}</label><input class="input ltr" id="pf-email" type="email" value="${esc(s.profile.email)}" maxlength="120" autocomplete="email"></div>
      <p class="field__hint">${esc(t('dash.profile.hint'))}</p>
    </div>`,
    actions: [
      { label: t('common.cancel') },
      {
        label: t('common.save'), primary: true,
        onClick: (d) => {
          const name = $('#pf-name', d).value.trim();
          const email = $('#pf-email', d).value.trim();
          update((st) => { if (name) st.profile.name = name; st.profile.email = email; });
          toast(t('toast.saved'));
          render();
        }
      }
    ]
  });
  setTimeout(() => $('#pf-name', dlg)?.focus(), 30);
}

async function render() {
  setTitle(t('nav.dashboard'));
  const [catalog, quizzes, ann, plans] = await Promise.all([data.courses(), data.quizzes(), data.announcements().catch(() => ({ items: [] })), data.plans()]);
  const state = getState();
  const courses = catalog.courses;
  const enrolled = courses.filter((c) => enrollment(c.id));
  const avg = enrolled.length ? Math.round(enrolled.reduce((s, c) => s + progress(c), 0) / enrolled.length) : 0;
  const passedQuizzes = new Set(state.attempts.filter((a) => a.passed).map((a) => a.quizId));
  const completed = courses.filter((c) => enrollment(c.id) && isComplete(c));
  const chart = activityChart(state);
  const plan = plans.plans.find((p) => p.id === state.plan?.id);
  const name = learnerName();

  $('#dash-head').innerHTML = `<div class="dash-head">
    <div class="dash-head__user">${avatar(name, state.profile.avatar, 'avatar--lg')}
      <div class="stack" style="gap:4px"><span class="muted">${esc(t('dash.welcome'))}</span><h1 class="h2">${esc(t('dash.hello', { name }))}</h1>
        <div class="row" style="gap:8px">${plan ? `<span class="chip chip--soft">${icon('sparkles')}${esc(t('dash.plan', { plan: tx(plan.name) }))}</span>` : `<a class="chip chip--outline" href="pricing.html">${esc(t('dash.noPlan'))}</a>`}
        ${state.profile.email ? `<span class="chip chip--outline ltr">${esc(state.profile.email)}</span>` : ''}</div></div></div>
    <div class="row"><button type="button" class="btn btn--ghost" data-edit>${icon('edit')}${esc(t('dash.editProfile'))}</button><a class="btn btn--primary" href="courses.html">${esc(t('dash.browse'))}${icon('arrow', 'flip-rtl')}</a></div>
  </div>
  ${state.demo ? `<div class="demo-banner" style="margin-top:24px">${icon('info')}<div style="flex:1">${esc(t('dash.demoNote'))}</div><button type="button" class="link-btn" data-reset>${esc(t('dash.reset'))}</button></div>` : ''}`;

  const quizTitle = (id) => tx(quizzes.quizzes.find((q) => q.id === id)?.title) || id;
  const attempts = [...state.attempts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const lives = upcomingLive(courses, enrolled.map((c) => c.id)).slice(0, 4);
  const items = [...(ann.items || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const unread = items.filter((i) => !state.read.includes(i.id)).length;

  $('#dash-root').innerHTML = `
    <section class="kpis" aria-label="${esc(t('dash.summary'))}">
      ${kpi(t('dash.kpi.courses'), 'book', fmtNum(enrolled.length), t('dash.kpi.coursesSub', { n: fmtNum(courses.length) }))}
      ${kpi(t('dash.kpi.progress'), 'chart', `${fmtNum(avg)}%`, t('dash.kpi.progressSub'))}
      ${kpi(t('dash.kpi.quizzes'), 'target', fmtNum(passedQuizzes.size), t('dash.kpi.quizzesSub', { n: fmtNum(state.attempts.length) }))}
      ${kpi(t('dash.kpi.certificates'), 'award', fmtNum(completed.length), t('dash.kpi.certificatesSub'))}
      ${kpi(t('dash.kpi.time'), 'clock', fmtMinutes(chart.total), t('dash.kpi.timeSub'))}
    </section>

    <div class="dash-grid">
      <div class="stack" style="gap:20px">
        <section class="card reveal" aria-labelledby="my-courses">
          <div class="card-head"><h2 id="my-courses">${esc(t('dash.myCourses'))}</h2><a class="text-link" href="courses.html">${esc(t('common.viewAll'))}${icon('arrow', 'flip-rtl')}</a></div>
          ${enrolled.length ? `<div class="stack" style="gap:12px">${enrolled.map((c) => {
            const p = progress(c);
            const e = enrollment(c.id);
            const done = isComplete(c);
            const best = c.quizId ? bestAttempt(c.quizId) : null;
            return `<article class="my-course">
              ${courseCover(c)}
              <div style="min-width:0">
                <h3>${esc(tx(c.title))}</h3>
                <div class="meter${p === 100 ? ' meter--success' : ''}" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(tx(c.title))}"><span style="width:${p}%"></span></div>
                <div class="my-course__meta"><span>${esc(t('course.progressValue', { n: fmtNum(p) }))} · ${esc(t('course.doneOf', { n: fmtNum(e.done.length), total: fmtNum(c.lessons.length) }))}</span>
                  <span>${best ? esc(t('dash.bestScore', { n: fmtNum(best.percent) })) : esc(t('dash.since', { date: fmtDate(e.at, { day: 'numeric', month: 'short' }) }))}</span></div>
              </div>
              ${done ? `<a class="btn btn--accent btn--sm" href="certificate.html?course=${encodeURIComponent(c.id)}">${icon('award')}${esc(t('dash.viewCertificate'))}</a>`
                : `<a class="btn btn--ink btn--sm" href="course.html?id=${encodeURIComponent(c.id)}">${esc(p ? t('course.continue') : t('course.start'))}${icon('arrow', 'flip-rtl')}</a>`}
            </article>`;
          }).join('')}</div>` : `<div class="empty-state">${icon('book')}<h2>${esc(t('dash.noCourses'))}</h2><a class="btn btn--primary" href="courses.html">${esc(t('dash.browse'))}</a></div>`}
        </section>

        <section class="card reveal" aria-labelledby="chart-title">
          <div class="card-head"><div><h2 id="chart-title">${esc(t('dash.activity'))}</h2><p class="muted" style="font-size:13px">${esc(t('dash.activity.caption'))}</p></div><b style="font-size:20px">${esc(fmtMinutes(chart.total))}</b></div>
          ${chart.html}
        </section>

        <section class="card reveal" aria-labelledby="results-title" id="results">
          <div class="card-head"><h2 id="results-title">${esc(t('dash.results'))}</h2><a class="text-link" href="quiz.html">${esc(t('dash.allQuizzes'))}${icon('arrow', 'flip-rtl')}</a></div>
          ${attempts.length ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>${esc(t('dash.table.quiz'))}</th><th>${esc(t('dash.table.date'))}</th><th class="num">${esc(t('dash.table.score'))}</th><th>${esc(t('dash.table.grade'))}</th><th>${esc(t('dash.table.status'))}</th><th><span class="sr-only">${esc(t('quiz.retake'))}</span></th></tr></thead>
            <tbody>${attempts.map((a) => `<tr>
              <td>${esc(quizTitle(a.quizId))}</td>
              <td>${esc(fmtDate(a.date, { day: 'numeric', month: 'short' }))}</td>
              <td class="num"><b>${fmtNum(a.percent)}%</b></td>
              <td>${esc(a.grade)}</td>
              <td><span class="chip ${a.passed ? 'chip--success' : 'chip--danger'}">${esc(a.passed ? t('dash.passed') : t('dash.failed'))}</span></td>
              <td><a class="link-btn" href="quiz.html?id=${encodeURIComponent(a.quizId)}">${esc(t('quiz.retake'))}</a></td>
            </tr>`).join('')}</tbody></table></div>` : `<p class="muted">${esc(t('dash.noResults'))}</p>`}
        </section>
      </div>

      <div class="stack" style="gap:20px">
        <section class="card reveal" id="announcements" aria-labelledby="ann-title" style="scroll-margin-top:100px">
          <div class="card-head"><h2 id="ann-title">${esc(t('dash.announcements'))}${unread ? ` <span class="chip chip--soft">${esc(t('notif.unread', { n: fmtNum(unread) }))}</span>` : ''}</h2>
            ${unread ? `<button type="button" class="link-btn" data-read-all>${esc(t('notif.markAll'))}</button>` : ''}</div>
          ${items.length ? `<div class="ann-list">${items.map((i) => `<article class="ann">
            <span class="notif__icon notif__icon--${esc(i.type)}">${icon(i.type || 'info')}</span>
            <div class="stack" style="gap:4px"><b>${esc(tx(i.title))}${state.read.includes(i.id) ? '' : ' <span class="unread-dot" aria-hidden="true"></span>'}</b>
              <p>${esc(tx(i.body))}</p>
              <div class="row" style="gap:10px"><time class="muted" datetime="${esc(i.date)}">${esc(fmtDate(i.date))}</time>${i.link ? `<a class="link-btn" href="${esc(safeUrl(i.link))}">${esc(t('common.learnMore'))}</a>` : ''}</div></div>
          </article>`).join('')}</div>` : `<p class="muted">${esc(t('notif.empty'))}</p>`}
        </section>

        <section class="card reveal" id="live" aria-labelledby="live-title" style="scroll-margin-top:100px">
          <div class="card-head"><h2 id="live-title">${esc(t('dash.live'))}</h2><span class="chip chip--live">${esc(t('course.live.badge'))}</span></div>
          ${lives.length ? lives.map(({ course, lesson, status }) => {
            const d = new Date(lesson.startsAt);
            return `<div class="live-item">
              <span class="date-badge"><b>${esc(fmtDate(d, { day: 'numeric' }))}</b><span>${esc(fmtDate(d, { month: 'short' }))}</span></span>
              <a class="live-item__text" href="course.html?id=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lesson.id)}"><b>${esc(tx(lesson.title))}</b><span>${esc(fmtDate(d, { weekday: 'short', hour: 'numeric', minute: '2-digit' }))} · ${esc(lesson.platform || '')}</span></a>
              ${lesson.liveUrl ? `<a class="btn btn--sm ${status === 'live' ? 'btn--accent' : 'btn--ghost'}" href="${esc(safeUrl(lesson.liveUrl))}" target="_blank" rel="noopener">${esc(t('course.live.join'))}</a>` : ''}
            </div>`;
          }).join('') : `<p class="muted">${esc(t('dash.noLive'))}</p>`}
        </section>

        <section class="card reveal" aria-labelledby="cert-title">
          <div class="card-head"><h2 id="cert-title">${esc(t('dash.certificates'))}</h2></div>
          <div class="stack" style="gap:10px">
            ${enrolled.length ? enrolled.map((c) => {
              const done = isComplete(c);
              return `<a class="cert-mini" href="certificate.html?course=${encodeURIComponent(c.id)}">
                <span class="cert-mini__icon">${icon(done ? 'award' : 'lock')}</span>
                <div><b>${esc(tx(c.title))}</b><span>${esc(done ? t('dash.certReady') : t('dash.certPending', { n: fmtNum(progress(c)) }))}</span></div>
                ${icon('chevronRight', 'flip-rtl')}
              </a>`;
            }).join('') : `<p class="muted">${esc(t('dash.noCertificates'))}</p>`}
          </div>
        </section>
      </div>
    </div>`;

  chart.bind();
  $('[data-edit]')?.addEventListener('click', editProfile);
  $('[data-reset]')?.addEventListener('click', async () => {
    if (await confirmDialog(t('dash.reset'), t('dash.resetConfirm'))) { await resetState(); toast(t('toast.reset')); render(); }
  });
  $('[data-read-all]')?.addEventListener('click', () => {
    update((s) => { s.read = [...new Set([...s.read, ...items.map((i) => i.id)])]; });
    render();
  });
  if (location.hash) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView({ block: 'start' }));
}

boot(render);
