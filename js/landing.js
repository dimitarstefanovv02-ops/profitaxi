// ProfiTaxi – начална страница: превключвател на цената, сметката в началото, поява при превъртане

// Месечно / годишно
document.querySelectorAll('.price-switch button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const plan = btn.dataset.plan;
    document.querySelectorAll('.price-switch button').forEach((b) => { b.classList.toggle('on', b === btn); b.setAttribute('aria-selected', String(b === btn)); });
    document.querySelectorAll('[data-m]').forEach((el) => { el.textContent = el.dataset[plan]; });
  });
});

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n) => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('bg-BG')} €`;

// Сметката: числата се „пресмятат“ един по един
function runReceipt() {
  const rows = [...document.querySelectorAll('.receipt [data-count]')];
  if (reduce) return;
  rows.forEach((el) => { el.textContent = fmt(0); });
  rows.forEach((el, i) => {
    const target = Number(el.dataset.count);
    setTimeout(() => {
      const t0 = performance.now(), dur = 700;
      const step = (t) => { const p = Math.min(1, (t - t0) / dur); el.textContent = fmt(target * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }, 300 + i * 260);
  });
}
runReceipt();

// Поява на секциите
if (!reduce && 'IntersectionObserver' in window) {
  const els = document.querySelectorAll('.l-card, .feature, .mini, .steps3 li, .price-card, details');
  els.forEach((el) => el.classList.add('reveal'));
  const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  els.forEach((el) => io.observe(el));
}
