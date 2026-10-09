// Избор на дата и час – еднакъв на всеки телефон (вместо системните колелца).
// Всяко <input type="date|time|datetime-local"> в приложението и админа се заменя
// автоматично с бутон; натискането отваря календар или часовник. Стойността и
// събитията input/change остават същите, така че екраните не се променят.

const WD = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WD_HEAD = ['П', 'В', 'С', 'Ч', 'П', 'С', 'Н'];
const MON = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
const MON_S = ['яну', 'фев', 'мар', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт', 'ное', 'дек'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const parseHm = (s) => { const m = /(\d{1,2}):(\d{2})/.exec(s || ''); return m ? { h: +m[1], m: +m[2] } : null; };

const ICON = {
  left: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>',
  kbd: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 14h10"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  cal: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  time: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
};
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const btn = (cls, html, on, label) => { const b = el('button', cls, html); b.type = 'button'; if (label) b.setAttribute('aria-label', label); if (on) b.addEventListener('click', on); return b; };

// Текстът на бутона: „пт, 9 окт 2026“, „10:05“ или „пт, 9 окт · 10:05“
export function fmtValue(kind, v) {
  if (!v) return '';
  if (kind === 'time') { const t = parseHm(v); return t ? `${pad(t.h)}:${pad(t.m)}` : ''; }
  const d = parseYmd(v); if (!d) return '';
  const now = new Date();
  const date = `${WD[d.getDay()]}, ${d.getDate()} ${MON_S[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : ''}`;
  if (kind === 'date') return date;
  const t = parseHm(v.slice(11)); return t ? `${date} · ${pad(t.h)}:${pad(t.m)}` : date;
}

// ---------- Прозорецът ----------
function dialog(build) {
  const wrap = el('div', 'pk-wrap');
  const back = el('div', 'pk-back');
  const card = el('div', 'pk'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
  wrap.append(back, card);
  let done = false;
  const close = () => { if (done) return; done = true; wrap.classList.remove('open'); document.removeEventListener('keydown', onKey, true); setTimeout(() => wrap.remove(), 180); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  back.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(wrap);
  build(card, close);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  return close;
}
const footer = (left, onCancel, okLabel, onOk) => {
  const f = el('div', 'pk-foot');
  f.append(left || el('span'), el('span', 'pk-grow'), btn('pk-txt', 'Отказ', onCancel), btn('pk-txt pk-ok', okLabel, onOk));
  return f;
};

// ---------- Календар ----------
function dateView(card, { title, value, min, max, okLabel, onOk, onCancel, onClear }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let sel = parseYmd(value) || (parseYmd(min) && parseYmd(min) > today ? parseYmd(min) : today);
  let view = new Date(sel.getFullYear(), sel.getMonth(), 1);
  let mode = 'days';
  const minD = parseYmd(min), maxD = parseYmd(max);
  const ok = (d) => (!minD || d >= minD) && (!maxD || d <= maxD);
  const draw = () => {
    card.replaceChildren();
    card.append(el('div', 'pk-title', title || 'Избери дата'));
    card.append(el('div', 'pk-big', `${WD[sel.getDay()]}, ${sel.getDate()}.${pad(sel.getMonth() + 1)}`));
    const nav = el('div', 'pk-nav');
    const my = btn('pk-my', `<b>${MON[view.getMonth()]}</b> ${view.getFullYear()} г. ${ICON.down}`, () => { mode = mode === 'days' ? 'months' : 'days'; draw(); }, 'Избери месец и година');
    const step = (n) => () => { if (mode === 'days') view = new Date(view.getFullYear(), view.getMonth() + n, 1); else view = new Date(view.getFullYear() + n, view.getMonth(), 1); draw(); };
    nav.append(my, el('span', 'pk-grow'), btn('pk-arrow', ICON.left, step(-1), mode === 'days' ? 'Предишен месец' : 'Предишна година'), btn('pk-arrow', ICON.right, step(1), mode === 'days' ? 'Следващ месец' : 'Следваща година'));
    card.append(nav);
    if (mode === 'days') {
      const g = el('div', 'pk-grid');
      WD_HEAD.forEach((w) => g.append(el('span', 'pk-wd', w)));
      const lead = (view.getDay() + 6) % 7;
      for (let i = 0; i < lead; i++) g.append(el('span'));
      const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      for (let n = 1; n <= days; n++) {
        const d = new Date(view.getFullYear(), view.getMonth(), n);
        const b = btn('pk-day', String(n), () => { sel = d; draw(); }, `${n} ${MON[d.getMonth()]}`);
        if (+d === +sel) b.classList.add('on');
        if (+d === +today) b.classList.add('today');
        if (!ok(d)) { b.disabled = true; }
        g.append(b);
      }
      card.append(g);
    } else {
      const g = el('div', 'pk-months');
      MON.forEach((m, i) => {
        const b = btn('pk-mon', m, () => { view = new Date(view.getFullYear(), i, 1); mode = 'days'; draw(); });
        if (i === view.getMonth()) b.classList.add('on');
        g.append(b);
      });
      card.append(g);
    }
    const left = el('div', 'pk-left');
    if (ok(today)) left.append(btn('pk-txt', 'Днес', () => { sel = new Date(today); view = new Date(today.getFullYear(), today.getMonth(), 1); mode = 'days'; draw(); }));
    if (onClear) left.append(btn('pk-txt pk-muted', 'Изчисти', onClear));
    card.append(footer(left, onCancel, okLabel || 'Добре', () => onOk(ymd(sel))));
  };
  draw();
}

// ---------- Часовник ----------
function timeView(card, { title, value, sub, onOk, onCancel, onBack }) {
  const now = new Date();
  const t = parseHm(value) || { h: now.getHours(), m: Math.round(now.getMinutes() / 5) * 5 % 60 };
  let H = t.h, M = t.m, mode = 'h', kbd = false;
  const R_OUT = 112, R_IN = 74, C = 140;
  const draw = () => {
    card.replaceChildren();
    card.append(el('div', 'pk-title', title || 'Избери час'));
    if (sub) card.append(el('div', 'pk-sub', sub));
    const head = el('div', 'pk-thead');
    if (kbd) {
      const hi = el('input', 'pk-tin'); hi.inputMode = 'numeric'; hi.maxLength = 2; hi.value = pad(H); hi.setAttribute('aria-label', 'Час');
      const mi = el('input', 'pk-tin'); mi.inputMode = 'numeric'; mi.maxLength = 2; mi.value = pad(M); mi.setAttribute('aria-label', 'Минути');
      hi.addEventListener('input', () => { const v = parseInt(hi.value, 10); if (v >= 0 && v <= 23) H = v; if (hi.value.length === 2) mi.focus(); });
      mi.addEventListener('input', () => { const v = parseInt(mi.value, 10); if (v >= 0 && v <= 59) M = v; });
      [hi, mi].forEach((x) => x.addEventListener('focus', () => x.select()));
      head.append(hi, el('span', 'pk-colon', ':'), mi);
      card.append(head, el('div', 'pk-hint', 'Час от 0 до 23, минути от 0 до 59'));
      setTimeout(() => hi.focus(), 50);
    } else {
      const hb = btn('pk-tbox' + (mode === 'h' ? ' on' : ''), pad(H), () => { mode = 'h'; draw(); }, 'Час');
      const mb = btn('pk-tbox' + (mode === 'm' ? ' on' : ''), pad(M), () => { mode = 'm'; draw(); }, 'Минути');
      head.append(hb, el('span', 'pk-colon', ':'), mb);
      card.append(head, dial());
    }
    const left = el('div', 'pk-left');
    left.append(btn('pk-icon', kbd ? ICON.clock : ICON.kbd, () => { kbd = !kbd; draw(); }, kbd ? 'Часовник' : 'Въведи с цифри'));
    if (onBack) left.append(btn('pk-txt pk-muted', 'Дата', onBack));
    card.append(footer(left, onCancel, 'Добре', () => onOk(`${pad(H)}:${pad(M)}`)));
  };
  const pos = (a, r) => ({ x: (C + r * Math.sin(a)) / (2 * C) * 100, y: (C - r * Math.cos(a)) / (2 * C) * 100 }); // в % от циферблата
  function dial() {
    const d = el('div', 'pk-dial');
    const hand = el('div', 'pk-hand'), knob = el('div', 'pk-knob'), dot = el('div', 'pk-center');
    d.append(hand, knob, dot);
    const nums = [];
    if (mode === 'h') {
      for (let i = 0; i < 12; i++) nums.push({ v: i, r: R_OUT, a: i / 12 * 2 * Math.PI, t: i === 0 ? '00' : String(i) });
      for (let i = 12; i < 24; i++) nums.push({ v: i, r: R_IN, a: (i - 12) / 12 * 2 * Math.PI, t: String(i), inner: true });
    } else {
      for (let i = 0; i < 60; i += 5) nums.push({ v: i, r: R_OUT, a: i / 60 * 2 * Math.PI, t: pad(i) });
    }
    nums.forEach((n) => { const p = pos(n.a, n.r); const s = el('span', 'pk-num' + (n.inner ? ' in' : ''), n.t); s.style.left = p.x + '%'; s.style.top = p.y + '%'; s.dataset.v = n.v; d.append(s); });
    const place = () => {
      const v = mode === 'h' ? H : M;
      const inner = mode === 'h' && (H === 0 ? false : H >= 12);
      const a = mode === 'h' ? (v % 12) / 12 * 2 * Math.PI : v / 60 * 2 * Math.PI;
      const r = inner ? R_IN : R_OUT;
      const p = pos(a, r);
      knob.style.left = p.x + '%'; knob.style.top = p.y + '%';
      hand.style.height = (r / (2 * C) * 100) + '%'; hand.style.transform = `rotate(${a}rad)`;
      d.querySelectorAll('.pk-num').forEach((s) => s.classList.toggle('on', +s.dataset.v === v));
      card.querySelectorAll('.pk-tbox')[mode === 'h' ? 0 : 1].textContent = pad(v);
    };
    const pick = (e) => {
      const r = d.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
      const scale = r.width / (C * 2);
      let a = Math.atan2(x, -y); if (a < 0) a += 2 * Math.PI;
      const dist = Math.hypot(x, y) / scale;
      if (mode === 'h') {
        let h = Math.round(a / (2 * Math.PI) * 12) % 12;
        if (dist < (R_IN + R_OUT) / 2) h = h === 0 ? 12 : h + 12;
        H = h === 24 ? 12 : h;
      } else {
        M = Math.round(a / (2 * Math.PI) * 60) % 60;
      }
      place();
    };
    let dragging = false;
    d.addEventListener('pointerdown', (e) => { dragging = true; d.setPointerCapture(e.pointerId); pick(e); e.preventDefault(); });
    d.addEventListener('pointermove', (e) => { if (dragging) pick(e); });
    d.addEventListener('pointerup', (e) => {
      if (!dragging) return; dragging = false; pick(e);
      if (mode === 'h') setTimeout(() => { mode = 'm'; draw(); }, 180);
    });
    d.addEventListener('pointercancel', () => { dragging = false; });
    requestAnimationFrame(place);
    return d;
  }
  draw();
}

// Отваря избора за дадено поле и връща стойността в него
export function openPicker(input) {
  const kind = input.dataset.pkKind;
  const title = input.dataset.pkTitle;
  const val = input.value;
  const commit = (v) => {
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const optional = !input.required && kind === 'date' && !!val;
  dialog((card, close) => {
    if (kind === 'time') {
      timeView(card, { title, value: val, onCancel: close, onOk: (t) => { commit(t); close(); } });
    } else if (kind === 'date') {
      dateView(card, { title, value: val, min: input.min, max: input.max, onCancel: close, onOk: (d) => { commit(d); close(); },
        onClear: optional ? () => { commit(''); close(); } : null });
    } else {
      let date = val ? val.slice(0, 10) : ymd(new Date());
      const time = val ? val.slice(11, 16) : '';
      const showDate = () => dateView(card, { title: title || 'Избери дата', value: date, min: input.min?.slice(0, 10), max: input.max?.slice(0, 10), okLabel: 'Напред', onCancel: close,
        onOk: (d) => { date = d; showTime(); } });
      const showTime = () => timeView(card, { title: title || 'Избери час', sub: fmtValue('date', date), value: time, onCancel: close, onBack: showDate,
        onOk: (t) => { commit(`${date}T${t}`); close(); } });
      showDate();
    }
  });
}

// ---------- Заменяне на системните полета ----------
const KINDS = { date: 'date', time: 'time', 'datetime-local': 'datetime' };
const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
function labelFor(input) {
  if (input.getAttribute('aria-label')) return input.getAttribute('aria-label');
  const lab = input.closest('label');
  const t = lab && [...lab.querySelectorAll('.field-label, b, span')].map((x) => x.textContent.trim()).find((x) => x && !x.includes('\n') && x.length < 40);
  if (t) return t.replace('*', '').trim();
  const field = input.closest('.field');
  return (field?.querySelector('.field-label')?.textContent || '').replace('*', '').trim();
}
export function enhance(input) {
  const kind = KINDS[input.type];
  if (!kind || input.dataset.pk) return;
  input.dataset.pk = '1';
  input.dataset.pkKind = kind;
  const b = btn(`${input.className || 'input'} pk-field`, '', (e) => { e.preventDefault(); e.stopPropagation(); if (!input.disabled) openPicker(input); });
  const upd = () => {
    const t = fmtValue(kind, input.value);
    b.innerHTML = `<span class="pk-fi">${kind === 'time' ? ICON.time : ICON.cal}</span><span class="pk-fv${t ? '' : ' empty'}">${t || (kind === 'time' ? 'Избери час' : 'Избери дата')}</span>`;
    b.disabled = input.disabled;
  };
  Object.defineProperty(input, 'value', { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); upd(); } });
  input.addEventListener('change', upd);
  input.classList.add('pk-hidden');
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  input.after(b);
  requestAnimationFrame(() => { input.dataset.pkTitle = labelFor(input); b.setAttribute('aria-label', `${input.dataset.pkTitle || (kind === 'time' ? 'Час' : 'Дата')}: ${fmtValue(kind, input.value) || 'не е избрано'}`); });
  upd();
}
export function enhanceAll(root = document) {
  root.querySelectorAll?.('input[type="date"], input[type="time"], input[type="datetime-local"]').forEach(enhance);
}
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const start = () => {
    enhanceAll();
    new MutationObserver((list) => {
      for (const m of list) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.('input')) enhance(n); else enhanceAll(n);
      }
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}
