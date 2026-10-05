// Agilix brand guidelines: logo set, concept, palette, typography, UI and usage.
import { app, boot, t, tx, esc, icon, toast, setTitle, $, $$ } from '../app.js';

const COLORS = [
  { key: 'blue', hex: '#2E5BFF', text: '#fff' },
  { key: 'teal', hex: '#14B8C4', text: '#0E1630' },
  { key: 'coral', hex: '#FF6B3D', text: '#0E1630' },
  { key: 'ink', hex: '#0E1630', text: '#fff' },
  { key: 'cloud', hex: '#F6F7FB', text: '#0E1630' },
  { key: 'white', hex: '#FFFFFF', text: '#0E1630' }
];

function section(eyebrow, title, body, extra = '') {
  return `<section class="stack reveal" style="gap:24px">
    <div class="section-head" style="margin-bottom:0"><div class="stack" style="gap:12px">
      <span class="eyebrow">${esc(eyebrow)}</span><h2 class="h2">${esc(title)}</h2>${extra ? `<p class="lead">${esc(extra)}</p>` : ''}
    </div></div>
    ${body}
  </section>`;
}

function render() {
  setTitle(t('brand.title'));
  const b = app.site.brand;
  const logo = b.logo, logoDark = b.logoOnDark || b.logo, mark = b.logoMark;

  $('#brand-head').innerHTML = `<div class="section-head" style="margin-bottom:0;max-width:820px">
    <div class="stack" style="gap:14px">
      <span class="eyebrow">${esc(t('brand.eyebrow'))}</span>
      <h1 class="display">${esc(t('brand.title'))}</h1>
      <p class="lead">${esc(t('brand.intro'))}</p>
    </div>
    <div class="row">
      <a class="btn btn--primary" href="${esc(logo)}" download>${icon('download')}${esc(t('brand.download.logo'))}</a>
      <a class="btn btn--ghost" href="${esc(mark)}" download>${icon('download')}${esc(t('brand.download.mark'))}</a>
      <a class="btn btn--ghost" href="${esc(logoDark)}" download>${icon('download')}${esc(t('brand.download.dark'))}</a>
    </div>
  </div>`;

  const logos = `<div class="grid grid--3">
    <figure class="card" style="margin:0;display:grid;place-items:center;min-height:240px;gap:16px">
      <img src="${esc(logo)}" alt="${esc(tx(b.name))}" style="height:72px;width:auto">
      <figcaption class="muted" style="font-size:13px">${esc(t('brand.logo.primary'))}</figcaption>
    </figure>
    <figure class="card on-dark" style="margin:0;display:grid;place-items:center;min-height:240px;gap:16px;background:var(--ink);border-color:var(--ink)">
      <img src="${esc(logoDark)}" alt="${esc(tx(b.name))}" style="height:72px;width:auto">
      <figcaption class="muted" style="font-size:13px">${esc(t('brand.logo.dark'))}</figcaption>
    </figure>
    <figure class="card" style="margin:0;display:grid;place-items:center;min-height:240px;gap:16px;background:linear-gradient(140deg,#fff,var(--primary-soft))">
      <div class="row" style="align-items:flex-end;gap:18px">
        <img src="${esc(mark)}" alt="" style="width:96px;height:96px">
        <img src="${esc(mark)}" alt="" style="width:48px;height:48px">
        <img src="${esc(mark)}" alt="" style="width:24px;height:24px">
        <img src="${esc(mark)}" alt="" style="width:16px;height:16px">
      </div>
      <figcaption class="muted" style="font-size:13px">${esc(t('brand.logo.mark'))}</figcaption>
    </figure>
  </div>`;

  const concept = `<div class="grid grid--3">
    ${[['chart', 'brand.concept.1'], ['target', 'brand.concept.2'], ['grid', 'brand.concept.3']].map(([ic, k], i) => `
      <div class="card stack" style="gap:12px">
        <span class="feature__icon" style="display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:${['var(--primary-soft)', 'color-mix(in srgb,var(--highlight) 14%,#fff)', 'color-mix(in srgb,var(--secondary) 14%,#fff)'][i]};color:${['var(--primary-ink)', '#b0401a', '#0b7d86'][i]}">${icon(ic)}</span>
        <h3 class="card__title" style="margin:0">${esc(t(`${k}.title`))}</h3>
        <p class="muted">${esc(t(`${k}.text`))}</p>
      </div>`).join('')}
  </div>`;

  const palette = `<div class="grid grid--3">
    ${COLORS.map((c) => `<button type="button" class="card" data-copy="${c.hex}" style="padding:0;overflow:hidden;text-align:start;cursor:pointer" aria-label="${esc(t('brand.copy', { hex: c.hex }))}">
      <span style="display:flex;align-items:flex-end;justify-content:space-between;height:120px;padding:18px;background:${c.hex};color:${c.text};${c.key === 'white' || c.key === 'cloud' ? 'border-bottom:1px solid var(--border);' : ''}">
        <b style="font-size:18px">${esc(t(`brand.color.${c.key}`))}</b><span class="ltr" style="font-size:13px;font-weight:600">${c.hex}</span>
      </span>
      <span style="display:block;padding:14px 18px;font-size:14px" class="muted">${esc(t(`brand.color.${c.key}.role`))}</span>
    </button>`).join('')}
  </div>
  <div class="card" style="padding:0;overflow:hidden">
    <div style="height:72px;background:linear-gradient(90deg,#2E5BFF,#14B8C4)"></div>
    <div class="row" style="justify-content:space-between;padding:14px 18px"><b>${esc(t('brand.gradient'))}</b><span class="muted ltr" style="font-size:13px">#2E5BFF → #14B8C4</span></div>
  </div>`;

  const type = `<div class="grid grid--2">
    <div class="card stack" style="gap:10px;font-family:'Poppins',sans-serif">
      <span class="muted" style="font-size:13px">${esc(t('brand.type.latin'))}</span>
      <span style="font-size:88px;font-weight:700;line-height:1;letter-spacing:-.04em">Aa</span>
      <b style="font-size:28px;letter-spacing:-.02em">Learn agile. Grow faster.</b>
      <p class="muted">Poppins · 400 · 500 · 600 · 700 · 800</p>
    </div>
    <div class="card stack" style="gap:10px;font-family:'Tajawal',sans-serif" dir="rtl">
      <span class="muted" style="font-size:13px">${esc(t('brand.type.arabic'))}</span>
      <span style="font-size:88px;font-weight:800;line-height:1.1">أب</span>
      <b style="font-size:30px">تعلّم بمرونة، وتقدّم أسرع</b>
      <p class="muted">Tajawal · 400 · 500 · 700 · 800</p>
    </div>
  </div>`;

  const ui = `<div class="card stack" style="gap:20px">
    <div class="row">
      <button type="button" class="btn btn--primary">${esc(t('brand.ui.primary'))}<span class="btn__arrow">${icon('arrow', 'flip-rtl')}</span></button>
      <button type="button" class="btn btn--ink">${esc(t('brand.ui.ink'))}</button>
      <button type="button" class="btn btn--accent">${icon('check')}${esc(t('brand.ui.accent'))}</button>
      <button type="button" class="btn btn--ghost">${esc(t('brand.ui.ghost'))}</button>
    </div>
    <div class="row">
      <span class="chip chip--soft">${esc(t('level.beginner'))}</span>
      <span class="chip chip--success">${icon('check')}${esc(t('dash.passed'))}</span>
      <span class="chip chip--live">${esc(t('course.live.now'))}</span>
      <span class="chip chip--outline">${esc(t('lesson.video'))}</span>
      <span class="eyebrow">${esc(t('brand.ui.eyebrow'))}</span>
    </div>
    <div class="meter meter--lg" style="max-width:420px"><span style="width:64%"></span></div>
  </div>`;

  const rules = `<div class="grid grid--2">
    <div class="card stack" style="gap:14px"><h3 class="card__title row" style="margin:0;gap:8px;color:var(--success)">${icon('success')}${esc(t('brand.do'))}</h3>
      <ul class="rules" style="--rule-c:var(--success)">${[1, 2, 3].map((n) => `<li>${icon('check')}<span>${esc(t(`brand.do.${n}`))}</span></li>`).join('')}</ul></div>
    <div class="card stack" style="gap:14px"><h3 class="card__title row" style="margin:0;gap:8px;color:var(--danger)">${icon('warning')}${esc(t('brand.dont'))}</h3>
      <ul class="rules" style="--rule-c:var(--danger)">${[1, 2, 3].map((n) => `<li>${icon('x')}<span>${esc(t(`brand.dont.${n}`))}</span></li>`).join('')}</ul></div>
  </div>`;

  $('#brand-root').innerHTML = [
    section(t('brand.s.logo'), t('brand.s.logoTitle'), logos),
    section(t('brand.s.concept'), t('brand.s.conceptTitle'), concept),
    section(t('brand.s.color'), t('brand.s.colorTitle'), palette, t('brand.s.colorText')),
    section(t('brand.s.type'), t('brand.s.typeTitle'), type),
    section(t('brand.s.ui'), t('brand.s.uiTitle'), ui),
    section(t('brand.s.usage'), t('brand.s.usageTitle'), rules)
  ].join('');

  $$('[data-copy]').forEach((el) => el.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(el.dataset.copy); toast(t('brand.copied', { hex: el.dataset.copy })); } catch { toast(el.dataset.copy, 'info'); }
  }));
}

boot(render);
