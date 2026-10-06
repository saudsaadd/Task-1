// Sign-in / create-account modal. Opened from the header ("My learning",
// "Sign in"), the mobile menu, or any action that needs an account.
// On success it redirects smoothly to `next` (default: the dashboard).
import {
  app, t, tx, esc, icon, safeUrl, signIn, signUp, signInDemo, hasDemoAccount, AuthError, toast, navigate, userName, $, $$
} from './app.js';

let dialog = null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function strength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score);
}

function field({ id, type = 'text', label, iconName, autocomplete, placeholder = '', password = false, hint = '' }) {
  return `<div class="field">
    <label for="${id}">${esc(label)}</label>
    <div class="input-group${password ? ' input-group--password' : ''}">
      ${icon(iconName)}
      <input class="input${type === 'email' || password ? ' ltr' : ''}" id="${id}" name="${id}" type="${type}" autocomplete="${autocomplete}" placeholder="${esc(placeholder)}" required>
      ${password ? `<button type="button" class="pw-toggle" data-pw-toggle="${id}" aria-label="${esc(t('auth.show'))}" aria-pressed="false">${icon('eye')}</button>` : ''}
    </div>
    ${hint}
    <span class="field__error" aria-live="polite"></span>
  </div>`;
}

function markup({ tab, reason }) {
  const b = app.site.brand;
  const lockup = safeUrl(b.logoBilingualOnDark || b.logoOnDark || b.logo);
  return `<div class="auth">
    <aside class="auth__brand on-dark" aria-hidden="true">
      <img class="auth__logo" src="${esc(lockup)}" alt="">
      <div class="auth__brand-copy">
        <h2>${esc(tx(b.tagline) || t('auth.brandTitle'))}</h2>
        <ul>
          <li>${icon('live')}<span>${esc(t('auth.benefit.1'))}</span></li>
          <li>${icon('target')}<span>${esc(t('auth.benefit.2'))}</span></li>
          <li>${icon('award')}<span>${esc(t('auth.benefit.3'))}</span></li>
        </ul>
      </div>
      <p class="auth__brand-foot">${esc(t('auth.brandFoot'))}</p>
    </aside>
    <div class="auth__main">
      <button type="button" class="icon-btn icon-btn--sm auth__close" data-auth-close aria-label="${esc(t('common.close'))}">${icon('close')}</button>
      <div class="auth__tabs" role="tablist" aria-label="${esc(t('auth.account'))}">
        <button type="button" role="tab" id="auth-tab-signin" aria-controls="auth-panel-signin" data-auth-tab="signin">${esc(t('auth.signin'))}</button>
        <button type="button" role="tab" id="auth-tab-signup" aria-controls="auth-panel-signup" data-auth-tab="signup">${esc(t('auth.signup'))}</button>
        <span class="auth__tabs-ink" aria-hidden="true"></span>
      </div>
      ${reason ? `<p class="auth__reason">${icon('lock')}<span>${esc(reason)}</span></p>` : ''}

      <section class="auth__panel" role="tabpanel" id="auth-panel-signin" aria-labelledby="auth-tab-signin">
        <h2 class="auth__title" id="auth-title-signin">${esc(t('auth.title.signin'))}</h2>
        <p class="auth__sub">${esc(t('auth.sub.signin'))}</p>
        <form class="form" data-form="signin" novalidate>
          ${field({ id: 'si-email', type: 'email', label: t('auth.email'), iconName: 'mail', autocomplete: 'email', placeholder: 'name@example.com' })}
          ${field({ id: 'si-password', type: 'password', label: t('auth.password'), iconName: 'lock', autocomplete: 'current-password', password: true })}
          <div class="row" style="justify-content:space-between;margin-top:-6px">
            <span></span>
            <button type="button" class="link-btn" data-forgot>${esc(t('auth.forgot'))}</button>
          </div>
          <p class="auth__error" role="alert" hidden></p>
          <button type="submit" class="btn btn--primary btn--lg btn--block">${esc(t('auth.submit.signin'))}<span class="btn__arrow">${icon('arrow', 'flip-rtl')}</span></button>
        </form>
        <p class="auth__switch">${esc(t('auth.switch.toSignup'))} <button type="button" class="link-btn" data-auth-tab="signup">${esc(t('auth.signup'))}</button></p>
      </section>

      <section class="auth__panel" role="tabpanel" id="auth-panel-signup" aria-labelledby="auth-tab-signup">
        <h2 class="auth__title" id="auth-title-signup">${esc(t('auth.title.signup'))}</h2>
        <p class="auth__sub">${esc(t('auth.sub.signup'))}</p>
        <form class="form" data-form="signup" novalidate>
          ${field({ id: 'su-name', label: t('auth.name'), iconName: 'user', autocomplete: 'name', placeholder: t('auth.namePlaceholder') })}
          ${field({ id: 'su-email', type: 'email', label: t('auth.email'), iconName: 'mail', autocomplete: 'email', placeholder: 'name@example.com' })}
          ${field({ id: 'su-password', type: 'password', label: t('auth.password'), iconName: 'lock', autocomplete: 'new-password', password: true,
            hint: `<div class="pw-meter" data-strength="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div><span class="field__hint" data-pw-hint>${esc(t('auth.passwordHint'))}</span>` })}
          <p class="auth__terms">${esc(t('auth.terms'))}</p>
          <p class="auth__error" role="alert" hidden></p>
          <button type="submit" class="btn btn--primary btn--lg btn--block">${esc(t('auth.submit.signup'))}<span class="btn__arrow">${icon('arrow', 'flip-rtl')}</span></button>
        </form>
        <p class="auth__switch">${esc(t('auth.switch.toSignin'))} <button type="button" class="link-btn" data-auth-tab="signin">${esc(t('auth.signin'))}</button></p>
      </section>

      ${hasDemoAccount() ? `<div class="auth__or"><span>${esc(t('auth.or'))}</span></div>
      <button type="button" class="btn btn--ghost btn--block" data-demo>${icon('sparkles')}${esc(t('auth.demo'))}</button>` : ''}
      <p class="auth__note">${icon('shield')}<span>${esc(t('auth.local'))}</span></p>

      <div class="auth__success" hidden>
        <span class="success-panel__icon">${icon('check')}</span>
        <h2 class="auth__title"></h2>
        <p class="auth__sub"><span class="spinner" aria-hidden="true"></span> <span data-success-text></span></p>
      </div>
    </div>
  </div>`;
}

function setTab(tab, focus = true) {
  const root = dialog;
  root.dataset.tab = tab;
  $$('[role="tab"]', root).forEach((b) => {
    const on = b.dataset.authTab === tab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  $$('.auth__panel', root).forEach((p) => { p.hidden = p.id !== `auth-panel-${tab}`; });
  root.setAttribute('aria-labelledby', `auth-title-${tab}`);
  $$('.auth__error', root).forEach((e) => { e.hidden = true; });
  if (focus) setTimeout(() => $(`#auth-panel-${tab} input`, root)?.focus(), 40);
}

