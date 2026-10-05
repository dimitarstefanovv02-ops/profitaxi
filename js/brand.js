// Издания на приложението. Обикновеното е ProfiTaxi (/app).
// /app/onetaxi е изданието за шофьорите на One Taxi Пловдив – същото приложение,
// в цветовете на One, само за техните шофьори.
import { h } from './util.js';

export const ONE = {
  key: 'one',
  name: 'One Taxi',
  city: 'Пловдив',
  company: 'ONE Такси – 032 22 22',
  // Кодът, който One Taxi дава на своите шофьори при регистрация (сменя се тук)
  accessCode: 'ONE2026',
  base: '/app/onetaxi',
  icon: '/icons/one-192.png',
};

export const BRAND = document.documentElement.dataset.brand === 'one' ? ONE : null;
export const appBase = () => (BRAND ? BRAND.base : '/app');
export const isBrandUser = (u) => !BRAND || (u && u.company === BRAND.company);

// Марката горе на входа: ONE × PROFITAXI (смел надпис)
export const collabMark = () => h('a', { class: 'collab', href: ONE.base, 'aria-label': 'One Taxi × ProfiTaxi' },
  h('img', { class: 'collab-lockup on-light', src: '/icons/one-lockup.svg', alt: 'One × ProfiTaxi' }),
  h('img', { class: 'collab-lockup on-dark', src: '/icons/one-lockup-dark.svg', alt: 'One × ProfiTaxi' }));

// Тънка лента горе на всяка страница – напомня за партньорството (логото One | ProfiTaxi)
export const collabBar = () => h('div', { class: 'collab-bar', role: 'banner' },
  h('img', { class: 'cb-lockup on-light', src: '/icons/one-lockup.svg', alt: 'One × ProfiTaxi, партньори' }),
  h('img', { class: 'cb-lockup on-dark', src: '/icons/one-lockup-dark.svg', alt: 'One × ProfiTaxi, партньори' }));

