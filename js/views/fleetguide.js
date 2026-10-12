// Ръководство за собственика: менюта по теми (Профил → „Ръководство за собственика“)
// и разходка стъпка по стъпка (при първото влизане като собственик и от Профил → „Разходка“).
import { h, icon, cx } from '../util.js';
import { GROUPS, walkSteps, OWNER_PDF } from '../fleetguide-data.js';

const img = (n) => `/guide/owner/${n}.webp`;
const shot = (n, eager) => h('img', { class: 'fg-shot', src: img(n), alt: '', loading: eager ? 'eager' : 'lazy', width: 600, height: 1298 });
const pts = (list) => h('ul', { class: 'fg-pts' }, list.map((t) => { const li = h('li'); li.innerHTML = t; return li; }));
let walkI = 0;

export function fleetGuideView({ go, route }) {
  const q = route?.query;
  if (q?.get('walk') === '1') return walkView(go, q.get('first') === '1');
  const g = GROUPS.find((x) => x.key === q?.get('g'));
  if (g) {
    return h('div', { class: 'screen fguide', 'data-page': 'fguide' },
      h('div', { class: 'page-title' }, h('h1', null, g.title)),
      h('p', { class: 'muted', style: { margin: '-6px 0 14px' } }, g.sub),
      g.steps.map((s, i) => h('section', { class: 'card fg-step' },
        h('div', { class: 'fg-num' }, String(i + 1)), h('h3', null, s.title), pts(s.points), shot(s.img, i === 0))),
      h('div', { class: 'fg-nav' },
        (() => { const k = GROUPS.indexOf(g); const nx = GROUPS[k + 1]; return nx ? h('a', { class: 'btn btn-primary btn-block', href: `#/fguide?g=${nx.key}` }, `Нататък: ${nx.title}`, icon('right', 18)) : null; })(),
        h('a', { class: 'btn btn-ghost btn-block', href: '#/fguide' }, icon('grid', 18), 'Всички теми')));
  }
  return h('div', { class: 'screen fguide', 'data-page': 'fguide' },
    h('div', { class: 'page-title' }, h('h1', null, 'Ръководство')),
    h('p', { class: 'muted', style: { margin: '-6px 0 14px' } }, 'Всичко за собственика на коли под наем – подредено по теми. Избери тема.'),
    h('div', { class: 'fg-grid' }, GROUPS.map((x, i) => h('a', { class: 'fg-tile', href: `#/fguide?g=${x.key}` },
      h('span', { class: 'fg-ic' }, icon(x.icon, 22)), h('b', null, `${i + 1}. ${x.title}`), h('small', null, x.sub)))),
    h('a', { class: 'btn btn-primary btn-block', style: { marginTop: '14px' }, href: '#/fguide?walk=1' }, icon('play', 18), 'Разходка стъпка по стъпка'),
    h('a', { class: 'btn btn-ghost btn-block', style: { marginTop: '8px' }, href: OWNER_PDF, download: 'Chisto-avtopark.pdf' }, icon('download', 18), 'Изтегли като PDF'));
}

function walkView(go, first) {
  const steps = walkSteps();
  const total = steps.length + 1;
  const root = h('div', { class: 'screen fwalk no-nav', 'data-page': 'fwalk' });
  const done = () => { try { localStorage.setItem('profitaxi.fwalk', '1'); } catch { /* */ } walkI = 0; };
  const draw = () => {
    const last = walkI >= steps.length;
    const s = steps[walkI];
    root.replaceChildren(
      h('div', { class: 'fw-top' },
        h('span', { class: 'fw-step' }, `${Math.min(walkI + 1, total)} от ${total}`),
        h('button', { class: 'link', onclick: () => { done(); go('/home'); } }, 'Пропусни')),
      h('div', { class: 'fw-bar' }, h('i', { style: { width: `${Math.round(((walkI + 1) / total) * 100)}%` } })),
      last
        ? h('div', { class: 'fw-end' },
          h('span', { class: 'fw-ic' }, icon('doc', 30)),
          h('h1', null, 'Това е разходката'),
          h('p', null, 'Има и подробно ръководство за всички функции на собственика, подредено в ', h('b', null, `${GROUPS.length} менюта`), ' – за да не търсиш кое къде е.'),
          h('div', { class: 'fw-where' }, icon('user', 18), h('span', null, 'Стои винаги в ', h('b', null, 'Профил → „Ръководство за собственика“'))),
          h('div', { class: 'fg-grid small' }, GROUPS.map((x) => h('a', { class: 'fg-tile', href: `#/fguide?g=${x.key}`, onclick: done }, h('span', { class: 'fg-ic' }, icon(x.icon, 18)), h('b', null, x.title)))))
        : h('div', { class: 'fw-body' },
          h('p', { class: 'fw-group' }, s.group.title),
          h('h1', null, s.title), pts(s.points), shot(s.img, true)),
      h('div', { class: 'fw-btns' },
        walkI > 0 ? h('button', { class: 'btn btn-ghost', onclick: () => { walkI--; draw(); scrollTo(0, 0); } }, icon('left', 18), 'Назад') : h('span'),
        last ? h('button', { class: 'btn btn-primary', onclick: () => { done(); go(first ? '/home' : '/fguide'); } }, first ? 'Към автопарка' : 'Към ръководството', icon('right', 18))
          : h('button', { class: 'btn btn-primary', onclick: () => { walkI++; draw(); scrollTo(0, 0); } }, 'Напред', icon('right', 18))));
  };
  draw();
  return root;
}
