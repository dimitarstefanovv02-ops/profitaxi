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

// Само снимки (без клипове): изброени формати, иначе iPhone показва и видеата
export const PHOTO_TYPES = 'image/jpeg,image/png,image/heic,image/heif,image/webp';

// Снимка от телефона → изрязване → по-малко JPEG изображение (за да се пази лесно)
// aspect: съотношение ширина/височина на рамката за изрязване (1 = квадрат). Без aspect – без изрязване.
export function pickImage({ max = 640, quality = 0.82, aspect = null, title = 'Изрежи снимката' } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: PHOTO_TYPES, style: { display: 'none' } });
    input.addEventListener('change', () => {
      const file = input.files?.[0]; input.remove();
      if (!file || (file.type && !file.type.startsWith('image/'))) return resolve(null);
      const img = new Image();
      img.onload = () => {
        if (!aspect) {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(img.src);
          return resolve(c.toDataURL('image/jpeg', quality));
        }
        cropImage(img, { aspect, max, quality, title }).then((r) => { URL.revokeObjectURL(img.src); resolve(r); });
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
    document.body.appendChild(input); input.click();
  });
}

// Изрязване: местиш снимката с пръст, увеличаваш с два пръста или с плъзгача
function cropImage(img, { aspect, max, quality, title }) {
  return new Promise((resolve) => {
    let done = false;
    openSheet((close) => {
      const W = Math.min(window.innerWidth - 48, 380), H = Math.round(W / aspect);
      const base = Math.max(W / img.width, H / img.height); // най-малкото, при което снимката покрива рамката
      let zoom = 1, x = 0, y = 0; // x, y – отместване на центъра в пиксели на екрана
      const pic = h('img', { src: img.src, alt: '', draggable: 'false', class: 'crop-img' });
      const frame = h('div', { class: 'crop-frame', style: { width: W + 'px', height: H + 'px' } }, pic);
      const clamp = () => {
        const s = base * zoom, mx = Math.max(0, (img.width * s - W) / 2), my = Math.max(0, (img.height * s - H) / 2);
        x = Math.min(mx, Math.max(-mx, x)); y = Math.min(my, Math.max(-my, y));
      };
      const draw = () => {
        clamp();
        const s = base * zoom;
        pic.style.width = img.width * s + 'px'; pic.style.height = img.height * s + 'px';
        pic.style.transform = `translate(${(W - img.width * s) / 2 + x}px, ${(H - img.height * s) / 2 + y}px)`;
      };
      const range = h('input', { type: 'range', min: '1', max: '4', step: '0.01', value: '1', class: 'crop-zoom', 'aria-label': 'Увеличение',
        oninput: (e) => { zoom = Number(e.target.value); draw(); } });
      // Местене и увеличаване с пръсти
      const pts = new Map(); let last = null, pinch = null;
      frame.addEventListener('pointerdown', (e) => { frame.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = { x: e.clientX, y: e.clientY }; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; } });
      frame.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; zoom = Math.min(4, Math.max(1, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)); range.value = String(zoom); }
        else if (last) { x += e.clientX - last.x; y += e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; }
        draw();
      });
      const up = (e) => { pts.delete(e.pointerId); pinch = null; const p = [...pts.values()][0]; last = p ? { ...p } : null; };
      frame.addEventListener('pointerup', up); frame.addEventListener('pointercancel', up);
      frame.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.min(4, Math.max(1, zoom * (e.deltaY < 0 ? 1.08 : 0.92))); range.value = String(zoom); draw(); }, { passive: false });
      const save = () => {
        const s = base * zoom;
        const sx = (img.width * s - W) / 2 - x, sy = (img.height * s - H) / 2 - y; // горен ляв ъгъл на рамката върху увеличената снимка
        const srcW = W / s, srcH = H / s;
        const outW = Math.round(Math.min(max, srcW, max * aspect)), outH = Math.round(outW / aspect);
        const c = document.createElement('canvas'); c.width = outW; c.height = outH;
        c.getContext('2d').drawImage(img, sx / s, sy / s, srcW, srcH, 0, 0, outW, outH);
        done = true; resolve(c.toDataURL('image/jpeg', quality)); close();
      };
      requestAnimationFrame(draw);
      return h('div', null, sheetHead(title, close, 'Премести с пръст, увеличи с два пръста'),
        h('div', { class: 'crop-wrap' }, frame),
        h('div', { class: 'crop-ctl' }, icon('search', 18), range),
        h('div', { class: 'row gap', style: { marginTop: '16px' } },
          h('button', { class: 'btn btn-ghost grow', type: 'button', onclick: close }, 'Отказ'),
          h('button', { class: 'btn btn-primary grow', type: 'button', onclick: save }, icon('check', 18), 'Готово')));
    }, { onClose: () => { if (!done) resolve(null); } });
  });
}