function setError(input, message) {
  const fieldEl = input.closest('.field');
  fieldEl.classList.toggle('is-invalid', !!message);
  fieldEl.querySelector('.field__error').textContent = message || '';
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function validate(form) {
  let first = null;
  const check = (input, msg) => { setError(input, msg); if (msg && !first) first = input; };
  const name = form.querySelector('#su-name');
  if (name) check(name, name.value.trim().length >= 2 ? '' : t('auth.err.name'));
  const email = form.querySelector('[type="email"]');
  check(email, !email.value.trim() ? t('form.required') : EMAIL_RE.test(email.value.trim()) ? '' : t('form.email'));
  const pw = form.querySelector('input[id$="password"]');
  const isSignup = form.dataset.form === 'signup';
  check(pw, !pw.value ? t('form.required') : isSignup && pw.value.length < 8 ? t('auth.err.passwordShort') : '');
  first?.focus();
  return !first;
}

function showFormError(form, message) {
  const el = form.querySelector('.auth__error');
  el.textContent = message;
  el.hidden = !message;
}

function busy(form, on) {
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = on;
  btn.classList.toggle('is-busy', on);
}

function succeed(user, kind, next) {
  const root = dialog;
  root.classList.add('is-success');
  const box = $('.auth__success', root);
  box.hidden = false;
  $('.auth__title', box).textContent = t(kind === 'signup' ? 'auth.success.signup' : 'auth.success.signin', { name: userName(user).split(' ')[0] });
  const target = next || 'dashboard.html';
  $('[data-success-text]', box).textContent = /dashboard\.html/.test(target) ? t('auth.redirect.dashboard') : t('auth.redirect.back');
  setTimeout(() => navigate(target), 900);
}

const errorText = (err) => ({
  exists: t('auth.err.exists'),
  notFound: t('auth.err.notFound'),
  wrongPassword: t('auth.err.wrongPassword'),
  noDemo: t('auth.err.noDemo')
}[err?.code] || t('auth.err.generic'));

function bind(next) {
  const root = dialog;
  $$('[data-auth-tab]', root).forEach((b) => b.addEventListener('click', () => setTab(b.dataset.authTab)));
  $('.auth__tabs', root).addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const other = root.dataset.tab === 'signin' ? 'signup' : 'signin';
    setTab(other, false);
    $(`#auth-tab-${other}`, root).focus();
  });
  $('[data-auth-close]', root).addEventListener('click', () => root.close());
  root.addEventListener('click', (e) => { if (e.target === root) root.close(); });

  $$('[data-pw-toggle]', root).forEach((b) => b.addEventListener('click', () => {
    const input = $(`#${b.dataset.pwToggle}`, root);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.innerHTML = icon(show ? 'eyeOff' : 'eye');
    b.setAttribute('aria-pressed', String(show));
    b.setAttribute('aria-label', show ? t('auth.hide') : t('auth.show'));
  }));

  const pw = $('#su-password', root);
  pw.addEventListener('input', () => {
    const score = pw.value ? Math.max(1, strength(pw.value)) : 0;
    $('.pw-meter', root).dataset.strength = String(score);
    $('[data-pw-hint]', root).textContent = pw.value ? t(`auth.strength.${score}`) : t('auth.passwordHint');
  });
  $$('input', root).forEach((i) => i.addEventListener('input', () => { if (i.closest('.field').classList.contains('is-invalid')) setError(i, ''); }));

  $('[data-form="signin"]', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    showFormError(form, '');
    if (!validate(form)) return;
    busy(form, true);
    try {
      const user = await signIn({ email: $('#si-email', root).value, password: $('#si-password', root).value });
      succeed(user, 'signin', next);
    } catch (err) {
      busy(form, false);
      showFormError(form, errorText(err));
      if (err instanceof AuthError && err.code === 'wrongPassword') $('#si-password', root).select();
    }
  });

  $('[data-form="signup"]', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    showFormError(form, '');
    if (!validate(form)) return;
    busy(form, true);
    try {
      const user = await signUp({ name: $('#su-name', root).value, email: $('#su-email', root).value, password: $('#su-password', root).value });
      succeed(user, 'signup', next);
    } catch (err) {
      busy(form, false);
      showFormError(form, errorText(err));
      if (err?.code === 'exists') {
        $('#si-email', root).value = $('#su-email', root).value;
      }
    }
  });

  $('[data-demo]', root)?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try { succeed(await signInDemo(), 'signin', next); } catch (err) { btn.disabled = false; toast(errorText(err), 'error'); }
  });

  $('[data-forgot]', root).addEventListener('click', () => {
    showFormError($('[data-form="signin"]', root), t('auth.forgotText'));
  });
}

export function openAuthModal({ tab = 'signin', next = '', reason = '' } = {}) {
  if (dialog?.open) { setTab(tab); return; }
  dialog = document.createElement('dialog');
  dialog.className = 'modal auth-modal';
  dialog.innerHTML = markup({ tab, reason });
  document.body.append(dialog);
  dialog.addEventListener('close', () => { dialog.remove(); dialog = null; });
  bind(next);
  setTab(tab === 'signup' ? 'signup' : 'signin', false);
  dialog.showModal();
  setTimeout(() => $(`#auth-panel-${dialog?.dataset.tab} input`, dialog)?.focus(), 60);
}
