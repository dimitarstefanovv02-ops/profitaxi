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

// Най-честите модели (таксита) – за да намерим модела и когато полето D.3 не се чете или е на друг ред
const MODELS = {
  TOYOTA: ['COROLLA', 'AURIS', 'PRIUS', 'C-HR', 'RAV4', 'RAV 4', 'CAMRY', 'YARIS', 'AVENSIS'], HYUNDAI: ['ELANTRA', 'I30', 'I40', 'IONIQ', 'TUCSON', 'KONA', 'SONATA', 'ACCENT', 'I20', 'BAYON'],
  SKODA: ['OCTAVIA', 'SUPERB', 'FABIA', 'RAPID', 'SCALA', 'KAROQ', 'KODIAQ', 'ENYAQ'], DACIA: ['LOGAN', 'SANDERO', 'DUSTER', 'JOGGER', 'LODGY', 'SPRING'],
  KIA: ['CEED', 'NIRO', 'SPORTAGE', 'OPTIMA', 'RIO', 'K5', 'XCEED', 'CARENS', 'EV6'], VOLKSWAGEN: ['PASSAT', 'GOLF', 'TOURAN', 'JETTA', 'CADDY', 'POLO', 'TIGUAN', 'SHARAN', 'ID.3', 'ID.4'],
  'MERCEDES-BENZ': ['E 220', 'E 200', 'C 200', 'C 220', 'B 180', 'B 200', 'VITO', 'V 250', 'E-CLASS', 'C-CLASS'], RENAULT: ['MEGANE', 'CLIO', 'CAPTUR', 'FLUENCE', 'TALISMAN', 'KANGOO', 'SCENIC', 'ZOE'],
  OPEL: ['ASTRA', 'INSIGNIA', 'ZAFIRA', 'CORSA', 'MERIVA', 'MOKKA'], FORD: ['FOCUS', 'MONDEO', 'GALAXY', 'S-MAX', 'C-MAX', 'FIESTA', 'KUGA'], PEUGEOT: ['308', '508', '3008', '2008', '208', '5008', 'RIFTER'],
  CITROEN: ['C4', 'C5', 'C-ELYSEE', 'BERLINGO', 'C3'], CHEVROLET: ['CRUZE', 'AVEO', 'LACETTI', 'CAPTIVA'], TESLA: ['MODEL 3', 'MODEL Y', 'MODEL S'], NISSAN: ['QASHQAI', 'LEAF', 'X-TRAIL', 'NOTE'],
  HONDA: ['CIVIC', 'ACCORD', 'CR-V', 'JAZZ'], MAZDA: ['MAZDA3', 'MAZDA6', 'CX-5', '6', '3'], BYD: ['ATTO 3', 'SEAL', 'DOLPHIN'], SEAT: ['LEON', 'IBIZA', 'TOLEDO', 'ALHAMBRA'],
  FIAT: ['TIPO', 'DOBLO', 'PUNTO', '500'], SUZUKI: ['VITARA', 'SWIFT', 'SX4'], MG: ['MG5', 'ZS', 'MG4'], LEXUS: ['CT 200H', 'IS 300H', 'ES 300H', 'NX 300H'], VOLVO: ['S60', 'S80', 'V60', 'XC60', 'V70'],
};
const ALL_MODELS = Object.values(MODELS).flat().filter((m) => /[A-Z]{3}/.test(m)).sort((a, b) => b.length - a.length);
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]/g, '[\\s-]?');
// Познат модел в целия текст: първо моделите на марката (и с цифри, напр. 308), после всички с букви
const findModel = (text, make) => {
  for (const m of [...(MODELS[make] || []).slice().sort((a, b) => b.length - a.length), ...ALL_MODELS]) {
    if (/^\d{1,2}$/.test(m)) continue;
    const x = text.match(new RegExp(`(^|[^A-Z0-9./])(${esc(m)})([^A-Z0-9./]|$)`, 'm'));
    if (x) return x[2];
  }
  return null;
};
// Етикет на поле: D.1 / D.3 – OCR често чете D като 0, О или Д, а 3 като З
const LBL = (n) => { const d = n === 3 ? '[3З]' : '[1lI|]'; return `(?:(?:^|\\s)[DД0O]\\s?[.,·:]\\s?${d}|(?:^|\\s)[DД]\\s?${d}|^[0O]\\s?${d}(?![.,]?\\d))(?![\\d/])[.:,]?`; };

