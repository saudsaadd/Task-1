// Course catalogue with search, category and level filters.
import { boot, data, t, tx, esc, icon, fmtNum, courseCard, setTitle, param, $, $$, observeReveals } from '../app.js';

const filters = { q: param('q') || '', cat: param('cat') || 'all', level: param('level') || 'all', sort: param('sort') || 'popular' };

const normalize = (s) => String(s).toLowerCase().replace(/[ً-ْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

function syncUrl() {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(filters)) {
    if (v && v !== 'all' && !(k === 'sort' && v === 'popular')) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  history.replaceState(null, '', url);
}

async function render() {
  setTitle(t('courses.title'));
  const catalog = await data.courses();

  $('#courses-head').innerHTML = `
    <span class="eyebrow">${esc(t('courses.eyebrow'))}</span>
    <h1 class="display" style="margin:14px 0 12px">${esc(t('courses.title'))}</h1>
    <p class="lead">${esc(t('courses.text'))}</p>
    <div class="stack" style="margin-top:32px;gap:18px">
      <div class="row" style="gap:12px">
        <div class="input-group" style="flex:1;min-width:240px">
          ${icon('search')}
          <label class="sr-only" for="course-search">${esc(t('courses.search'))}</label>
          <input class="input" id="course-search" type="search" placeholder="${esc(t('courses.search'))}" value="${esc(filters.q)}" autocomplete="off">
        </div>
        <label class="sr-only" for="course-level">${esc(t('courses.level'))}</label>
        <select class="select" id="course-level" style="width:auto;min-width:170px">
          ${['all', 'beginner', 'intermediate', 'advanced'].map((l) => `<option value="${l}"${filters.level === l ? ' selected' : ''}>${esc(l === 'all' ? t('courses.allLevels') : t(`level.${l}`))}</option>`).join('')}
        </select>
        <label class="sr-only" for="course-sort">${esc(t('courses.sort'))}</label>
        <select class="select" id="course-sort" style="width:auto;min-width:170px">
          ${['popular', 'rating', 'priceLow', 'priceHigh', 'shortest'].map((s) => `<option value="${s}"${filters.sort === s ? ' selected' : ''}>${esc(t(`courses.sort.${s}`))}</option>`).join('')}
        </select>
      </div>
      <div class="row" role="group" aria-label="${esc(t('courses.categories'))}" style="gap:8px">
        ${[{ id: 'all', label: t('courses.all') }, ...catalog.categories.map((c) => ({ id: c.id, label: tx(c.label) }))]
          .map((c) => `<button type="button" class="chip${filters.cat === c.id ? ' is-active' : ''}" data-cat="${esc(c.id)}" aria-pressed="${filters.cat === c.id}">${esc(c.label)}</button>`).join('')}
      </div>
    </div>`;

  const list = () => {
    const q = normalize(filters.q.trim());
    let items = catalog.courses.filter((c) =>
      (filters.cat === 'all' || c.category === filters.cat) &&
      (filters.level === 'all' || c.level === filters.level) &&
      (!q || normalize(`${c.title.ar} ${c.title.en} ${c.subtitle.ar} ${c.subtitle.en} ${tx(c.instructor?.name)}`).includes(q)));
    const sorters = {
      popular: (a, b) => b.students - a.students,
      rating: (a, b) => b.rating - a.rating,
      priceLow: (a, b) => a.price - b.price,
      priceHigh: (a, b) => b.price - a.price,
      shortest: (a, b) => a.hours - b.hours
    };
    items = items.sort(sorters[filters.sort] || sorters.popular);
    $('#courses-list').innerHTML = `
      <p class="muted" style="margin-bottom:18px">${esc(t('courses.count', { n: fmtNum(items.length) }))}</p>
      ${items.length
        ? `<div class="grid grid--auto">${items.map((c) => courseCard(c, catalog.categories)).join('')}</div>`
        : `<div class="empty-state">${icon('search')}<h2>${esc(t('courses.empty'))}</h2><button type="button" class="btn btn--ghost" data-reset>${esc(t('courses.reset'))}</button></div>`}`;
    $('[data-reset]')?.addEventListener('click', () => {
      Object.assign(filters, { q: '', cat: 'all', level: 'all' });
      syncUrl();
      render();
    });
    observeReveals();
  };

  let timer;
  $('#course-search').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { filters.q = e.target.value; syncUrl(); list(); }, 160);
  });
  $('#course-level').addEventListener('change', (e) => { filters.level = e.target.value; syncUrl(); list(); });
  $('#course-sort').addEventListener('change', (e) => { filters.sort = e.target.value; syncUrl(); list(); });
  $$('[data-cat]').forEach((b) => b.addEventListener('click', () => {
    filters.cat = b.dataset.cat;
    $$('[data-cat]').forEach((x) => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    syncUrl();
    list();
  }));
  list();
}

boot(render);
