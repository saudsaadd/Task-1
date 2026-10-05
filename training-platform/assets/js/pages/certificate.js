// Certificate of completion: preview for everyone, the real certificate once
// the course is complete (all lessons + passed final quiz). Print / save as PDF,
// add to LinkedIn, copy the verification link.
import {
  app, boot, data, t, tx, esc, icon, fmtNum, enrollment, progress, bestAttempt, isComplete, completionDate,
  certificateId, learnerName, toast, setTitle, param, $
} from '../app.js';
import { certificateMarkup } from '../ui.js';

function linkedInUrl(course, id, date) {
  const q = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: tx(course.title),
    organizationName: tx(app.site.certificate?.issuer) || tx(app.site.brand.name),
    issueYear: String(date.getFullYear()),
    issueMonth: String(date.getMonth() + 1),
    certId: id,
    certUrl: location.href
  });
  return `https://www.linkedin.com/profile/add?${q}`;
}

function picker(root, courses) {
  setTitle(t('cert.pickTitle'));
  root.innerHTML = `<div class="stack" style="gap:28px">
    <div class="stack" style="gap:12px"><span class="eyebrow">${esc(t('cert.kicker'))}</span><h1 class="display" style="font-size:clamp(30px,4.2vw,52px)">${esc(t('cert.pickTitle'))}</h1><p class="lead">${esc(t('cert.pickText'))}</p></div>
    <div class="grid grid--2">${courses.map((c) => {
      const done = isComplete(c);
      const e = enrollment(c.id);
      return `<a class="cert-mini" href="certificate.html?course=${encodeURIComponent(c.id)}" style="padding:18px">
        <span class="cert-mini__icon">${icon(done ? 'award' : 'lock')}</span>
        <div><b>${esc(tx(c.title))}</b><span>${esc(done ? t('dash.certReady') : e ? t('dash.certPending', { n: fmtNum(progress(c)) }) : t('cert.notEnrolled'))}</span></div>
        ${icon('chevronRight', 'flip-rtl')}
      </a>`;
    }).join('')}</div>
  </div>`;
}

async function render() {
  const catalog = await data.courses();
  const root = $('#cert-root');
  const course = catalog.courses.find((c) => c.id === param('course'));
  if (!course) { picker(root, catalog.courses); return; }

  const done = isComplete(course);
  const date = done ? completionDate(course) : new Date();
  const id = done ? certificateId(course) : `${app.site.certificate?.idPrefix || 'CRT'}-PREVIEW`;
  const p = progress(course);
  const best = course.quizId ? bestAttempt(course.quizId) : null;
  setTitle(`${t('cert.heading')} · ${tx(course.title)}`);

  const missing = [];
  if (p < 100) missing.push(t('cert.missingLessons', { n: fmtNum(p) }));
  if (course.quizId && !best?.passed) missing.push(best ? t('cert.missingQuizScore', { n: fmtNum(best.percent) }) : t('cert.missingQuiz'));

  root.innerHTML = `
    <nav class="breadcrumbs no-print"><a href="dashboard.html">${esc(t('nav.dashboard'))}</a><span aria-hidden="true">/</span><a href="course.html?id=${encodeURIComponent(course.id)}">${esc(tx(course.title))}</a><span aria-hidden="true">/</span><span>${esc(t('cert.heading'))}</span></nav>
    <div class="cert-toolbar no-print">
      <div class="stack" style="gap:6px"><h1 class="h2">${esc(done ? t('cert.readyTitle') : t('cert.previewTitle'))}</h1>
        <p class="muted">${esc(done ? t('cert.readyText') : t('cert.previewText'))}</p></div>
      <div class="row">
        <button type="button" class="btn btn--primary" data-print>${icon('printer')}${esc(t('cert.print'))}</button>
        ${done ? `<a class="btn btn--ghost" href="${esc(linkedInUrl(course, id, date))}" target="_blank" rel="noopener">${icon('linkedin')}${esc(t('cert.linkedin'))}</a>
        <button type="button" class="btn btn--ghost" data-copy>${icon('external')}${esc(t('cert.copy'))}</button>` : ''}
      </div>
    </div>
    ${done ? '' : `<div class="cert-locked no-print">${icon('lock')}<div style="flex:1"><b>${esc(t('cert.locked'))}</b>
      <ul class="rules" style="margin-top:8px;font-size:14px">${missing.map((m) => `<li>${icon('chevronRight', 'flip-rtl')}<span>${esc(m)}</span></li>`).join('')}</ul>
      <div class="row" style="margin-top:12px"><a class="btn btn--light btn--sm" href="course.html?id=${encodeURIComponent(course.id)}">${esc(t('cert.goCourse'))}</a>
      ${course.quizId ? `<a class="btn btn--ghost btn--sm" href="quiz.html?id=${encodeURIComponent(course.quizId)}">${esc(t('course.takeQuiz'))}</a>` : ''}</div></div></div>`}
    <div class="cert-stage">${certificateMarkup({ learner: learnerName(), course, date, id, preview: !done })}</div>
    <p class="muted no-print" style="margin-top:18px;font-size:13px">${esc(t('cert.printHint'))}</p>`;

  $('[data-print]', root).addEventListener('click', () => window.print());
  $('[data-copy]', root)?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); toast(t('toast.copied')); } catch { toast(location.href, 'info'); }
  });
}

boot(render);
