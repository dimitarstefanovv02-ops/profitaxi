// Презентация за начинаещи: страниците като картинки (четат се на всеки телефон) + PDF за теглене.
// След регистрацията се показва веднъж (?first=1), после е винаги в Профил → „Презентация“.
import { h, icon } from '../util.js';

export const GUIDE_PAGES = 16;
export const GUIDE_PDF = '/guide/Chisto-vavedenie.pdf';
const page = (n) => `/guide/p${String(n).padStart(2, '0')}.webp`;

export function guideView({ go, route }) {
  const first = route?.query?.get('first') === '1';
  const next = () => go('/onboarding');
  const pdf = h('a', { class: 'btn btn-ghost btn-block', href: GUIDE_PDF, download: 'Chisto-vavedenie.pdf' }, icon('download', 18), 'Изтегли като PDF');
  return h('div', { class: 'screen guide', 'data-page': 'guide' },
    first && h('div', { class: 'guide-top' }, h('span', { class: 'chip good' }, icon('check', 14), 'Акаунтът е създаден'), h('button', { class: 'link', onclick: next }, 'Пропусни')),
    h('div', { class: 'page-title' }, h('h1', null, first ? 'Добре дошъл! Ето как работи' : 'Презентация')),
    h('p', { class: 'muted', style: { margin: '-6px 0 14px' } }, `${GUIDE_PAGES} страници · около 10 минути. Превърти надолу.${first ? ' Ще я намериш винаги в Профил → „Презентация“.' : ''}`),
    pdf,
    h('div', { class: 'guide-pages' }, Array.from({ length: GUIDE_PAGES }, (_, i) =>
      h('img', { class: 'guide-page', src: page(i + 1), alt: `Страница ${i + 1} от ${GUIDE_PAGES}`, loading: i < 2 ? 'eager' : 'lazy', width: 720, height: 1280 }))),
    first
      ? h('div', { class: 'guide-next' }, h('button', { class: 'btn btn-primary btn-xl btn-block', onclick: next }, 'Нататък: настрой колата', icon('right', 20)))
      : pdf.cloneNode(true));
}
