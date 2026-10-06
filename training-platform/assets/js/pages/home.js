// Landing page sections below the 3D hero.
import {
  app, boot, data, t, tx, esc, icon, fmtNum, fmtDate, fmtPrice, courseCard,
  upcomingLive, learnerName, $, stars, setTitle
} from '../app.js';
import { plansMarkup, billingToggle, bindBillingToggle, yearlySaving, certificateMarkup, reviewsMarquee, faqAccordion } from '../ui.js';

const PILLAR_ICONS = ['live', 'video', 'target', 'award', 'sparkles', 'chart'];
const FEATURE_COLORS = ['var(--primary)', 'var(--secondary)', 'var(--highlight)'];
let cycle = 'yearly';

function sectionHead(eyebrow, title, text, extra = '', cls = '') {
  return `<div class="section-head ${cls} reveal">
    <div class="stack" style="gap:14px;justify-items:inherit">
      <span class="eyebrow">${esc(eyebrow)}</span>
      <h2 class="h2">${title}</h2>
      ${text ? `<p class="lead">${esc(text)}</p>` : ''}
    </div>
    ${extra}
  </div>`;
}

async function render() {
  const site = app.site;
  setTitle(tx(site.hero.headline) === tx(site.brand.name) ? tx(site.brand.tagline) : tx(site.hero.headline));
  const [catalog, reviews, plans, faq] = await Promise.all([data.courses(), data.testimonials(), data.plans(), data.faq()]);
  const courses = catalog.courses;

  /* stats */
  $('#stats .stats-band__grid').innerHTML = (site.stats || []).map((s) => `
    <div class="stat reveal"><b>${esc(s.value)}</b><span>${esc(tx(s.label))}</span></div>`).join('');
  $('#stats').setAttribute('aria-label', t('home.stats'));

  /* features (same six pillars as the cube faces) */
  $('#features').innerHTML = `<div class="container">
    ${sectionHead(t('home.features.eyebrow'), esc(t('home.features.title')), t('home.features.text'))}
    <div class="grid grid--3">
      ${site.hero.pillars.map((p, i) => `
        <a class="feature reveal" href="${esc(p.href)}" style="transition-delay:${i * 60}ms;--c:${FEATURE_COLORS[i % FEATURE_COLORS.length]}">
          <span class="feature__num">${String(i + 1).padStart(2, '0')}</span>
          <span class="feature__icon">${icon(PILLAR_ICONS[i] || 'spark')}</span>
          <h3>${esc(tx(p.title))}</h3>
          <p>${esc(t(`home.features.item${i + 1}`))}</p>
        </a>`).join('')}
    </div>
  </div>`;

  /* featured courses */
  const featured = courses.filter((c) => c.featured).slice(0, 4);
  $('#courses').innerHTML = `<div class="container">
    ${sectionHead(t('home.courses.eyebrow'), esc(t('home.courses.title')), t('home.courses.text'),
      `<a class="text-link" href="courses.html">${esc(t('common.viewAll'))}${icon('arrow', 'flip-rtl')}</a>`, 'section-head--row')}
    <div class="grid grid--4">${featured.map((c) => courseCard(c, catalog.categories)).join('')}</div>
  </div>`;

  /* live sessions + certificate preview */
  const live = upcomingLive(courses).slice(0, 3);
  const sample = courses.find((c) => c.quizId) || courses[0];
  $('#experience').innerHTML = `<div class="container">
    ${sectionHead(t('home.exp.eyebrow'), esc(t('home.exp.title')), t('home.exp.text'))}
    <div class="experience">
      <div class="card reveal">
        <div class="card-head"><h3>${esc(t('home.exp.live'))}</h3><span class="chip chip--live">${esc(t('course.live.badge'))}</span></div>
        ${live.length ? live.map(({ course, lesson, status }) => {
          const d = new Date(lesson.startsAt);
          return `<a class="live-item" href="course.html?id=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lesson.id)}">
            <span class="date-badge"><b>${esc(fmtDate(d, { day: 'numeric' }))}</b><span>${esc(fmtDate(d, { month: 'short' }))}</span></span>
            <span class="live-item__text"><b>${esc(tx(lesson.title))}</b><span>${esc(tx(course.title))} · ${esc(fmtDate(d, { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}</span></span>
            ${status === 'live' ? `<span class="chip chip--live">${esc(t('course.live.now'))}</span>` : `<span class="chip chip--outline">${esc(lesson.platform || '')}</span>`}
          </a>`;
        }).join('') : `<p class="muted">${esc(t('home.exp.noLive'))}</p>`}
        <div class="divider"></div>
        <div class="row">
          <span class="muted" style="flex:1">${esc(t('home.exp.liveNote'))}</span>
          <a class="text-link" href="dashboard.html#live">${esc(t('home.exp.schedule'))}${icon('arrow', 'flip-rtl')}</a>
        </div>
      </div>
      <a class="card reveal stack" href="certificate.html?course=${encodeURIComponent(sample.id)}" aria-label="${esc(t('home.exp.certificate'))}">
        <div class="card-head" style="margin:0"><h3>${esc(t('home.exp.certificate'))}</h3><span class="text-link">${esc(t('common.preview'))}${icon('arrow', 'flip-rtl')}</span></div>
        <div class="cert-stage">${certificateMarkup({ learner: learnerName(), course: sample, date: new Date(), id: 'XXX-0000-PREVIEW', preview: true })}</div>
      </a>
    </div>
  </div>`;

  /* testimonials */
  $('#reviews').innerHTML = `<div class="container">
    ${sectionHead(t('home.reviews.eyebrow'), esc(t('home.reviews.title')), '',
      `<div class="rating-summary"><span class="rating-summary__value">${fmtNum(reviews.summary.rating, { minimumFractionDigits: 1 })}</span>
        <div>${stars(reviews.summary.rating, false)}<div class="muted">${esc(t('home.reviews.count', { n: fmtNum(reviews.summary.count) }))}</div></div></div>`,
      'section-head--row')}
  </div>
  <div class="reveal">${reviewsMarquee(reviews.items, courses)}</div>`;

  /* pricing */
  const drawPlans = () => {
    $('#pricing').innerHTML = `<div class="container">
      ${sectionHead(t('home.pricing.eyebrow'), esc(t('home.pricing.title')), t('home.pricing.text'), billingToggle(cycle, yearlySaving(plans.plans)), 'section-head--center')}
      ${plansMarkup(plans.plans, cycle)}
      <p class="muted row" style="justify-content:center;gap:8px;margin-top:28px">${icon('shield')}<span>${esc(tx(plans.guarantee))}</span><a class="text-link" href="pricing.html">${esc(t('home.pricing.compare'))}${icon('arrow', 'flip-rtl')}</a></p>
    </div>`;
    bindBillingToggle($('#pricing'), (c) => { cycle = c; drawPlans(); $('#pricing').querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible')); });
  };
  drawPlans();

  /* faq */
  $('#faq').innerHTML = `<div class="container" style="max-width:880px">
    ${sectionHead(t('home.faq.eyebrow'), esc(t('home.faq.title')), '', '', 'section-head--center')}
    <div class="reveal">${faqAccordion(faq.items.slice(0, 5), 1)}</div>
    <p style="text-align:center;margin-top:28px"><a class="btn btn--ghost" href="contact.html#faq">${esc(t('home.faq.more'))}${icon('arrow', 'flip-rtl')}</a></p>
  </div>`;

  /* call to action */
  const cheapest = Math.min(...courses.filter((c) => c.price).map((c) => c.price));
  $('#cta').innerHTML = `<div class="container"><div class="cta-band reveal">
    <span class="glow-orb" aria-hidden="true"></span>
    <span class="eyebrow">${esc(t('home.cta.eyebrow'))}</span>
    <h2 class="display" style="max-width:16ch">${esc(t('home.cta.title'))}</h2>
    <p class="lead" style="text-align:center">${esc(t('home.cta.text', { price: fmtPrice(cheapest) }))}</p>
    <div class="row" style="justify-content:center">
      <a class="btn btn--primary btn--lg" href="courses.html">${esc(t('home.cta.primary'))}<span class="btn__arrow">${icon('arrow', 'flip-rtl')}</span></a>
      <a class="btn btn--glass btn--lg" href="#chat">${icon('sparkles')}${esc(t('home.cta.secondary'))}</a>
    </div>
  </div></div>`;
}

boot(render);