// Текст от разпознаването → полета. Търси D.1 (марка), D.3 (модел), B (първа регистрация), A (номер).
export function parseTalon(raw) {
  const text = lat(String(raw || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')).replace(/[|]/g, ' ').replace(/З(?=\d)|(?<=\d)З/g, '3');
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  // до следващото поле на същия ред (напр. „508 B 12.03.2008“ → „508“)
  const cut = (v) => v.replace(/\s+(?:[A-Z]\s?[.,]\s?\d(?:[.,]\d)?|[A-Z]\d?)(?:\s.*|[.:,].*|$)/, '').trim();
  // стойността е след етикета на същия ред – или на следващия, ако редът свършва с етикета
  const field = (n, valRe) => {
    const re = new RegExp(LBL(n) + `\\s*(${valRe})?`);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re); if (!m) continue;
      if (m[1] && m[1].trim().length > 1) return cut(m[1]);
      const nx = (lines[i + 1] || '').match(new RegExp(`^(${valRe})`)); if (nx && nx[1].trim().length > 1) return cut(nx[1]);
    }
    return null;
  };
  let make = field(1, '[A-Z][A-Z0-9 \\-]{1,24}');
  let model = field(3, '[A-Z0-9][A-Z0-9 .\\-]{0,24}');
  if (make) make = MAKES.find((x) => make.startsWith(x) || make.replace(/\s/g, '').startsWith(x.replace(/[\s-]/g, ''))) || (make.startsWith('VW') ? 'VOLKSWAGEN' : make.startsWith('MERCEDES') ? 'MERCEDES-BENZ' : make.split(/\s{2,}/)[0]);
  if (!make || !MAKES.includes(make)) make = MAKES.find((x) => new RegExp(`(^|[^A-Z])${esc(x)}([^A-Z]|$)`).test(text)) || (/\bVW\b/.test(text) ? 'VOLKSWAGEN' : make);
  if (model) {
    model = model.replace(/\s{2,}.*/, '').trim();
    // ако в полето е влязло нещо друго (етикет, марката), търсим познат модел
    if (model.length < 2 || /^[A-Z]\s?[.,]?\s?\d$/.test(model) || (make && model.startsWith(make))) model = null;
  }
  const known = findModel(text, make);
  if (!model || (known && !model.includes(known.replace(/[\s-]/g, '')) && !model.replace(/[\s-]/g, '').includes(known.replace(/[\s-]/g, '')))) model = known || model;
  if (!make && model) make = Object.keys(MODELS).find((k) => MODELS[k].some((m) => m.replace(/[\s-]/g, '') === model.replace(/[\s-]/g, '').split(/\s/)[0] || model.replace(/[\s-]/g, '').startsWith(m.replace(/[\s-]/g, '')))) || null;
  let year = null;
  const b = text.match(/(?:^|\s)B\b[.:,]?\s*(\d{2})[./-](\d{2})[./-](\d{4})/);
  const now = new Date().getFullYear();
  if (b && +b[3] >= 1950 && +b[3] <= now) year = +b[3];
  if (!year) { const ys = [...text.matchAll(/\b\d{2}[./-]\d{2}[./-]((?:19|20)\d{2})\b/g)].map((m) => +m[1]).filter((y) => y >= 1950 && y <= now); if (ys.length) year = Math.min(...ys); }
  const p = text.match(/\b([ABEKMHOPCTYX]{1,2})\s?(\d{4})\s?([ABEKMHOPCTYX]{2})\b/);
  const plate = p ? `${p[1]} ${p[2]} ${p[3]}` : null;
  return { make: make ? title(make) : null, model: model ? title(model) : null, year, plate };
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
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
    im.src = url;
  });
}

// Сиво и по-силен контраст – Tesseract чете по-добре печатните букви на талона
function contrast(src) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height); const p = d.data;
  for (let i = 0; i < p.length; i += 4) { const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; const v = Math.max(0, Math.min(255, (g - 128) * 1.6 + 128)); p[i] = p[i + 1] = p[i + 2] = v; }
  x.putImageData(d, 0, 0); return c;
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
      const cv = await shrink(file);
      const img = cv.toDataURL('image/jpeg', 0.85);
      if (store.live()) { const a = await store.driverCall('talon', { img, mock: window.__talonMock }).catch(() => null); if (a && !a.error && !a.fallback) r = a; }
      if (!r || !r.model) {
        status.textContent = 'Чета талона на телефона… Първият път отнема до минута.';
        const T = await loadTesseract();
        const { data } = await T.recognize(contrast(cv), 'bul+eng');
        const loc = parseTalon(data.text);
        r = r ? { ...loc, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v)) } : loc;
      }
    } catch { r = null; }
    closeSheet();
    if (!r || !(r.make || r.model || r.year || r.plate)) { toast('Не успях да прочета талона. Снимай го отблизо, на светло – или попълни на ръка.', 'err'); return; }
    const got = [r.make && r.model ? `${r.make} ${r.model}` : r.make || r.model, r.year, r.plate].filter(Boolean).join(' · ');
    toast(r.model ? `Намерих: ${got}. Провери и запази.` : `Намерих: ${got}. Моделът не се чете – допиши го.`, r.model ? undefined : 'err');
    onResult(r);
  };
  input.click();
}
