import { INVITES_ON } from '../constants.js';
// Покани колеги: персонален код, прогрес и спечелени безплатни месеци

import { h, icon, cx, fmtDate } from '../util.js';
import * as store from '../store.js';
import { toast, hero, cardTitle } from '../ui.js';

export const inviteLink = (code) => `${location.origin}/app#/register?ref=${encodeURIComponent(code)}`;
async function share(code) {
  const url = inviteLink(code);
  const text = `Пробвай ProfiTaxi – виждаш колко реално ти остава от всяка смяна. Регистрирай се с моя код ${code}: ${url}`;
  if (navigator.share) { try { await navigator.share({ title: 'ProfiTaxi', text, url }); return; } catch { /* отказано */ } }
  try { await navigator.clipboard.writeText(text); toast('Поканата е копирана'); } catch { toast(url); }
}

export function inviteCard(ref, go) {
  const goal = ref.next ? ref.next.count : ref.tiers[ref.tiers.length - 1].count;
  return h('a', { class: 'card invite-card', href: '#/invite' },
    h('div', { class: 'invite-ic' }, icon('gift', 24)),
    h('div', { class: 'grow' },
      h('b', null, ref.next ? `Покани ${ref.next.count - ref.count} колеги и вземи ${ref.next.months === 1 ? '1 месец' : '2 месеца'} безплатно` : 'Спечели максималната награда!'),
      h('div', { class: 'inv-track' }, h('span', { style: { width: `${Math.min(1, ref.count / goal) * 100}%` } })),
      h('span', { class: 'muted small' }, `${ref.count} от ${goal} поканени, код ${ref.code}`)),
    icon('right', 18));
}

export function inviteView({ go } = {}) {
  // Програмата е спряна засега – връщаме към „Аз“
  if (!INVITES_ON) { setTimeout(() => go ? go('/me', true) : (location.hash = '#/me')); return h('div'); }
  const ref = store.myReferrals();
  const max = ref.tiers[ref.tiers.length - 1].count;
  return h('div', { class: 'screen', 'data-page': 'invite' },
    h('a', { class: 'back', href: '#/profile' }, icon('left', 20), 'Назад'),
    hero(
      h('div', { class: 'hero-top' }, h('div', null, h('h1', null, 'Покани колеги'), h('div', { class: 'hero-sub' }, 'Всеки, който се регистрира с твоя код, те доближава до безплатен месец'))),
      h('div', { class: 'code-box' },
        h('span', null, 'Твоят код'),
        h('b', null, ref.code),
        h('div', { class: 'row gap', style: { marginTop: '12px', flexWrap: 'wrap' } },
          h('button', { class: 'btn btn-sm code-btn', onclick: async () => { try { await navigator.clipboard.writeText(ref.code); toast('Кодът е копиран'); } catch { toast(ref.code); } } }, icon('copy', 16), 'Копирай кода'),
          h('button', { class: 'btn btn-sm code-btn solid', onclick: () => share(ref.code) }, icon('share', 16), 'Изпрати покана')))),
    h('section', { class: 'card' },
      cardTitle('gift', 'Награди', h('b', { class: 'num' }, `${ref.months} ${ref.months === 1 ? 'месец' : 'месеца'}`)),
      h('div', { class: 'ladder' },
        h('div', { class: 'ladder-track' }, h('span', { style: { width: `${Math.min(1, ref.count / max) * 100}%` } })),
        ref.tiers.map((t) => h('div', { class: cx('ladder-step', ref.count >= t.count && 'on'), style: { left: `${(t.count / max) * 100}%` } },
          h('i', null, ref.count >= t.count ? icon('check', 14) : t.count),
          h('span', null, `${t.months === 1 ? '1 месец' : 'общо 2 месеца'}`)))),
      h('div', { class: 'grid3', style: { marginTop: '34px' } },
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Поканени'), h('span', { class: 'stat-value' }, String(ref.count))),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'До награда'), h('span', { class: 'stat-value' }, ref.next ? String(ref.next.count - ref.count) : '✓')),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Спечелени'), h('span', { class: 'stat-value pos' }, `${ref.months} мес.`))),
      h('p', { class: 'muted small', style: { marginTop: '12px' } }, '5 регистрирани колеги с твоя код носят 1 безплатен месец, а 8 – общо 2 безплатни месеца. Месеците се добавят автоматично към абонамента ти.')),
    h('section', { class: 'card' },
      cardTitle('users', 'Регистрирани с твоя код'),
      ref.invited.length
        ? ref.invited.map((x) => h('div', { class: 'list-btn' }, h('span', { class: 'l-ic' }, icon('user', 18)), h('span', { class: 'grow' }, x.name), h('span', { class: 'muted small' }, fmtDate(x.date, { year: true }))))
        : h('p', { class: 'muted small' }, 'Още никой. Изпрати кода на колегите от стоянката.')));
}
