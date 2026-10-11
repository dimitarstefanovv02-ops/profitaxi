// ProfiTaxi – маркетингов сайт: светла/тъмна тема, мобилно меню и витрина със снимки от приложението.
// Самостоятелен файл, без зависимости. Шапката и долната част са вградени в HTML-а.
// Темата се слага още в <head> (site/_head.html), за да няма проблясване; тук е бутонът и снимките.
(() => {
  // Стари линкове към приложението (/#/…) – за всеки случай и тук
  if (location.hash.startsWith('#/')) { location.replace('/app' + location.hash); return; }

  // ---------- Тема ----------
  const KEY = 'profitaxi.siteTheme', root = document.documentElement;
  const sysDark = matchMedia('(prefers-color-scheme: dark)');
  const saved = () => { try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : null; } catch { return null; } };
  const theme = () => root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const themeBtn = document.getElementById('theme-btn');
  const apply = (t) => {
    root.setAttribute('data-theme', t);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#0D0C0C' : '#231F20');
    document.querySelectorAll('img[data-light]').forEach((img) => { const src = img.dataset[t]; if (src && img.getAttribute('src') !== src) img.src = src; });
    themeBtn?.setAttribute('aria-label', t === 'dark' ? 'Светла тема' : 'Тъмна тема');
    themeBtn?.setAttribute('aria-pressed', String(t === 'dark'));
  };
  apply(saved() || (sysDark.matches ? 'dark' : 'light'));
  themeBtn?.addEventListener('click', () => {
    const t = theme() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, t); } catch { /* частен режим – само за тази страница */ }
    apply(t);
  });
  // Без изричен избор сайтът следва телефона и когато темата му се смени
  sysDark.addEventListener('change', (e) => { if (!saved()) apply(e.matches ? 'dark' : 'light'); });

  // ---------- Мобилно меню ----------
  const btn = document.getElementById('menu-btn'), drawer = document.getElementById('drawer');
  const setMenu = (open) => {
    if (!btn || !drawer) return;
    drawer.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Затвори менюто' : 'Меню');
    document.body.classList.toggle('menu-open', open);
  };
  btn?.addEventListener('click', () => setMenu(drawer.hidden));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  matchMedia('(min-width: 1024px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

  // ---------- Витрина: бутоните сменят снимката и описанието ----------
  document.querySelectorAll('[data-show]').forEach((box) => {
    const tabs = [...box.querySelectorAll('[data-shot]')];
    const img = box.querySelector('.show-vis img'), cap = box.querySelector('.show-cap');
    // зареди снимките предварително, за да няма празно при смяна
    tabs.forEach((t) => { const i = new Image(); i.src = `/img/screen-${t.dataset.shot}-${theme()}.jpg`; });
    const show = (t) => {
      tabs.forEach((x) => x.setAttribute('aria-selected', String(x === t)));
      img.classList.add('swap');
      setTimeout(() => {
        img.dataset.light = `/img/screen-${t.dataset.shot}-light.jpg`;
        img.dataset.dark = `/img/screen-${t.dataset.shot}-dark.jpg`;
        img.src = img.dataset[theme()];
        img.alt = `Екран „${t.textContent.trim()}“ от приложението`;
        img.classList.remove('swap');
      }, 150);
      if (cap) cap.textContent = t.dataset.cap || '';
    };
    tabs.forEach((t, k) => {
      t.addEventListener('click', () => show(t));
      t.addEventListener('keydown', (e) => {
        const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!d) return;
        e.preventDefault();
        const n = tabs[(k + d + tabs.length) % tabs.length]; n.focus(); show(n);
      });
    });
  });
})();
