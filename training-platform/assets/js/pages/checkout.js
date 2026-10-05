// Checkout for a subscription plan (?plan=pro&cycle=yearly) or a single course
// (?course=id). With a paymentLink in the JSON the buyer is sent to that hosted,
// secure payment page (Stripe Payment Links, Moyasar, Tap, PayPal…). Without one
// the page runs in demo mode: no card data is collected and nothing is charged.
import {
  app, boot, data, t, tx, esc, icon, fmtPrice, fmtNum, fmtDate, safeUrl, courseCover, getState, update, enroll,
  toast, setTitle, param, $, $$
} from '../app.js';

const METHOD_ICONS = { card: 'card', applepay: 'apple', stcpay: 'wallet', paypal: 'paypal' };
const COUNTRIES = ['SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'EG', 'JO', 'MA', 'US', 'GB'];
let coupon = null;
let method = 'card';

async function resolveItem() {
  const [plans, catalog] = await Promise.all([data.plans(), data.courses()]);
  const planId = param('plan');
  const cycle = param('cycle') === 'monthly' ? 'monthly' : 'yearly';
  if (planId) {
    const p = plans.plans.find((x) => x.id === planId);
    if (p) return { kind: 'plan', id: p.id, cycle, plan: p, name: p.name, price: p.price[cycle] || 0, link: p.paymentLinks?.[cycle] || '' };
  }
  const course = catalog.courses.find((c) => c.id === param('course'));
  if (course) return { kind: 'course', id: course.id, course, name: course.title, price: course.price || 0, link: course.paymentLink || '' };
  return null;
}

function totals(item) {
  const vatRate = Number(app.site.payments?.vatRate || 0);
  const subtotal = item.price;
  const discount = coupon ? Math.round(subtotal * coupon.percent) / 100 : 0;
  const taxable = subtotal - discount;
  const vat = Math.round(taxable * vatRate * 100) / 100;
  return { subtotal, discount, vat, vatRate, total: Math.round((taxable + vat) * 100) / 100 };
}

function summaryMarkup(item) {
  const s = totals(item);
  const cover = item.kind === 'course' ? courseCover(item.course) : `<div class="cover" style="--h:258"><span class="cover__grid"></span><span class="cover__icon">${icon('sparkles')}</span></div>`;
  return `<div class="card summary">
    <h2 class="step-title" style="margin-bottom:16px">${esc(t('checkout.summary'))}</h2>
    <div class="summary__item">${cover}
      <div class="stack" style="gap:4px"><b>${esc(tx(item.name))}</b>
        <span class="muted" style="font-size:13px">${esc(item.kind === 'plan' ? `${t('checkout.planLabel')} · ${t(`pricing.${item.cycle}`)}` : t('checkout.courseLabel'))}</span></div>
    </div>
    <div class="summary__lines">
      <div><span>${esc(t('checkout.subtotal'))}</span><span>${esc(fmtPrice(s.subtotal, { free: false }))}</span></div>
      ${s.discount ? `<div class="discount"><span>${esc(t('checkout.discount'))} (${esc(coupon.code)})</span><span>−${esc(fmtPrice(s.discount, { free: false }))}</span></div>` : ''}
      ${s.vatRate ? `<div><span>${esc(t('checkout.vat', { n: fmtNum(s.vatRate * 100) }))}</span><span>${esc(fmtPrice(s.vat, { free: false }))}</span></div>` : ''}
      <div class="total"><span>${esc(t('checkout.total'))}</span><span>${esc(fmtPrice(s.total, { free: false }))}</span></div>
      ${item.kind === 'plan' && item.price ? `<p class="muted" style="font-size:12.5px">${esc(t(item.cycle === 'yearly' ? 'checkout.renewYearly' : 'checkout.renewMonthly'))}</p>` : ''}
    </div>
    <form class="row" data-coupon style="gap:8px;flex-wrap:nowrap">
      <label class="sr-only" for="coupon">${esc(t('checkout.coupon'))}</label>
      <input class="input" id="coupon" placeholder="${esc(t('checkout.coupon'))}" value="${esc(coupon?.code || '')}" autocomplete="off" style="text-transform:uppercase">
      <button type="submit" class="btn btn--ghost">${esc(t('checkout.apply'))}</button>
    </form>
    <div class="divider" style="margin:18px 0"></div>
    <div class="stack" style="gap:10px">
      <p class="secure-note">${icon('shield')}<span>${esc(t('checkout.secureNote'))}</span></p>
      <p class="secure-note">${icon('refresh')}<span>${esc(t('checkout.guarantee'))}</span></p>
    </div>
  </div>`;
}

function successMarkup(item, order) {
  const next = item.kind === 'course'
    ? `<a class="btn btn--primary" href="course.html?id=${encodeURIComponent(item.id)}">${esc(t('checkout.startCourse'))}${icon('arrow', 'flip-rtl')}</a>`
    : `<a class="btn btn--primary" href="courses.html">${esc(t('checkout.explore'))}${icon('arrow', 'flip-rtl')}</a>`;
  return `<div class="card card--glow success-panel" style="max-width:720px;margin-inline:auto">
    <span class="success-panel__icon">${icon('check')}</span>
    <h1 class="h2">${esc(item.price ? t('checkout.success.title') : t('checkout.success.freeTitle'))}</h1>
    <p class="lead" style="text-align:center">${esc(t('checkout.success.text', { item: tx(item.name) }))}</p>
    <div class="row" style="justify-content:center;gap:8px">
      <span class="chip chip--outline ltr">${esc(t('checkout.success.order'))}: ${esc(order.id)}</span>
      <span class="chip chip--outline">${esc(fmtDate(order.date))}</span>
      <span class="chip chip--success">${esc(fmtPrice(order.total, { free: false }))}</span>
    </div>
    ${order.demo ? `<p class="muted" style="font-size:13px">${esc(t('checkout.success.demo'))}</p>` : ''}
    <div class="row" style="justify-content:center">${next}<a class="btn btn--ghost" href="dashboard.html">${esc(t('checkout.goDashboard'))}</a></div>
  </div>`;
}

function activate(item, total, { demo, buyer }) {
  const order = {
    id: `ORD-${Date.now().toString(36).toUpperCase()}`,
    kind: item.kind, itemId: item.id, cycle: item.cycle || null,
    total, currency: app.site.payments?.currency || 'SAR', method, demo, date: new Date().toISOString()
  };
  update((s) => {
    s.orders.push(order);
    if (item.kind === 'plan') s.plan = { id: item.id, cycle: item.cycle, since: order.date };
    if (buyer?.name && (s.demo || !tx(s.profile.name))) s.profile.name = buyer.name;
    if (buyer?.email) s.profile.email = buyer.email;
  });
  if (item.kind === 'course') enroll(item.id);
  return order;
}

function hostedUrl(link, email) {
  const u = new URL(link, location.href);
  if (email && /stripe\.com$/i.test(u.hostname)) u.searchParams.set('prefilled_email', email);
  return u.toString();
}

function validate(form) {
  let ok = true;
  $$('[data-required]', form).forEach((input) => {
    const field = input.closest('.field') || input.closest('.check');
    const value = input.type === 'checkbox' ? input.checked : input.value.trim();
    let error = '';
    if (!value) error = t('form.required');
    else if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim())) error = t('form.email');
    field?.classList.toggle('is-invalid', !!error);
    const msg = field?.querySelector('.field__error');
    if (msg) msg.textContent = error;
    if (error && ok) { input.focus(); ok = false; }
  });
  return ok;
}

