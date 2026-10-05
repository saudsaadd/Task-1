import { boot, t, esc, icon, setTitle, $ } from '../app.js';

boot(() => {
  setTitle(t('nf.title'));
  $('#nf-root').innerHTML = `<div class="empty-state">
    <span class="display gradient-text">404</span>
    <h1>${esc(t('nf.title'))}</h1>
    <p class="muted">${esc(t('nf.text'))}</p>
    <div class="row" style="justify-content:center">
      <a class="btn btn--primary" href="index.html">${esc(t('nf.home'))}${icon('arrow', 'flip-rtl')}</a>
      <a class="btn btn--ghost" href="courses.html">${esc(t('nav.courses'))}</a>
    </div>
  </div>`;
});
