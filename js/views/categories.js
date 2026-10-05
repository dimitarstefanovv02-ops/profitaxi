// Категории разходи: скриване на вградените и добавяне/махане на собствени

import { h, fill, icon, cx } from '../util.js';
import * as store from '../store.js';
import { EXPENSE_CATS, COST_CATS } from '../constants.js';
import { openSheet, sheetHead, toast, segmented } from '../ui.js';

export function openCategories() {
  let tab = 'shift';
  openSheet((close) => {
    const body = h('div');
    const draw = () => {
      const p = store.getProfile();
      const hidden = new Set(p.hiddenCats || []);
      const rent = p.carType === 'rent';
      const builtIn = tab === 'shift'
        ? Object.entries(EXPENSE_CATS).filter(([k]) => k !== 'other').map(([k, v]) => ({ key: 's:' + k, ...v }))
        : Object.entries(COST_CATS).filter(([k, v]) => !v.system && k !== 'other' && !(rent && v.owner)).map(([k, v]) => ({ key: 'f:' + k, ...v }));
      const custom = (p.customCats || []).filter((c) => c.kind === 'both' || c.kind === tab || (tab === 'shift' ? c.kind !== 'fixed' : c.kind !== 'shift'));
      const name = h('input', { class: 'input', placeholder: tab === 'shift' ? 'напр. Магистрала, Кафе за клиенти' : 'напр. Гараж, Абонамент за навигация' });
      const add = () => {
        const r = store.addCustomCat(name.value, tab === 'shift' ? 'shift' : 'fixed');
        if (r.error) { toast(r.error, 'err'); return; }
        toast(`„${r.cat.label}“ е добавена`); draw();
      };
      fill(body,
        segmented({ shift: 'По време на смяна', fixed: 'Постоянни' }, tab, (t) => { tab = t; draw(); }, { page: true }),
        h('p', { class: 'muted small', style: { margin: '12px 0 6px' } }, tab === 'shift' ? 'Бутоните, които виждаш в отчета за смяна. Скрий тези, които не ползваш.' : 'Видовете постоянни разходи, от които избираш при добавяне.'),
        h('div', { class: 'cat-list' },
          builtIn.map((c) => {
            const on = !hidden.has(c.key);
            return h('div', { class: 'cat-row', style: { '--rc': c.color } },
              h('span', { class: 'cost-ic' }, icon(c.icon, 18)), h('span', { class: 'grow' }, c.label),
              h('button', { class: cx('toggle', on && 'on'), role: 'switch', 'aria-checked': String(on), 'aria-label': c.label, onclick: () => { store.toggleCat(c.key); draw(); } }));
          }),
          custom.map((c) => h('div', { class: 'cat-row', style: { '--rc': 'var(--c-pink)' } },
            h('span', { class: 'cost-ic' }, icon('tag', 18)), h('span', { class: 'grow' }, c.label, h('span', { class: 'chip', style: { marginLeft: '8px', padding: '2px 8px' } }, 'твоя')),
            h('button', { class: 'icon-btn plain', 'aria-label': 'Премахни ' + c.label, onclick: () => { store.removeCustomCat(c.id); toast('Категорията е премахната'); draw(); } }, icon('trash', 18))))),
        h('div', { class: 'row gap', style: { marginTop: '14px' } }, name, h('button', { class: 'btn btn-page', onclick: add }, icon('plus', 18), 'Добави')));
    };
    draw();
    return h('div', null, sheetHead('Категории разходи', close, 'Добавяй свои и скривай ненужните'), body);
  }, { tall: true });
}

// Снимка от телефона → по-малко JPEG изображение (за да се пази лесно)
export function pickImage({ max = 640, quality = 0.82 } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    input.addEventListener('change', () => {
      const file = input.files?.[0]; input.remove();
      if (!file) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
    document.body.appendChild(input); input.click();
  });
}
