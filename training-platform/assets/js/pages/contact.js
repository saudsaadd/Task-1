// Contact & support: contact form (Formspree-style endpoint or mailto fallback),
// support channels, free-trial request and a searchable FAQ.
import { app, boot, data, t, tx, esc, icon, toast, getState, setTitle, $, $$ } from '../app.js';
import { faqAccordion } from '../ui.js';

let faqCat = 'all';
let faqQuery = '';

const normalize = (s) => String(s).toLowerCase().replace(/[ً-ْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

function validate(form) {
  let ok = true;
  $$('[data-required]', form).forEach((input) => {
    const field = input.closest('.field');
    const v = input.type === 'checkbox' ? input.checked : input.value.trim();
    let error = '';
    if (!v) error = t('form.required');
    else if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim())) error = t('form.email');
    else if (input.tagName === 'TEXTAREA' && input.value.trim().length < 10) error = t('form.minLength', { n: 10 });
    field.classList.toggle('is-invalid', !!error);
    field.querySelector('.field__error').textContent = error;
    if (error && ok) { input.focus(); ok = false; }
  });
  return ok;
}

async function send(form) {
  const payload = {
    name: $('#ct-name', form).value.trim(),
    email: $('#ct-email', form).value.trim(),
    phone: $('#ct-phone', form).value.trim(),
    topic: $('#ct-topic', form).selectedOptions[0].textContent,
    message: $('#ct-message', form).value.trim(),
    language: app.lang,
    page: location.href
  };
  const endpoint = app.site.contactForm?.endpoint;
  if (endpoint) {
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return 'sent';
  }
  const subject = `[${payload.topic}] ${payload.name}`;
  const body = `${payload.message}\n\n— ${payload.name}\n${payload.email}${payload.phone ? `\n${payload.phone}` : ''}`;
  location.href = `mailto:${app.site.contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return 'mailto';
}

function drawFaq(faq) {
  const q = normalize(faqQuery.trim());
  const items = faq.items.filter((f) => (faqCat === 'all' || f.category === faqCat) && (!q || normalize(`${f.q.ar} ${f.q.en} ${f.a.ar} ${f.a.en}`).includes(q)));
  $('#faq-list').innerHTML = items.length ? faqAccordion(items, q ? items.length : 0)
    : `<div class="empty-state">${icon('search')}<h3>${esc(t('contact.faq.empty'))}</h3><a class="btn btn--ghost" href="#chat">${icon('sparkles')}${esc(t('contact.askAssistant'))}</a></div>`;
}

async function render() {
  setTitle(t('nav.contact'));
  const faq = await data.faq();
  const c = app.site.contact;
  const state = getState();
  const topic = new URLSearchParams(location.search).get('topic') || 'general';

  $('#contact-head').innerHTML = `<div class="section-head" style="margin-bottom:0">
    <span class="eyebrow">${esc(t('contact.eyebrow'))}</span>
    <h1 class="display">${esc(t('contact.title'))}</h1>
    <p class="lead">${esc(t('contact.text'))}</p>
  </div>`;

  const topics = ['general', 'trial', 'technical', 'billing', 'business'];
  $('#contact-main').innerHTML = `<div class="contact-grid">
    <form class="card form" id="contact-form" novalidate>
      <div class="stack" style="gap:6px"><h2 class="h3">${esc(t('contact.form.title'))}</h2><p class="muted">${esc(tx(c.responseTime))}</p></div>
      <div class="form-row">
        <div class="field"><label for="ct-name">${esc(t('contact.name'))}</label><input class="input" id="ct-name" autocomplete="name" data-required value="${esc(state.demo ? '' : tx(state.profile.name))}"><span class="field__error"></span></div>
        <div class="field"><label for="ct-email">${esc(t('contact.email'))}</label><input class="input ltr" id="ct-email" type="email" autocomplete="email" data-required value="${esc(state.demo ? '' : state.profile.email)}"><span class="field__error"></span></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="ct-phone">${esc(t('contact.phone'))} <span class="muted">(${esc(t('common.optional'))})</span></label><input class="input ltr" id="ct-phone" type="tel" autocomplete="tel"></div>
        <div class="field"><label for="ct-topic">${esc(t('contact.topic'))}</label>
          <select class="select" id="ct-topic">${topics.map((k) => `<option value="${k}"${k === topic ? ' selected' : ''}>${esc(t(`contact.topics.${k}`))}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="ct-message">${esc(t('contact.message'))}</label><textarea class="textarea" id="ct-message" data-required maxlength="3000" placeholder="${esc(t('contact.messageHint'))}"></textarea><span class="field__error"></span></div>
      <div class="field"><label class="check"><input type="checkbox" id="ct-consent" data-required><span>${esc(t('contact.consent'))}</span></label><span class="field__error"></span></div>
      <button type="submit" class="btn btn--primary btn--lg">${icon('send', 'flip-rtl')}${esc(t('contact.send'))}</button>
    </form>

    <div class="stack" style="gap:14px">
      <h2 class="h3">${esc(t('contact.channels'))}</h2>
      <a class="channel" href="mailto:${esc(c.email)}"><span class="channel__icon">${icon('mail')}</span><div><b>${esc(t('contact.emailUs'))}</b><span class="ltr">${esc(c.email)}</span></div></a>
      ${c.whatsapp ? `<a class="channel" href="https://wa.me/${esc(String(c.whatsapp).replace(/\D/g, ''))}" target="_blank" rel="noopener"><span class="channel__icon">${icon('whatsapp')}</span><div><b>${esc(t('contact.whatsapp'))}</b><span>${esc(t('contact.whatsappText'))}</span></div></a>` : ''}
      <a class="channel" href="tel:${esc(String(c.phone).replace(/\s/g, ''))}"><span class="channel__icon">${icon('phone')}</span><div><b>${esc(t('contact.call'))}</b><span class="ltr">${esc(c.phone)}</span></div></a>
      <button type="button" class="channel" data-chat><span class="channel__icon">${icon('sparkles')}</span><div><b>${esc(t('contact.chat'))}</b><span>${esc(t('contact.chatText'))}</span></div></button>
      <div class="channel"><span class="channel__icon">${icon('clock')}</span><div><b>${esc(t('contact.hours'))}</b><span>${esc(tx(c.hours))} · ${esc(tx(c.address))}</span></div></div>
      <div class="card trial-card" style="margin-top:6px">
        <span class="glow-orb" aria-hidden="true"></span>
        <div class="stack" style="gap:10px">
          <span class="chip chip--soft" style="width:fit-content">${icon('sparkles')}${esc(t('contact.trial.badge'))}</span>
          <h3 class="h3">${esc(t('contact.trial.title'))}</h3>
          <p class="muted">${esc(t('contact.trial.text'))}</p>
          <div class="row"><a class="btn btn--light btn--sm" href="course.html?id=ui-ux-fundamentals">${esc(t('contact.trial.lesson'))}${icon('arrow', 'flip-rtl')}</a>
            <button type="button" class="btn btn--ghost btn--sm" data-trial>${esc(t('contact.trial.demo'))}</button></div>
        </div>
      </div>
    </div>
  </div>`;

  $('#contact-faq').innerHTML = `<div class="section-head section-head--center"><span class="eyebrow">${esc(t('home.faq.eyebrow'))}</span><h2 class="h2">${esc(t('contact.faq.title'))}</h2></div>
    <div class="faq-tools">
      <div class="input-group">${icon('search')}<label class="sr-only" for="faq-search">${esc(t('contact.faq.search'))}</label><input class="input" id="faq-search" type="search" placeholder="${esc(t('contact.faq.search'))}" value="${esc(faqQuery)}"></div>
    </div>
    <div class="row" style="gap:8px;margin-bottom:20px" role="group" aria-label="${esc(t('contact.faq.title'))}">
      ${[{ id: 'all', label: t('contact.faq.all') }, ...faq.categories.map((k) => ({ id: k.id, label: tx(k.label) }))].map((k) => `<button type="button" class="chip${faqCat === k.id ? ' is-active' : ''}" aria-pressed="${faqCat === k.id}" data-faq-cat="${esc(k.id)}">${esc(k.label)}</button>`).join('')}
    </div>
    <div id="faq-list"></div>`;
  drawFaq(faq);

  $('#faq-search').addEventListener('input', (e) => { faqQuery = e.target.value; drawFaq(faq); });
  $$('[data-faq-cat]').forEach((b) => b.addEventListener('click', () => {
    faqCat = b.dataset.faqCat;
    $$('[data-faq-cat]').forEach((x) => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    drawFaq(faq);
  }));
  $('[data-chat]').addEventListener('click', () => document.dispatchEvent(new CustomEvent('app:openchat')));
  $('[data-trial]').addEventListener('click', () => {
    $('#ct-topic').value = 'trial';
    $('#ct-message').focus();
    $('#contact-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('#contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!validate(form)) return;
    const btn = $('button[type="submit"]', form);
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span>${esc(t('contact.sending'))}`;
    try {
      const how = await send(form);
      if (how === 'sent') {
        form.innerHTML = `<div class="success-panel"><span class="success-panel__icon">${icon('check')}</span><h2 class="h3">${esc(t('contact.success'))}</h2><p class="muted">${esc(tx(c.responseTime))}</p></div>`;
      } else {
        toast(t('contact.mailto'), 'info');
        btn.disabled = false;
        btn.innerHTML = `${icon('send', 'flip-rtl')}${esc(t('contact.send'))}`;
      }
    } catch (err) {
      console.error(err);
      toast(t('contact.failed'), 'error');
      btn.disabled = false;
      btn.innerHTML = `${icon('send', 'flip-rtl')}${esc(t('contact.send'))}`;
    }
  });

  if (location.hash === '#faq') requestAnimationFrame(() => $('#faq').scrollIntoView());
}

boot(render);
