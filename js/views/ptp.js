// „При ПТП“ – двустранен протокол онлайн с приложението ДКП (dkp.bg).
// Чисто само насочва: бутони към Google Play / App Store и стъпките. ДКП е приложение на друга фирма.
import { h, icon } from '../util.js';

export const DKP = {
  site: 'https://dkp.bg/',
  play: 'https://play.google.com/store/apps/details?id=bg.dkp.bp_flutter',
  ios: 'https://apps.apple.com/bg/app/dkp/id6484505558',
};
export const PTP_STEPS = [
  ['Изтегли ДКП и се регистрирай', 'От Google Play или App Store – бутоните горе.'],
  ['Избери „Попълни протокол“', 'Приложението те води въпрос по въпрос.'],
  ['Данните на двамата шофьори', 'Книжки, коли, застраховки. Запомнят се за следващия път.'],
  ['Обстоятелствата и схемата', 'Какво се е случило и как са били колите. Добави снимки.'],
  ['Подпис от двамата', 'Електронно, както показва приложението.'],
  ['PDF за застрахователя', 'Готовият протокол идва на имейла на двамата.'],
];

const SVG = 'http://www.w3.org/2000/svg';
const svg = (d, fill) => { const s = document.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '26'); s.setAttribute('height', '26'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG, 'path'); p.setAttribute('d', d); if (fill) p.setAttribute('fill', 'currentColor'); else { p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.8'); p.setAttribute('stroke-linejoin', 'round'); p.setAttribute('stroke-linecap', 'round'); }
  s.appendChild(p); return s; };
// Обикновени знаци (не логата на магазините): триъгълник „пусни“ и телефон.
const IC_PLAY = 'M6 3.8v16.4a1 1 0 0 0 1.5.9l13.6-8.2a1 1 0 0 0 0-1.8L7.5 2.9A1 1 0 0 0 6 3.8z';
const IC_IOS = 'M8 2.5h8A1.5 1.5 0 0 1 17.5 4v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM10.5 18.5h3';

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
export function storeButtons() {
  const play = h('a', { class: 'store-btn', href: DKP.play, target: '_blank', rel: 'noopener' }, svg(IC_PLAY, true), h('span', null, h('small', null, 'Изтегли от'), h('b', null, 'Google Play')));
  const ios = h('a', { class: 'store-btn', href: DKP.ios, target: '_blank', rel: 'noopener' }, svg(IC_IOS), h('span', null, h('small', null, 'Изтегли от'), h('b', null, 'App Store')));
  return h('div', { class: 'store-btns' }, isIOS() ? [ios, play] : [play, ios]);
}

export function ptpView() {
  return h('div', { class: 'screen ptp', 'data-page': 'ptp' },
    h('div', { class: 'page-title' }, h('h1', null, 'При ПТП'), h('div', { class: 'date' }, 'Двустранен протокол от телефона')),
    h('div', { class: 'ptp-hero' },
      h('span', { class: 'ptp-ic' }, icon('doc', 28)),
      h('p', null, 'При леко ПТП без пострадали попълвате двустранния протокол онлайн с безплатното приложение ', h('b', null, 'ДКП'), '. Накрая получавате PDF, който давате на застрахователя.'),
      storeButtons(),
      h('a', { class: 'btn btn-ghost btn-block', href: DKP.site, target: '_blank', rel: 'noopener' }, icon('share', 18), 'Отвори dkp.bg')),
    h('a', { class: 'ptp-112', href: 'tel:112' }, icon('alert', 22), h('span', null, h('b', null, 'Има пострадали или не сте съгласни?'), h('span', null, 'Не попълвай протокол – звънни на 112.')), icon('call', 20)),
    h('h2', { class: 'section-title' }, 'Как се попълва'),
    h('ol', { class: 'ptp-steps' }, PTP_STEPS.map(([t, s], i) => h('li', null, h('i', null, String(i + 1)), h('div', null, h('b', null, t), h('span', null, s))))),
    h('p', { class: 'muted small ptp-note' }, 'ДКП е приложение на друга фирма – „Чисто“ само те насочва към него.'));
}
