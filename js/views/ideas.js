// „Предложи функция“: шофьорите пишат идеи и гласуват за чуждите. Админът ги вижда в „Развитие“.
import { h, fill, icon, cx } from '../util.js';
import * as store from '../store.js';
import { toast } from '../ui.js';

const STATUS = { new: 'Ново', planned: 'Ще го направим', done: 'Готово' };

export function ideasView({ user }) {
  const root = h('div', { class: 'screen', 'data-page': 'ideas' });
  const draw = () => {
    const list = store.ideas();
    const text = h('textarea', { class: 'input', rows: 3, maxlength: 300, placeholder: 'Какво би ти помогнало? Например: „Сканиране на касовата бележка“' });
    fill(root,
      h('div', { class: 'page-title' }, h('h1', null, 'Предложи функция')),
      h('p', { class: 'muted', style: { margin: '-6px 0 12px' } }, 'Напиши идея или гласувай за чужда. Най-гласуваните правим първи.'),
      h('section', { class: 'card form' }, text,
        h('button', { class: 'btn btn-primary btn-lg', onclick: () => { if (!text.value.trim()) return; store.submitIdea(text.value); toast('Благодарим! Идеята е изпратена.'); draw(); } }, icon('sparkle', 18), 'Изпрати идеята')),
      h('h2', { class: 'section-title' }, 'Идеи на колегите'),
      h('div', { class: 'idea-list' }, list.map((i) => {
        const mine = i.votes.includes(user.id);
        return h('div', { class: 'card idea' },
          h('button', { class: cx('idea-vote', mine && 'on'), 'aria-pressed': String(mine), onclick: () => { store.voteIdea(i.id); draw(); } }, h('span', { class: 'flip' }, icon('down', 16)), h('b', null, String(i.votes.length))),
          h('div', { class: 'grow' }, h('b', null, i.text), i.status !== 'new' && h('span', { class: cx('chip', i.status === 'done' ? 'good' : 'warn') }, STATUS[i.status])));
      })));
  };
  draw();
  return root;
}
