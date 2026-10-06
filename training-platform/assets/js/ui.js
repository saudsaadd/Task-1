// Shared building blocks used by several pages: pricing plans, the certificate,
// reviews and the FAQ accordion.
import { app, t, tx, esc, icon, fmtPrice, fmtDate, fmtNum, stars, avatar, safeUrl } from './app.js';

/* ----------------------------------------------------------------- plans */
export function yearlySaving(plans) {
  return Math.max(0, ...plans.map((p) => (p.price.monthly ? Math.round((1 - p.price.yearly / (p.price.monthly * 12)) * 100) : 0)));
}

export function billingToggle(cycle, saving) {
  return `<div class="billing-toggle" role="group" aria-label="${esc(t('pricing.cycle'))}">
    <button type="button" data-cycle="monthly" aria-pressed="${cycle === 'monthly'}">${esc(t('pricing.monthly'))}</button>
    <button type="button" data-cycle="yearly" aria-pressed="${cycle === 'yearly'}">${esc(t('pricing.yearly'))}${saving ? `<span class="save">${esc(t('pricing.save', { n: fmtNum(saving) }))}</span>` : ''}</button>
  </div>`;
}

export function plansMarkup(plans, cycle) {
  return `<div class="plans">${plans.map((p) => {
    const price = p.price[cycle] || 0;
    const perMonth = cycle === 'yearly' ? price / 12 : price;
    return `<article class="plan${p.highlight ? ' plan--highlight' : ''} reveal">
      ${p.badge ? `<span class="plan__badge">${esc(tx(p.badge))}</span>` : ''}
      <div><h3 class="plan__name">${esc(tx(p.name))}</h3><p class="plan__desc">${esc(tx(p.description))}</p></div>
      <div class="plan__price"><b>${esc(price ? fmtPrice(Math.round(perMonth), { free: false }) : t('common.free'))}</b>${price ? `<span>${esc(t('pricing.perMonth'))}</span>` : ''}</div>
      <p class="plan__note">${cycle === 'yearly' && price ? esc(t('pricing.billedYearly', { total: fmtPrice(price) })) : price ? esc(t('pricing.billedMonthly')) : esc(t('pricing.noCard'))}</p>
      <ul>${p.features.map((f) => `<li>${icon('check')}<span>${esc(tx(f))}</span></li>`).join('')}</ul>
      <a class="btn ${p.highlight ? 'btn--primary' : 'btn--ghost'} btn--block" href="checkout.html?plan=${encodeURIComponent(p.id)}&cycle=${cycle}">${esc(tx(p.cta))}${icon('arrow', 'flip-rtl')}</a>
    </article>`;
  }).join('')}</div>`;
}

/** Wires a billing toggle inside `root`; calls onChange(cycle). */
export function bindBillingToggle(root, onChange) {
  root.querySelectorAll('[data-cycle]').forEach((b) => b.addEventListener('click', () => onChange(b.dataset.cycle)));
}

/* ----------------------------------------------------------- certificate */
function rosette(cx, cy, r, n, color) {
  let out = '';
  for (let i = 0; i < n; i++) {
    out += `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.38}" transform="rotate(${(180 / n) * i} ${cx} ${cy})" fill="none" stroke="${color}" stroke-width=".18"/>`;
  }
  return out;
}

export function certificateMarkup({ learner, course, date, id, preview = false }) {
  const site = app.site;
  const cert = site.certificate || {};
  const wordmark = site.brand.headerShowsName === false ? safeUrl(site.brand.logoBilingual || site.brand.logo) : '';
  const logo = safeUrl(site.brand.logoMark || site.brand.logo);
  const year = new Date(date).getFullYear();
  const courseTitle = `<b>${esc(tx(course.title))}</b>`;
  return `<div class="certificate" role="img" aria-label="${esc(t('cert.aria', { name: learner, course: tx(course.title) }))}">
    <svg class="certificate__pattern" viewBox="0 0 297 210" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      ${rosette(18, 192, 46, 18, 'rgba(183,145,75,.55)')}${rosette(279, 18, 46, 18, 'rgba(139,124,255,.45)')}
      ${rosette(148.5, 105, 92, 24, 'rgba(183,145,75,.12)')}
    </svg>
    <div class="certificate__frame"></div>
    <div class="certificate__inner">
      <div class="certificate__top">
        <div class="certificate__brand">${wordmark ? `<img class="certificate__wordmark" src="${esc(wordmark)}" alt="${esc(tx(site.brand.name))}">`
          : `${logo ? `<img src="${esc(logo)}" alt="">` : ''}<span>${esc(tx(site.brand.name))}</span>`}</div>
        <div class="certificate__id">${esc(t('cert.id'))}<br><b class="ltr">${esc(id)}</b></div>
      </div>
      <div class="certificate__body">
        <div class="certificate__kicker">${esc(t('cert.kicker'))}</div>
        <div class="certificate__title">${esc(t('cert.heading'))}</div>
        <div class="certificate__presented">${esc(t('cert.presented'))}</div>
        <div class="certificate__name">${esc(learner)}</div>
        <div class="certificate__rule"></div>
        <p class="certificate__course">${t('cert.forCompleting', { course: courseTitle, hours: esc(fmtNum(course.hours)) })}</p>
      </div>
      <div class="certificate__foot">
        <div class="certificate__sig">
          <span class="script">${esc(tx(cert.signatory?.name))}</span><span class="line"></span>
          <b>${esc(tx(cert.signatory?.name))}</b><span>${esc(tx(cert.signatory?.title))}</span>
        </div>
        <div class="certificate__seal">${esc(tx(site.brand.shortName) || tx(site.brand.name))}<br>${esc(String(year))}</div>
        <div class="certificate__sig">
          <span class="script">${esc(fmtDate(date, { day: 'numeric', month: 'short' }))}</span><span class="line"></span>
          <b>${esc(t('cert.issued'))}</b><span>${esc(fmtDate(date))}</span>
        </div>
      </div>
    </div>
    ${preview ? `<div class="certificate__watermark" aria-hidden="true">${esc(t('cert.watermark'))}</div>` : ''}
  </div>`;
}

/* --------------------------------------------------------------- reviews */
export function reviewCard(r, courses = []) {
  const course = courses.find((c) => c.id === r.course);
  return `<figure class="review">
    ${stars(r.rating, false)}
    <blockquote class="review__text" style="margin:0">“${esc(tx(r.text))}”</blockquote>
    <figcaption class="review__author">${avatar(tx(r.name), r.avatar)}
      <div><b>${esc(tx(r.name))}</b><span>${esc(tx(r.role))}</span>${course ? `<div class="review__course">${esc(tx(course.title))}</div>` : ''}</div>
    </figcaption>
  </figure>`;
}

export function reviewsMarquee(items, courses) {
  const cards = items.map((r) => reviewCard(r, courses)).join('');
  return `<div class="marquee" style="--marquee-duration:${Math.max(30, items.length * 9)}s">
    <div class="marquee__track">${cards}<div style="display:contents" aria-hidden="true">${cards}</div></div>
  </div>`;
}

/* ------------------------------------------------------------------- faq */
export function faqAccordion(items, open = 0) {
  return `<div class="accordion">${items.map((f, i) => `
    <details class="acc"${i < open ? ' open' : ''}>
      <summary>${esc(tx(f.q))}${icon('chevronDown')}</summary>
      <div class="acc__body">${esc(tx(f.a))}</div>
    </details>`).join('')}</div>`;
}
