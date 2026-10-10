// ProfiTaxi – маркетингов сайт: мобилно меню и витрина със снимки от приложението.
// Самостоятелен файл, без зависимости. Шапката и долната част са вградени в HTML-а.
(() => {
  // Стари линкове към приложението (/#/…) – за всеки случай и тук
  if (location.hash.startsWith('#/')) { location.replace('/app' + location.hash); return; }

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
    tabs.forEach((t) => { const i = new Image(); i.src = `/img/screen-${t.dataset.shot}-light.jpg`; });
    const show = (t) => {
      tabs.forEach((x) => x.setAttribute('aria-selected', String(x === t)));
      img.classList.add('swap');
      setTimeout(() => {
        img.src = `/img/screen-${t.dataset.shot}-light.jpg`;
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