// Въвеждащ ефект (като на сайта, в цветовете на One): графиката расте, таксито с табела One
// се изкачва по линията, след него хвърчат пари, горе излиза печалбата, а заедно с линията
// се появява логото ONE × PROFITAXI. Накрая таксито излита. Веднъж на посещение.
export function oneIntro() {
  if (!BRAND) return;
  let seen = null; try { seen = sessionStorage.getItem('profitaxi.oneIntro'); } catch { /* */ }
  if (seen || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try { sessionStorage.setItem('profitaxi.oneIntro', '1'); } catch { /* */ }
  const bars = [60, 95, 80, 150, 190, 250].map((hh, i) => `<rect class="oc-bar" style="--b:${i}" x="${70 + i * 112}" y="${380 - hh}" width="62" height="${hh}" rx="10"/>`).join('');
  const el = document.createElement('div');
  el.id = 'one-intro'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="oc-in">
    <img class="oc-logo" src="/icons/one-lockup-dark.svg" alt="">
    <div class="oc-sub">Партньори · за шофьорите на One Taxi Пловдив</div>
    <div class="oc-scene">
      <svg class="oc-svg" viewBox="0 0 760 420">
        <defs>
          <linearGradient id="ocCar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE066"/><stop offset=".55" stop-color="#FFC21A"/><stop offset="1" stop-color="#F2A100"/></linearGradient>
          <linearGradient id="ocBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A3A42"/><stop offset="1" stop-color="#1A1A1F"/></linearGradient>
        </defs>
        <g stroke="rgba(255,255,255,.08)" stroke-width="1"><path d="M40 380H740M40 300H740M40 220H740M40 140H740M40 60H740"/></g>
        <g fill="url(#ocBar)">${bars}</g>
        <path id="oc-path" class="oc-line" d="M40 352 C120 340 150 300 213 296 S300 318 355 286 S440 220 501 196 S600 150 643 118 S710 70 740 60" fill="none" stroke="#ED1D24" stroke-width="7" stroke-linecap="round"/>
        <g class="oc-car" opacity="0"><g transform="translate(-58,-62) scale(.25)">
          <rect x="248" y="146" width="112" height="40" rx="9" fill="#ED1D24" stroke="#0A0A0C" stroke-width="5"/>
          <text x="304" y="176" text-anchor="middle" font-family="Archivo, Inter, Arial, sans-serif" font-weight="900" font-size="30" fill="#fff">ONE</text>
          <path d="M70 302c0-22 13-38 35-42l58-10 50-52c11-11 26-18 42-18h86c17 0 33 8 44 21l36 45 26 6c20 5 34 22 34 43v20c0 11-9 20-20 20H88c-10 0-18-8-18-18z" fill="url(#ocCar)"/>
          <path d="M226 246l30-36c5-6 12-9 20-9h38v45z M330 201h20c9 0 17 4 22 11l26 34h-68z" fill="#0A0A0C"/>
          <path d="M74 278h26c5 0 8 4 7 9l-2 6H72z" fill="#ED1D24"/><path d="M424 266h16c8 0 14 6 14 14v4h-30z" fill="#FFFBEA"/>
          <circle cx="150" cy="330" r="42" fill="#0A0A0C"/><circle cx="150" cy="330" r="20" fill="#fff"/><circle cx="150" cy="330" r="8" fill="#ED1D24"/>
          <circle cx="372" cy="330" r="42" fill="#0A0A0C"/><circle cx="372" cy="330" r="20" fill="#fff"/><circle cx="372" cy="330" r="8" fill="#ED1D24"/>
        </g></g>
        <g class="oc-peak"><rect x="560" y="10" width="170" height="44" rx="14" fill="#ED1D24"/><text x="645" y="41" text-anchor="middle" font-family="Archivo, Inter, sans-serif" font-weight="900" font-size="24" fill="#fff"><tspan class="oc-num">+0 €</tspan></text></g>
      </svg>
      <div class="oc-money"></div>
    </div>
  </div><div class="oc-skip">Натисни, за да продължиш</div>`;
  document.body.appendChild(el);
  let done = false;
  const finish = () => { if (done) return; done = true; el.classList.add('out'); setTimeout(() => el.remove(), 650); };
  el.addEventListener('click', finish);
  setTimeout(finish, 5400);

  const path = el.querySelector('#oc-path'), car = el.querySelector('.oc-car'), money = el.querySelector('.oc-money');
  const svg = el.querySelector('.oc-svg'), peak = el.querySelector('.oc-peak'), num = el.querySelector('.oc-num');
  const len = path.getTotalLength();
  const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const T0 = 650, DUR = 2300, OFF = 4500, t0 = performance.now();
  let lastSpawn = 0, popped = false;
  const spawn = (x, y, ang) => {
    const r = svg.getBoundingClientRect(), sx = r.width / 760, sy = r.height / 420;
    const m = document.createElement('span'); const coin = Math.random() < .35;
    m.className = coin ? 'coin' : 'bill'; if (!coin) m.textContent = '€';
    const back = ang + Math.PI, sp = 70 + Math.random() * 120;
    m.style.left = `${x * sx}px`; m.style.top = `${(y - 6) * sy}px`;
    m.style.setProperty('--x', `${Math.cos(back) * sp + (Math.random() - .5) * 60}px`);
    m.style.setProperty('--y', `${Math.sin(back) * sp - 40 - Math.random() * 90}px`);
    m.style.setProperty('--r', `${(Math.random() - .5) * 720}deg`);
    m.style.setProperty('--t', `${.9 + Math.random() * .7}s`);
    money.appendChild(m); setTimeout(() => m.remove(), 1700);
  };
  const tick = (now) => {
    if (done) return;
    const t = now - t0;
    if (t >= T0) {
      car.setAttribute('opacity', '1');
      let p, offX = 0;
      if (t < T0 + DUR) p = ease((t - T0) / DUR);
      else { p = 1; offX = t > OFF ? Math.pow((t - OFF) / 500, 2) * 900 : 0; }
      const a = path.getPointAtLength(p * len), b = path.getPointAtLength(Math.min(len, p * len + 2));
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      car.setAttribute('transform', `translate(${a.x + offX} ${a.y - offX * .25}) rotate(${(offX ? -18 : ang * 180 / Math.PI).toFixed(2)})`);
      if (t < T0 + DUR + 150 && now - lastSpawn > 55) { lastSpawn = now; spawn(a.x, a.y, ang); if (Math.random() < .5) spawn(a.x, a.y, ang); }
      const k = Math.max(0, Math.min(1, (t - T0) / DUR));
      num.textContent = `+${String(Math.round(2011 * ease(k))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`;
      if (!popped && t > T0 + DUR * .55) { popped = true; peak.classList.add('on'); }
    }
    if (t < 5400) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
