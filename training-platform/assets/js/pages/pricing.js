// Pricing: subscription plans (monthly / yearly), single-course purchase,
// feature comparison, guarantee and billing FAQ.
import { boot, data, t, tx, esc, icon, fmtPrice, fmtNum, courseCover, app, setTitle, $, observeReveals } from '../app.js';
import { plansMarkup, billingToggle, bindBillingToggle, yearlySaving, faqAccordion } from '../ui.js';

let cycle = new URLSearchParams(location.search).get('cycle') === 'monthly' ? 'monthly' : 'yearly';

const METHOD_ICONS = { card: 'card', applepay: 'apple', stcpay: 'wallet', paypal: 'paypal' };

async function render() {
  setTitle(t('pricing.title'));
  const [plans, catalog, faq] = await Promise.all([data.plans(), data.courses(), data.faq()]);
  const saving = yearlySaving(plans.plans);

  const drawHead = () => {
    $('#pricing-head').innerHTML = `<div class="section-head section-head--center" style="margin-bottom:0">
      <span class="eyebrow">${esc(t('pricing.eyebrow'))}</span>
      <h1 class="display">${esc(t('pricing.title'))}</h1>
      <p class="lead">${esc(t('pricing.text'))}</p>
      ${billingToggle(cycle, saving)}
    </div>`;
    bindBillingToggle($('#pricing-head'), (c) => { cycle = c; drawHead(); drawPlans(); });
  };
  const drawPlans = () => {
    $('#pricing-plans').innerHTML = `${plansMarkup(plans.plans, cycle)}
      <div class="row" style="justify-content:center;gap:12px;margin-top:32px">
        <span class="muted row" style="gap:8px">${icon('shield')}${esc(tx(plans.guarantee))}</span>
      </div>
      <div class="pay-methods" style="margin-top:18px" aria-label="${esc(t('pricing.methods'))}">
        ${(app.site.payments?.methods || []).map((m) => `<span>${icon(METHOD_ICONS[m.id] || 'card')}${esc(tx(m.label))}</span>`).join('')}
      </div>`;
    observeReveals($('#pricing-plans'));
  };
  drawHead();
  drawPlans();

  const paid = catalog.courses.filter((c) => c.price > 0);
  $('#pricing-courses').innerHTML = `<div class="section-head section-head--row reveal">
      <div class="stack" style="gap:10px"><span class="eyebrow">${esc(t('pricing.single.eyebrow'))}</span><h2 class="h2">${esc(t('pricing.single.title'))}</h2><p class="lead">${esc(t('pricing.single.text'))}</p></div>
    </div>
    <div class="grid grid--3">${paid.map((c) => `
      <article class="card reveal stack" style="padding:0;overflow:hidden;gap:0">
        ${courseCover(c)}
        <div class="stack" style="padding:20px 22px 22px;gap:12px">
          <h3 class="card__title" style="margin:0">${esc(tx(c.title))}</h3>
          <p class="muted" style="font-size:14px">${esc(t('common.hours', { n: fmtNum(c.hours) }))} · ${esc(t('common.lessons', { n: fmtNum(c.lessons.length) }))} · ${esc(t(`level.${c.level}`))}</p>
          <div class="row" style="justify-content:space-between;margin-top:auto">
            <span class="price" style="font-size:22px">${esc(fmtPrice(c.price))}</span>
            <a class="btn btn--ink btn--sm" href="checkout.html?course=${encodeURIComponent(c.id)}">${esc(t('pricing.buy'))}${icon('arrow', 'flip-rtl')}</a>
          </div>
        </div>
      </article>`).join('')}</div>`;

  const cell = (v) => (v === true ? `<span class="yes">${icon('check')}<span class="sr-only">${esc(t('common.yes'))}</span></span>`
    : v === false ? `<span class="no">${icon('x')}<span class="sr-only">${esc(t('common.no'))}</span></span>` : esc(v));
  $('#pricing-compare').innerHTML = `<div class="section-head section-head--center reveal"><span class="eyebrow">${esc(t('pricing.compare.eyebrow'))}</span><h2 class="h2">${esc(t('pricing.compare.title'))}</h2></div>
    <div class="table-wrap reveal"><table class="table compare">
      <caption class="sr-only">${esc(t('pricing.compare.title'))}</caption>
      <thead><tr><th scope="col">${esc(t('pricing.feature'))}</th>${plans.plans.map((p) => `<th scope="col">${esc(tx(p.name))}</th>`).join('')}</tr></thead>
      <tbody>${plans.comparison.map((row) => `<tr><th scope="row" style="font-weight:500">${esc(tx(row.label))}</th>${row.values.map((v) => `<td>${cell(v)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;

  const billing = faq.items.filter((f) => f.category === 'payments' || f.category === 'certificates');
  $('#pricing-faq').innerHTML = `<div class="section-head section-head--center reveal"><span class="eyebrow">${esc(t('home.faq.eyebrow'))}</span><h2 class="h2">${esc(t('pricing.faq'))}</h2></div>
    <div class="reveal">${faqAccordion(billing, 1)}</div>
    <p style="text-align:center;margin-top:24px" class="muted">${esc(t('pricing.questions'))} <a class="text-link" href="contact.html">${esc(t('nav.contact'))}${icon('arrow', 'flip-rtl')}</a></p>`;
}

boot(render);
