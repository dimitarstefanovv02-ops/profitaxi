// „Пиши ни“: шофьорът пише на поддръжката и вижда отговорите тук. Админът отговаря от „Съобщения → Входящи“.
import { h, fill, icon, cx, fmtDate, isoToDateStr } from '../util.js';
import * as store from '../store.js';
import { toast, segmented } from '../ui.js';

const draft = { topic: 'shift', text: '' };
const when = (iso) => `${fmtDate(isoToDateStr(iso))}, ${new Date(iso).toTimeString().slice(0, 5)}`;

export function helpView() {
  const root = h('div', { class: 'screen', 'data-page': 'help' });
  const draw = () => {
    const list = store.myTickets();
    const text = h('textarea', { class: 'input', rows: 4, maxlength: 600, placeholder: 'Напиши какво се случи или какво те интересува', oninput: (e) => { draft.text = e.target.value; } });
    text.value = draft.text;
    fill(root,
      h('div', { class: 'page-title' }, h('h1', null, 'Пиши ни')),
      h('p', { class: 'muted', style: { margin: '-6px 0 12px' } }, 'Отговаряме тук, обикновено до няколко часа.'),
      h('section', { class: 'card form' },
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'За какво е'), segmented(store.TICKET_TOPICS, draft.topic, (t) => { draft.topic = t; draw(); }, { small: true, wrap: true })),
        text,
        h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
          const r = store.sendTicket({ topic: draft.topic, text: draft.text });
          if (r.error) { toast(r.error, 'err'); return; }
          draft.text = ''; toast('Изпратено! Ще ти отговорим тук.'); draw();
        } }, icon('bell', 18), 'Изпрати')),
      list.length > 0 && h('h2', { class: 'section-title' }, 'Твоите въпроси'),
      list.map((t) => {
        const reply = h('input', { class: 'input', placeholder: 'Напиши още…', maxlength: 600 });
        return h('section', { class: 'card ticket' },
          h('div', { class: 'row between' }, h('b', null, store.TICKET_TOPICS[t.topic]), h('span', { class: cx('chip', t.status === 'open' ? 'warn' : 'good') }, t.status === 'open' ? 'Отворен' : 'Решен')),
          h('div', { class: 'thread' }, t.thread.map((m) => h('div', { class: cx('bubble', m.by === 'admin' ? 'them' : 'me') }, h('p', null, m.text), h('small', null, `${m.by === 'admin' ? 'ProfiTaxi' : 'Ти'} · ${when(m.at)}`)))),
          h('div', { class: 'row gap', style: { marginTop: '10px' } }, reply,
            h('button', { class: 'btn btn-ghost', onclick: () => { if (!reply.value.trim()) return; store.replyMyTicket(t.id, reply.value); toast('Изпратено'); draw(); } }, 'Изпрати')));
      }));
  };
  draw();
  setTimeout(() => store.readMyTickets(), 400);
  return root;
}
