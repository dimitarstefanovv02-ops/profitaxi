// Препоръчай колега: персонален код. Месец безплатно за всеки поканен, който ПЛАТИ абонамента си.

import { h, icon, fmtDate } from '../util.js';
import * as store from '../store.js';
import { toast, hero, cardTitle } from '../ui.js';
export const inviteLink = (code) => `${location.origin}/app#/register?ref=${encodeURIComponent(code)}`;
async function share(code) {
  const url = inviteLink(code);
  const text = `Пробвай Чисто – виждаш колко реално ти остава от всяка смяна. Регистрирай се с моя код ${code}: ${url}`;
  if (navigator.share) { try { await navigator.share({ title: 'Чисто', text, url }); return; } catch { /* отказано */ } }
  try { await navigator.clipboard.writeText(text); toast('Поканата е копирана'); } catch { toast(url); }
}

export function inviteView({ go } = {}) {
  // Програмата може да се спре от админа – тогава връщаме към „Профил“
  if (!store.referralsOn()) { setTimeout(() => go ? go('/me', true) : (location.hash = '#/me')); return h('div'); }
  const ref = store.myReferrals();
  return h('div', { class: 'screen', 'data-page': 'invite' },
    h('a', { class: 'back', href: '#/me' }, icon('left', 20), 'Профил'),
    hero(
      h('div', { class: 'hero-top' }, h('div', null, h('h1', null, 'Препоръчай колега'), h('div', { class: 'hero-sub' }, 'За всеки колега, който плати абонамента си с твоя код, получаваш 1 месец безплатно'))),
      h('div', { class: 'code-box' },
        h('span', null, 'Твоят код'),
        h('b', null, ref.code),
        h('div', { class: 'row gap', style: { marginTop: '12px', flexWrap: 'wrap' } },
          h('button', { class: 'btn btn-sm code-btn', onclick: async () => { try { await navigator.clipboard.writeText(ref.code); toast('Кодът е копиран'); } catch { toast(ref.code); } } }, icon('copy', 16), 'Копирай кода'),
          h('button', { class: 'btn btn-sm code-btn solid', onclick: () => share(ref.code) }, icon('share', 16), 'Изпрати покана')))),
    h('section', { class: 'card' },
      cardTitle('gift', 'Спечелени', h('b', { class: 'num' }, `${ref.months} ${ref.months === 1 ? 'месец' : 'месеца'}`)),
      h('div', { class: 'grid3' },
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Регистрирани'), h('span', { class: 'stat-value' }, String(ref.count))),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Платили'), h('span', { class: 'stat-value' }, String(ref.paid))),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Месеци'), h('span', { class: 'stat-value pos' }, String(ref.months)))),
      h('p', { class: 'muted small', style: { marginTop: '12px' } }, 'Месецът се добавя автоматично към абонамента ти, щом колегата плати първия си месец. Няма лимит.')),
    h('section', { class: 'card' },
      cardTitle('users', 'Регистрирани с твоя код'),
      ref.invited.length
        ? ref.invited.map((x) => h('div', { class: 'list-btn' }, h('span', { class: 'l-ic' }, icon('user', 18)), h('span', { class: 'grow' }, x.name), h('span', { class: x.paid ? 'chip good' : 'chip' }, x.paid ? 'платил' : 'още не е платил'), h('span', { class: 'muted small' }, fmtDate(x.date, { year: true }))))
        : h('p', { class: 'muted small' }, 'Още никой. Изпрати кода на колегите от стоянката.')));
}
