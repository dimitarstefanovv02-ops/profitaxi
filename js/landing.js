// ProfiTaxi – маркетингов сайт: обща шапка и долна част, светла/тъмна тема,
// анимации при превъртане, броячи, водопад на разходите, витрина със снимки.

import { icon } from './util.js';

const PAGES = [
  ['/about', 'Какво е ProfiTaxi'],
  ['/features', 'Функции'],
  ['/how', 'Как работи'],
  ['/pricing', 'Цена'],
  ['/faq', 'Въпроси'],
];
const here = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';

// ---------- Тема: светла / тъмна (собствен ключ, за да не пипа темата на приложението) ----------
const THEME_KEY = 'profitaxi.siteTheme';
const sysDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
function currentTheme() { let t; try { t = localStorage.getItem(THEME_KEY); } catch { /* */ } return t === 'light' || t === 'dark' ? t : (sysDark() ? 'dark' : 'light'); }
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  document.querySelectorAll('img[data-light]').forEach((img) => { const src = img.dataset[t]; if (src && img.getAttribute('src') !== src) img.src = src; });
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#07080B' : '#FFFFFF');
}
applyTheme(currentTheme());

// ---------- Шапка и долна част ----------
const icons = {
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};
const head = document.getElementById('site-head');
if (head) {
  head.outerHTML = `
  <header class="s-head" id="s-head">
    <div class="s-wrap s-head-in">
      <a class="s-brand" href="/" aria-label="ProfiTaxi – начало"><img src="/icons/icon-192.png" alt="" width="48" height="48"><span>Profi<b>Taxi</b></span></a>
      <nav class="s-nav" aria-label="Страници">${PAGES.map(([u, l]) => `<a href="${u}"${here === u ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
      <div class="s-head-cta">
        <button class="s-icon-btn" id="theme-btn" type="button" aria-label="Смени темата" title="Светла / тъмна тема"></button>
        <a class="s-btn s-btn-ghost hide-xs" href="/app#/login">Вход</a>
        <a class="s-btn s-btn-y" href="/app#/register">Пробвай<span class="hide-sm">&nbsp;безплатно</span></a>
        <button class="s-icon-btn s-menu-btn" id="menu-btn" type="button" aria-label="Меню" aria-expanded="false">${icons.menu}</button>
      </div>
    </div>
    <div class="s-drawer" id="drawer" hidden>
      <nav class="s-wrap">${PAGES.map(([u, l]) => `<a href="${u}"${here === u ? ' aria-current="page"' : ''}>${l}</a>`).join('')}
        <a href="/app#/login">Вход в приложението</a></nav>
    </div>
  </header>`;
}
const foot = document.getElementById('site-foot');
if (foot) {
  foot.outerHTML = `
  <footer class="s-foot">
    <div class="s-wrap s-foot-in">
      <div class="s-foot-brand">
        <a class="s-brand" href="/"><img src="/icons/icon-192.png" alt="" width="44" height="44"><span>Profi<b>Taxi</b></span></a>
        <p>Чистата печалба на таксиметровия шофьор. Направено в България.</p>
      </div>
      <nav aria-label="Страници"><b>Продукт</b>${PAGES.map(([u, l]) => `<a href="${u}">${l}</a>`).join('')}</nav>
      <nav aria-label="Акаунт"><b>Акаунт</b><a href="/app#/register">Регистрация</a><a href="/app#/login">Вход</a></nav>
      <nav aria-label="Документи"><b>Документи</b><a href="/terms">Общи условия</a><a href="/privacy">Поверителност</a><a href="mailto:support@profitaxi.bg">support@profitaxi.bg</a></nav>
    </div>
    <div class="s-wrap s-foot-bottom"><span>© 2026 ProfiTaxi</span><span>Сумите на сайта са примерни, от демо профил.</span></div>
  </footer>`;
}

// Бутон за тема (видим горе вдясно; помни избора, иначе следва системата)
const themeBtn = document.getElementById('theme-btn');
const paintThemeBtn = () => { if (themeBtn) { const t = currentTheme(); themeBtn.innerHTML = t === 'dark' ? icons.sun : icons.moon; themeBtn.setAttribute('aria-label', t === 'dark' ? 'Светла тема' : 'Тъмна тема'); } };
paintThemeBtn();
themeBtn?.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* */ }
  applyTheme(next); paintThemeBtn();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(currentTheme()); paintThemeBtn(); });

// Мобилно меню
const menuBtn = document.getElementById('menu-btn'), drawer = document.getElementById('drawer');
menuBtn?.addEventListener('click', () => {
  const open = drawer.hidden;
  drawer.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); menuBtn.innerHTML = open ? icons.close : icons.menu;
});

// Шапката става плътна при превъртане
const sHead = document.getElementById('s-head');
const onScroll = () => sHead?.classList.toggle('scrolled', scrollY > 8);
addEventListener('scroll', onScroll, { passive: true }); onScroll();

// Иконки: <span data-ic="fuel"> → двуцветна SVG иконка от приложението
document.querySelectorAll('[data-ic]').forEach((el) => el.prepend(icon(el.dataset.ic, Number(el.dataset.size || 26))));

// ---------- Анимации ----------
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
// 2 011,50 – групи от по три цифри и запетая (bg-BG не групира четирицифрени числа)
const fmt = (n, dec = 0) => {
  const [i, f] = Math.abs(n).toFixed(dec).split('.');
  return `${n < 0 ? '−' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')}${f ? ',' + f : ''}`;
};
function countUp(el) {
  const target = Number(el.dataset.count), dec = Number(el.dataset.dec || 0), suf = el.dataset.suffix ?? '', pre = el.dataset.prefix ?? '';
  if (reduce) { el.textContent = pre + fmt(target, dec) + suf; return; }
  const t0 = performance.now(), dur = Number(el.dataset.dur || 1100);
  const step = (t) => { const p = Math.min(1, (t - t0) / dur); el.textContent = pre + fmt(target * (1 - Math.pow(1 - p, 3)), dec) + suf; if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
// Поява: елементите с .rv се появяват при превъртане; .stagger > * – един след друг
const io = 'IntersectionObserver' in window && !reduce ? new IntersectionObserver((entries) => entries.forEach((e) => {
  if (!e.isIntersecting) return;
  const el = e.target; el.classList.add('in'); io.unobserve(el);
  el.querySelectorAll('[data-count]').forEach(countUp);
  if (el.matches('[data-count]')) countUp(el);
}), { rootMargin: '0px 0px -10% 0px', threshold: 0.12 }) : null;
document.querySelectorAll('.stagger').forEach((g) => [...g.children].forEach((c, i) => { c.classList.add('rv'); c.style.setProperty('--d', `${i * 90}ms`); }));
const startReveal = () => document.querySelectorAll('.rv, .count-block').forEach((el) => { if (io) io.observe(el); else { el.classList.add('in'); el.querySelectorAll('[data-count]').forEach(countUp); } });

// Въвеждащ ефект: логото се появява, после завесата се вдига и чак тогава тръгват анимациите на страницата
const intro = document.getElementById('intro');
if (document.documentElement.classList.contains('intro') && intro) {
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    try { sessionStorage.setItem('profitaxi.intro', '1'); } catch { /* */ }
    document.documentElement.classList.remove('intro'); intro.remove(); startReveal();
  };
  intro.addEventListener('animationend', (e) => { if (e.animationName === 'introOut') finish(); });
  intro.addEventListener('click', finish);
  setTimeout(finish, 4200); // за всеки случай
} else {
  intro?.remove();
  startReveal();
}

// ---------- Витрина със снимки на приложението ----------
document.querySelectorAll('[data-showcase]').forEach((box) => {
  const tabs = [...box.querySelectorAll('[data-shot]')];
  const img = box.querySelector('.sc-phone img');
  const cap = box.querySelector('.sc-caption');
  let i = 0, timer;
  const show = (k, user) => {
    i = k; const t = tabs[k];
    tabs.forEach((x) => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', String(x === t)); });
    img.dataset.light = `/img/screen-${t.dataset.shot}-light.jpg`; img.dataset.dark = `/img/screen-${t.dataset.shot}-dark.jpg`;
    img.classList.remove('swap'); void img.offsetWidth; img.classList.add('swap');
    img.src = img.dataset[currentTheme()]; img.alt = t.dataset.alt || t.textContent.trim();
    if (cap) cap.textContent = t.dataset.caption || '';
    if (user) clearInterval(timer);
  };
  tabs.forEach((t, k) => t.addEventListener('click', () => show(k, true)));
  show(0);
  if (!reduce) timer = setInterval(() => { if (document.visibilityState === 'visible') show((i + 1) % tabs.length); }, 4200);
});

// ---------- Цена: месечно / годишно ----------
document.querySelectorAll('.price-switch button').forEach((btn) => btn.addEventListener('click', () => {
  const plan = btn.dataset.plan;
  btn.parentElement.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === btn); b.setAttribute('aria-selected', String(b === btn)); });
  document.querySelectorAll('[data-m]').forEach((el) => { el.textContent = el.dataset[plan]; });
}));

// ---------- Стари линкове към приложението ----------
if (location.hash.startsWith('#/')) location.replace('/app' + location.hash);

// ---------- Визуални ефекти на всяка страница ----------
// Пътят горе (колкото си прочел), сияние в шапките, светлина под курсора по картите,
// 3D наклон на телефоните, думите в заглавието изплуват една по една.
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  // 1) Път с такси: показва докъде си стигнал в страницата
  const road = document.createElement('div');
  road.className = 'fx-road';
  road.innerHTML = '<i class="fx-road-fill"></i><span class="fx-taxi"><svg viewBox="60 140 420 240" width="34" height="20" aria-hidden="true"><rect x="262" y="150" width="84" height="34" rx="9" fill="#A78BFA"/><path d="M70 302c0-22 13-38 35-42l58-10 50-52c11-11 26-18 42-18h86c17 0 33 8 44 21l36 45 26 6c20 5 34 22 34 43v20c0 11-9 20-20 20H88c-10 0-18-8-18-18z" fill="#FFC21A"/><path d="M226 246l30-36c5-6 12-9 20-9h38v45z M330 201h20c9 0 17 4 22 11l26 34h-68z" fill="#0B0B0F"/><circle cx="150" cy="330" r="42" fill="#0B0B0F"/><circle cx="372" cy="330" r="42" fill="#0B0B0F"/><circle cx="150" cy="330" r="18" fill="#fff"/><circle cx="372" cy="330" r="18" fill="#fff"/></svg></span>';
  document.body.appendChild(road);
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
    road.style.setProperty('--p', p.toFixed(4));
    road.classList.toggle('on', scrollY > 40);
  };
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); onScroll();

  // 2) Лилаво сияние, което бавно се движи в горната част на всяка страница
  document.querySelectorAll('.hero2, .page-hero').forEach((el) => {
    const a = document.createElement('div'); a.className = 'fx-aurora'; a.setAttribute('aria-hidden', 'true');
    a.innerHTML = '<i></i><i></i><i></i>';
    el.prepend(a);
  });
  addEventListener('scroll', () => document.documentElement.style.setProperty('--sy', String(Math.min(scrollY, 900))), { passive: true });

  // 3) Думите в главното заглавие изплуват една по една
  document.querySelectorAll('.hero2 h1, .page-hero h1').forEach((h1) => {
    let n = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((c) => {
        if (c.nodeType === 3) {
          // Препинателен знак веднага след дума в друг елемент (напр. „остава?“) не бива да пада на нов ред
          const lead = c.textContent.match(/^[^\s\w\u0400-\u04FF]+/);
          if (lead && c.previousSibling && c.previousSibling.nodeType === 1) {
            const wrap = document.createElement('span'); wrap.style.whiteSpace = 'nowrap';
            const prev = c.previousSibling; prev.replaceWith(wrap); wrap.append(prev);
            const pun = document.createElement('span'); pun.className = 'fx-w'; pun.style.setProperty('--wi', n++); pun.textContent = lead[0]; wrap.append(pun);
            c.textContent = c.textContent.slice(lead[0].length);
          }
          const parts = c.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach((t) => {
            if (!t) return;
            if (/^\s+$/.test(t)) { frag.append(t); return; }
            const s = document.createElement('span'); s.className = 'fx-w'; s.style.setProperty('--wi', n++); s.textContent = t; frag.append(s);
          });
          c.replaceWith(frag);
        } else if (c.nodeType === 1 && !c.matches('br')) walk(c);
      });
    };
    walk(h1); h1.classList.add('fx-words');
  });

  if (!fine) return; // следващите ефекти са само за мишка

  // 4) Светлина под курсора по картите
  const cards = '.f-card, .step3, .step4, .faq details, .price-card2, .metric, .cmp-card, .tl, .roi, .more-box, .bill';
  document.addEventListener('pointermove', (e) => {
    const c = e.target.closest?.(cards); if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', `${e.clientX - r.left}px`); c.style.setProperty('--my', `${e.clientY - r.top}px`);
    c.classList.add('fx-lit');
  }, { passive: true });
  document.addEventListener('pointerout', (e) => { const c = e.target.closest?.(cards); if (c && !c.contains(e.relatedTarget)) c.classList.remove('fx-lit'); });

  // 5) 3D наклон на телефоните
  document.querySelectorAll('.phone2').forEach((ph) => {
    ph.classList.add('fx-tilt');
    ph.addEventListener('pointermove', (e) => {
      const r = ph.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      ph.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`); ph.style.setProperty('--ry', `${(x * 12).toFixed(2)}deg`);
    });
    ph.addEventListener('pointerleave', () => { ph.style.setProperty('--rx', '0deg'); ph.style.setProperty('--ry', '0deg'); });
  });
})();