async function render() {
  setTitle(t('checkout.title'));
  const root = $('#checkout-root');
  const item = await resolveItem();
  if (!item) {
    root.innerHTML = `<div class="empty-state">${icon('card')}<h1>${esc(t('checkout.empty'))}</h1><a class="btn btn--primary" href="pricing.html">${esc(t('nav.pricing'))}</a></div>`;
    return;
  }

  // Return from a hosted payment page: …/checkout.html?plan=pro&cycle=yearly&status=success
  if (param('status') === 'success') {
    const order = activate(item, totals(item).total, { demo: false });
    root.innerHTML = successMarkup(item, order);
    const url = new URL(location.href); url.searchParams.delete('status'); history.replaceState(null, '', url);
    return;
  }

  const state = getState();
  const demo = !safeUrl(item.link) && item.price > 0;
  const free = !item.price;
  const dn = (() => { try { return new Intl.DisplayNames([app.lang], { type: 'region' }); } catch { return null; } })();
  const methods = app.site.payments?.methods || [];

  root.innerHTML = `
    <nav class="breadcrumbs"><a href="pricing.html">${esc(t('nav.pricing'))}</a><span aria-hidden="true">/</span><span>${esc(t('checkout.title'))}</span></nav>
    <h1 class="h2" style="margin-bottom:28px">${esc(free ? t('checkout.freeTitle') : t('checkout.title'))}</h1>
    <div class="checkout">
      <form class="card form" id="pay-form" novalidate>
        ${demo ? `<div class="demo-banner">${icon('info')}<div><b>${esc(t('checkout.demoTitle'))}</b><br>${esc(t('checkout.demoText'))}</div></div>` : ''}
        <div>
          <h2 class="step-title"><span>1</span>${esc(t('checkout.account'))}</h2>
          <div class="form">
            <div class="form-row">
              <div class="field"><label for="co-name">${esc(t('checkout.name'))}</label><input class="input" id="co-name" autocomplete="name" data-required value="${esc(state.demo ? '' : tx(state.profile.name))}"><span class="field__error"></span></div>
              <div class="field"><label for="co-email">${esc(t('checkout.email'))}</label><input class="input ltr" id="co-email" type="email" autocomplete="email" data-required value="${esc(state.demo ? '' : state.profile.email)}"><span class="field__error"></span></div>
            </div>
            <div class="form-row">
              <div class="field"><label for="co-phone">${esc(t('checkout.phone'))} <span class="muted">(${esc(t('common.optional'))})</span></label><input class="input ltr" id="co-phone" type="tel" autocomplete="tel" placeholder="+966 5x xxx xxxx"></div>
              <div class="field"><label for="co-country">${esc(t('checkout.country'))}</label>
                <select class="select" id="co-country" autocomplete="country">${COUNTRIES.map((c) => `<option value="${c}">${esc(dn?.of(c) || c)}</option>`).join('')}<option value="other">${esc(t('checkout.otherCountry'))}</option></select></div>
            </div>
          </div>
        </div>
        ${free ? '' : `<div>
          <h2 class="step-title"><span>2</span>${esc(t('checkout.method'))}</h2>
          <div class="methods" role="radiogroup" aria-label="${esc(t('checkout.method'))}">
            ${methods.map((m, i) => `<label class="method"><input type="radio" name="method" value="${esc(m.id)}"${i === 0 ? ' checked' : ''}>
              <span class="method__icon">${icon(METHOD_ICONS[m.id] || 'card')}</span><span><b>${esc(tx(m.label))}</b><small>${esc(m.hint || '')}</small></span></label>`).join('')}
          </div>
          <p class="secure-note" style="margin-top:14px">${icon('shield')}<span>${esc(demo ? t('checkout.methodDemo') : t('checkout.methodHosted'))}</span></p>
        </div>`}
        <div class="field"><label class="check"><input type="checkbox" id="co-terms" data-required><span>${esc(t('checkout.terms'))}</span></label><span class="field__error"></span></div>
        <button type="submit" class="btn btn--primary btn--lg btn--block" data-pay>${esc(free ? t('checkout.freeCta') : t('checkout.pay', { total: fmtPrice(totals(item).total, { free: false }) }))}</button>
      </form>
      <div id="summary"></div>
    </div>`;

  const drawSummary = () => {
    $('#summary').innerHTML = summaryMarkup(item);
    $('[data-pay]').textContent = free ? t('checkout.freeCta') : t('checkout.pay', { total: fmtPrice(totals(item).total, { free: false }) });
    $('[data-coupon]').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = $('#coupon').value.trim().toUpperCase();
      const found = (app.site.payments?.coupons || []).find((c) => c.code.toUpperCase() === code);
      if (!code) { coupon = null; drawSummary(); return; }
      if (found) { coupon = found; toast(t('checkout.couponApplied', { n: fmtNum(found.percent) })); }
      else { coupon = null; toast(t('checkout.couponInvalid'), 'error'); }
      drawSummary();
    });
  };
  drawSummary();

  $$('input[name="method"]').forEach((r) => r.addEventListener('change', () => { method = r.value; }));

  $('#pay-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!validate(form)) return;
    const buyer = { name: $('#co-name').value.trim(), email: $('#co-email').value.trim() };
    const btn = $('[data-pay]');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span>${esc(item.link && !free ? t('checkout.redirecting') : t('checkout.processing'))}`;
    const { total } = totals(item);

    if (!free && safeUrl(item.link)) {
      update((s) => { s.profile.email = buyer.email || s.profile.email; });
      location.href = hostedUrl(item.link, buyer.email);
      return;
    }
    await new Promise((r) => setTimeout(r, free ? 500 : 1400));
    const order = activate(item, total, { demo: !free, buyer });
    root.innerHTML = successMarkup(item, order);
    scrollTo({ top: 0, behavior: 'smooth' });
  });
}

boot(render);
