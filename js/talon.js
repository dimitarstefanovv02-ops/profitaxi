// „Снимай талона“: от снимката на свидетелството за регистрация (талона) – марка, модел, година и номер.
// 1) С интернет и облак – AI на сървъра чете талона (най-точно). 2) Иначе – разпознаване на текста на телефона.
// Снимката не се пази никъде. Шофьорът винаги вижда и поправя полетата, преди да запази.
import { h, icon } from './util.js';
import { openSheet, sheetHead, toast } from './ui.js';
import * as store from './store.js';

const MAKES = ['ALFA ROMEO', 'AUDI', 'BMW', 'BYD', 'CHEVROLET', 'CITROEN', 'CUPRA', 'DACIA', 'FIAT', 'FORD', 'HONDA', 'HYUNDAI', 'JEEP', 'KIA', 'LEXUS', 'MAZDA', 'MERCEDES-BENZ', 'MG', 'MITSUBISHI', 'NISSAN', 'OPEL', 'PEUGEOT', 'RENAULT', 'SEAT', 'SKODA', 'SSANGYONG', 'SUBARU', 'SUZUKI', 'TESLA', 'TOYOTA', 'VOLKSWAGEN', 'VOLVO'];
const CYR = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X' };
const lat = (s) => s.replace(/[АВЕКМНОРСТУХ]/g, (c) => CYR[c]);
const title = (s) => s.toLowerCase().replace(/(^|[\s-])(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\bBmw\b/, 'BMW').replace(/\bMg\b/, 'MG').replace(/\bByd\b/, 'BYD').replace(/\bVw\b/, 'VW');

// Текст от разпознаването → полета. Търси D.1 (марка), D.3 (модел), B (първа регистрация), A (номер).
export function parseTalon(raw) {
  const text = lat(String(raw || '').toUpperCase()).replace(/[|]/g, ' ');
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const after = (re) => { for (const l of lines) { const m = l.match(re); if (m && m[1].trim().length > 1) return m[1].trim(); } return null; };
  let make = after(/\bD\s?[.,]?\s?1\b[.:,]?\s*([A-Z][A-Z0-9 \-]{1,24})/);
  let model = after(/\bD\s?[.,]?\s?3\b[.:,]?\s*([A-Z0-9][A-Z0-9 \-]{0,24})/);
  if (make) make = MAKES.find((x) => make.startsWith(x) || make.replace(/\s/g, '').startsWith(x.replace(/[\s-]/g, ''))) || make.split(/\s{2,}/)[0];
  if (!make) make = MAKES.find((x) => new RegExp(`\\b${x.replace('-', '[- ]?')}\\b`).test(text)) || null;
  if (make === 'VW') make = 'VOLKSWAGEN';
  let year = null;
  const b = text.match(/\bB\b[.:,]?\s*(\d{2})[./-](\d{2})[./-](\d{4})/);
  const now = new Date().getFullYear();
  if (b && +b[3] >= 1950 && +b[3] <= now) year = +b[3];
  if (!year) { const ys = [...text.matchAll(/\b\d{2}[./-]\d{2}[./-]((?:19|20)\d{2})\b/g)].map((m) => +m[1]).filter((y) => y >= 1950 && y <= now); if (ys.length) year = Math.min(...ys); }
  const p = text.match(/\b([ABEKMHOPCTYX]{1,2})\s?(\d{4})\s?([ABEKMHOPCTYX]{2})\b/);
  const plate = p ? `${p[1]} ${p[2]} ${p[3]}` : null;
  return { make: make ? title(make) : null, model: model ? title(model.replace(/\s{2,}.*/, '')) : null, year, plate };
}

let tess = null;
const loadTesseract = () => window.Tesseract ? Promise.resolve(window.Tesseract) : (tess ||= new Promise((res, rej) => {
  const sc = h('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/7.0.0/tesseract.min.js' });
  sc.onload = () => res(window.Tesseract); sc.onerror = () => { tess = null; rej(new Error('load')); };
  document.head.append(sc);
}));

// Снимката → JPEG до 1600 px (по-малко за качване, достатъчно за четене)
function shrink(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const im = new Image();
    im.onload = () => { const k = Math.min(1, 1600 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.85)); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
    im.src = url;
  });
}

export function scanTalon(onResult) {
  const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
  document.body.append(input);
  input.onchange = async () => {
    const file = input.files[0]; input.remove(); if (!file) return;
    if (!navigator.onLine) { toast('Четенето на талона иска интернет. Попълни полетата на ръка.', 'err'); return; }
    const status = h('p', { class: 'muted' }, 'Чета талона…');
    const closeSheet = openSheet((close) => h('div', { class: 'voice' }, sheetHead('Талон', close), h('div', { class: 'voice-mic scan' }, icon('doc', 34)), status));
    let r = null;
    try {
      const img = await shrink(file);
      if (store.live()) { const a = await store.driverCall('talon', { img, mock: window.__talonMock }).catch(() => null); if (a && !a.error && !a.fallback) r = a; }
      if (!r) {
        status.textContent = 'Чета талона на телефона… Първият път отнема до минута.';
        const T = await loadTesseract();
        const { data } = await T.recognize(img, 'bul+eng');
        r = parseTalon(data.text);
      }
    } catch { r = null; }
    closeSheet();
    if (!r || !(r.make || r.model || r.year || r.plate)) { toast('Не успях да прочета талона. Снимай го отблизо, на светло – или попълни на ръка.', 'err'); return; }
    const got = [r.make && r.model ? `${r.make} ${r.model}` : r.make || r.model, r.year, r.plate].filter(Boolean).join(' · ');
    toast(`Намерих: ${got}. Провери и запази.`);
    onResult(r);
  };
  input.click();
}
