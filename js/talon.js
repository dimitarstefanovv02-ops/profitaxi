// „Снимай талона“: от снимката на свидетелството за регистрация (талона) – марка, модел, година и номер.
// 1) С интернет и облак – AI на сървъра чете талона (най-точно). 2) Иначе – разпознаване на текста на телефона.
// Снимката не се пази никъде. Шофьорът винаги вижда и поправя полетата, преди да запази.
import { h, icon } from './util.js';
import { openSheet, sheetHead, toast } from './ui.js';
import * as store from './store.js';

// Талонът (свидетелство за регистрация, част I) по официалната легенда:
//   (A) рег. номер · (D.1) марка (модел), напр. „MERCEDES E 220 D“ · (B) дата на първа регистрация → годината.
// D.1 е на два реда – на кирилица и на латиница; взимаме латинския.
const MAKES = ['ALFA ROMEO', 'AUDI', 'BMW', 'BYD', 'CHEVROLET', 'CITROEN', 'CUPRA', 'DACIA', 'FIAT', 'FORD', 'HONDA', 'HYUNDAI', 'JEEP', 'KIA', 'LEXUS', 'MAZDA', 'MERCEDES', 'MG', 'MITSUBISHI', 'NISSAN', 'OPEL', 'PEUGEOT', 'RENAULT', 'SEAT', 'SKODA', 'SSANGYONG', 'SUBARU', 'SUZUKI', 'TESLA', 'TOYOTA', 'VOLKSWAGEN', 'VOLVO'];
const CYR_MAKES = { МЕРЦЕДЕС: 'MERCEDES', ТОЙОТА: 'TOYOTA', ХЮНДАЙ: 'HYUNDAI', ХЮНДАИ: 'HYUNDAI', ШКОДА: 'SKODA', ДАЧИЯ: 'DACIA', КИА: 'KIA', ФОЛКСВАГЕН: 'VOLKSWAGEN', ПЕЖО: 'PEUGEOT', РЕНО: 'RENAULT', ОПЕЛ: 'OPEL', ФОРД: 'FORD',
  ШЕВРОЛЕТ: 'CHEVROLET', СИТРОЕН: 'CITROEN', НИСАН: 'NISSAN', ХОНДА: 'HONDA', МАЗДА: 'MAZDA', ТЕСЛА: 'TESLA', БМВ: 'BMW', АУДИ: 'AUDI', ВОЛВО: 'VOLVO', СЕАТ: 'SEAT', ФИАТ: 'FIAT', СУЗУКИ: 'SUZUKI', ЛЕКСУС: 'LEXUS', СУБАРУ: 'SUBARU', МИЦУБИШИ: 'MITSUBISHI', БИД: 'BYD' };
// Първите 3 знака на номера на рамата (E) → марката, ако D.1 не се чете
const WMI = { W1K: 'MERCEDES', W1N: 'MERCEDES', WDD: 'MERCEDES', WDB: 'MERCEDES', WDC: 'MERCEDES', JTD: 'TOYOTA', JTN: 'TOYOTA', JTM: 'TOYOTA', SB1: 'TOYOTA', NMT: 'TOYOTA', VNK: 'TOYOTA', KMH: 'HYUNDAI', TMA: 'HYUNDAI', NLH: 'HYUNDAI',
  TMB: 'SKODA', UU1: 'DACIA', KNA: 'KIA', KNE: 'KIA', U5Y: 'KIA', WVW: 'VOLKSWAGEN', WV1: 'VOLKSWAGEN', WV2: 'VOLKSWAGEN', VF3: 'PEUGEOT', VR3: 'PEUGEOT', VF1: 'RENAULT', W0L: 'OPEL', W0V: 'OPEL', WF0: 'FORD', VF7: 'CITROEN', VR7: 'CITROEN',
  '5YJ': 'TESLA', LRW: 'TESLA', XP7: 'TESLA', SJN: 'NISSAN', JN1: 'NISSAN', JMZ: 'MAZDA', VSS: 'SEAT', ZFA: 'FIAT', WBA: 'BMW', WAU: 'AUDI', YV1: 'VOLVO', LGX: 'BYD', KL1: 'CHEVROLET', TSM: 'SUZUKI', JTH: 'LEXUS', SHH: 'HONDA', JHM: 'HONDA' };
const CYR = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X' };
const lat = (s) => s.replace(/[АВЕКМНОРСТУХ]/g, (c) => CYR[c]);
const TR = { А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ж: 'ZH', З: 'Z', И: 'I', Й: 'Y', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'H', Ц: 'TS', Ч: 'CH', Ш: 'SH', Щ: 'SHT', Ъ: 'A', Ь: 'Y', Ю: 'YU', Я: 'YA' };
const translit = (s) => s.replace(/[А-Я]/g, (c) => TR[c] || '');
const title = (s) => s.toLowerCase().replace(/(^|[\s-])(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\bBmw\b/, 'BMW').replace(/\bMg\b/, 'MG').replace(/\bByd\b/, 'BYD').replace(/\bVw\b/, 'VW')
  .replace(/\b([A-Z]) (\d{3})( ?[A-Z]{1,3})?\b/gi, (m) => m.toUpperCase()); // E 220 D, C 200 CDI
const latinShare = (s) => { const l = (s.match(/[A-Z]/g) || []).length, c = (s.match(/[А-Я]/g) || []).length; return l / Math.max(1, l + c); };

// Най-честите модели (таксита) – последна възможност, ако D.1 се чете само наполовина
const MODELS = {
  TOYOTA: ['COROLLA', 'AURIS', 'PRIUS', 'C-HR', 'RAV4', 'CAMRY', 'YARIS', 'AVENSIS'], HYUNDAI: ['ELANTRA', 'I30', 'I40', 'IONIQ', 'TUCSON', 'KONA', 'SONATA', 'ACCENT', 'I20', 'BAYON'],
  SKODA: ['OCTAVIA', 'SUPERB', 'FABIA', 'RAPID', 'SCALA', 'KAROQ', 'KODIAQ', 'ENYAQ'], DACIA: ['LOGAN', 'SANDERO', 'DUSTER', 'JOGGER', 'LODGY', 'SPRING'],
  KIA: ['CEED', 'NIRO', 'SPORTAGE', 'OPTIMA', 'RIO', 'XCEED', 'CARENS', 'EV6'], VOLKSWAGEN: ['PASSAT', 'GOLF', 'TOURAN', 'JETTA', 'CADDY', 'POLO', 'TIGUAN', 'SHARAN'],
  MERCEDES: ['VITO'], RENAULT: ['MEGANE', 'CLIO', 'CAPTUR', 'FLUENCE', 'TALISMAN', 'KANGOO', 'SCENIC', 'ZOE'], OPEL: ['ASTRA', 'INSIGNIA', 'ZAFIRA', 'CORSA', 'MERIVA', 'MOKKA'],
  FORD: ['FOCUS', 'MONDEO', 'GALAXY', 'S-MAX', 'C-MAX', 'FIESTA', 'KUGA'], PEUGEOT: ['308', '508', '3008', '2008', '208', '5008', 'RIFTER'], CITROEN: ['C-ELYSEE', 'BERLINGO'],
  CHEVROLET: ['CRUZE', 'AVEO', 'LACETTI', 'CAPTIVA'], TESLA: ['MODEL 3', 'MODEL Y', 'MODEL S'], NISSAN: ['QASHQAI', 'LEAF', 'X-TRAIL', 'NOTE'], HONDA: ['CIVIC', 'ACCORD', 'CR-V', 'JAZZ'],
  BYD: ['ATTO 3', 'SEAL', 'DOLPHIN'], SEAT: ['LEON', 'IBIZA', 'TOLEDO', 'ALHAMBRA'], FIAT: ['TIPO', 'DOBLO', 'PUNTO'], SUZUKI: ['VITARA', 'SWIFT'], VOLVO: ['S60', 'S80', 'V60', 'XC60', 'V70'],
};
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]/g, '[\\s-]?');

// Модел = остатъкът от реда след марката, до следващото поле „(X)“; само букви, цифри, тире
const cleanModel = (v) => {
  let m = String(v || '').replace(/\(.*$/, '').replace(/(^|\s)[A-ZА-Я]\s?[.,]\s?\d\b.*$/, '').replace(/\s{3,}.*$/, '').replace(/[^A-ZА-Я0-9 .\-]/g, ' ').replace(/\s+/g, ' ').trim();
  m = translit(m).replace(/^[-. ]+|[-. ]+$/g, '');
  return m.length >= 1 && /[A-Z0-9]/.test(m) && !/^\*+$/.test(m) ? m : null;
};

export function parseTalon(raw) {
  const orig = String(raw || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[|]/g, ' ').replace(/[“”"«»]/g, ' ');
  const lines = orig.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const L = lines.map(lat);
  const now = new Date().getFullYear();

  // ---- (D.1) марка и модел ----
  // етикетът е „(D.1)“ – само с D/Д (O.1 е друго поле на талона)
  const D1 = /(?:^|[\s(])[DД]\s?[.,·]?\s?[1lI|]\s?\)?/;
  let make = null, model = null;
  const fromValue = (v) => { // „MERCEDES E 220 D“ / „МЕРЦЕДЕС Е 220 Д“ → марка + модел
    const vv = lat(v).replace(/\s+/g, ' ').trim();
    for (const mk of MAKES) { const x = vv.match(new RegExp(`(^|[^A-Z])${esc(mk)}(?:[\\s-]?BENZ)?([^A-Z]|$)(.*)`)); if (x) return { make: mk, model: cleanModel(x[3]) }; }
    for (const [cy, mk] of Object.entries(CYR_MAKES)) { const lv = lat(v), lc = lat(cy); const i = lv.indexOf(lc); if (i >= 0 && (i === 0 || /[^A-ZА-Я]/.test(lv[i - 1]))) return { make: mk, model: cleanModel(v.slice(i + cy.length)) }; }
    return null;
  };
  for (let i = 0; i < lines.length && !make; i++) {
    const m = lines[i].match(D1); if (!m) continue;
    const rest = lines[i].slice(m.index + m[0].length);
    // кандидати: този ред и следващият (вторият ред на D.1 е на латиница) – първо латинският
    const cands = [rest, lines[i + 1] || ''].map((x) => x.replace(/\(.*$/, '').trim()).filter((x) => x && !/^\*+/.test(x));
    cands.sort((x, y) => latinShare(y) - latinShare(x));
    for (const c of cands) { const r = fromValue(c); if (r) { make = r.make; model = r.model; break; } }
  }
  // D.1 не се чете цяло: марка на кой да е ред (латиница или кирилица) – моделът е остатъкът от същия ред
  if (!make) {
    const order = lines.map((l, i) => i).sort((a, b) => latinShare(lines[b]) - latinShare(lines[a]));
    for (const i of order) { const r = fromValue(lines[i]); if (r) { make = r.make; model = model || r.model; break; } }
  }
  // марка по номера на рамата (E)
  if (!make) { const v = L.join(' ').match(/\b([A-HJ-NPR-Z0-9]{3})[A-HJ-NPR-Z0-9]{14}\b/); if (v && WMI[v[1]]) make = WMI[v[1]]; }
  // моделът след половин марка: „...DES E 220 D“ → „E 220 D“
  if (make && !model) {
    for (const l of L) { for (let k = Math.min(make.length - 1, 6); k >= 3; k--) { const x = l.match(new RegExp(`${esc(make.slice(-k))}\\s+(.+)`)); if (x) { model = cleanModel(x[1]); break; } } if (model) break; }
  }
  // Mercedes, BMW, Lexus, Volvo: моделът е „E 220 D“, „C 200“, „520 D“ – търсим такъв запис
  if (make && !model && /MERCEDES|BMW|LEXUS|VOLVO/.test(make)) {
    for (const l of L) { const x = l.replace(/\([^)]*\)\S*/g, ' ').match(/(?:^|\s)([A-Z]{1,3}) ?(\d{3})(?: ?([A-ZД]{1,3}))?(?=\s|$)/); if (x && !/^\d{3}$/.test(x[0].trim())) { model = translit([x[1], x[2], x[3]].filter(Boolean).join(' ')); break; } }
  }
  if (make && !model) { const all = L.join('\n'); for (const m of (MODELS[make] || [])) { if (new RegExp(`(^|[^A-Z0-9./])${esc(m)}([^A-Z0-9./]|$)`, 'm').test(all)) { model = m; break; } } }
  if (model && /^\d{1,2}$/.test(model)) model = null;

  // ---- (B) дата на първа регистрация → годината ----
  let year = null;
  const text = L.join('\n');
  const b = text.match(/\(?\s?[B8]\s?\)\s*(\d{2})\s?[./-]\s?(\d{2})\s?[./-]\s?(\d{4})/) || text.match(/(?:^|\s)B\b[.:,]?\s*(\d{2})[./-](\d{2})[./-](\d{4})/);
  if (b && +b[3] >= 1950 && +b[3] <= now) year = +b[3];
  if (!year) { const ys = [...text.matchAll(/\b\d{2}[./-]\d{2}[./-]((?:19|20)\d{2})\b/g)].map((m) => +m[1]).filter((y) => y >= 1950 && y <= now); if (ys.length) year = Math.min(...ys); }

  // ---- (A) рег. номер ----
  const PL = /([ABEKMHOPCTYX]{1,2})\s?(\d{4})\s?([ABEKMHOPCTYX]{1,2})(?![A-Z0-9])/;
  const a = text.match(new RegExp(`\\(\\s?A\\s?\\)\\s*${PL.source}`)) || text.match(new RegExp(`(?:^|[^A-Z0-9])${PL.source}`));
  const plate = a ? `${a[1]} ${a[2]} ${a[3]}` : null;

  return { make: make ? title(make) : null, model: model ? title(model) : null, year, plate };
}

let tess = null;
const loadTesseract = () => window.Tesseract ? Promise.resolve(window.Tesseract) : (tess ||= new Promise((res, rej) => {
  const sc = h('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/7.0.0/tesseract.min.js' });
  sc.onload = () => res(window.Tesseract); sc.onerror = () => { tess = null; rej(new Error('load')); };
  document.head.append(sc);
}));

// Снимката → JPEG до 1600 px (по-малко за качване, достатъчно за четене)
function shrink(file, max = 1600) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const im = new Image();
    im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
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

// Еднакъв вид, откъдето и да идва резултатът: „Mercedes“, „E 220 D“, „PB 8092 PE“
function tidy(r) {
  const up = (v) => (v ? translit(lat(String(v).toUpperCase())).trim() : null);
  const p = up(r.plate)?.replace(/\s/g, '').match(/^([A-Z]{1,2})(\d{4})([A-Z]{1,2})$/);
  return { make: r.make ? title(up(r.make).replace(/[\s-]?BENZ$/, '')) : null, model: r.model ? title(up(r.model)) : null, year: r.year ? Number(r.year) || null : null, plate: p ? `${p[1]} ${p[2]} ${p[3]}` : up(r.plate) };
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
      if (!r || !r.make || !r.model || !r.year || !r.plate) {
        status.textContent = 'Чета талона на телефона… Първият път отнема до минута.';
        const T = await loadTesseract();
        const big = await shrink(file, 2400); // по-едри букви – по-точно разпознаване
        const w = await T.createWorker('bul+eng');
        const pass = async (psm) => { await w.setParameters({ tessedit_pageseg_mode: psm }); return parseTalon((await w.recognize(big)).data.text); };
        // първо „разпръснат текст“ (талонът е в колони), после обикновеното четене за липсващото
        let loc = await pass('11');
        if (!loc.make || !loc.model || !loc.year || !loc.plate) { const l2 = await pass('3'); loc = { ...l2, ...Object.fromEntries(Object.entries(loc).filter(([, v]) => v)) }; }
        if (!loc.model || !loc.year) { const l3 = parseTalon((await w.recognize(contrast(big))).data.text); loc = { ...l3, ...Object.fromEntries(Object.entries(loc).filter(([, v]) => v)) }; }
        await w.terminate();
        r = r ? { ...loc, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v)) } : loc;
      }
    } catch { r = null; }
    closeSheet();
    if (r) r = tidy(r);
    if (!r || !(r.make || r.model || r.year || r.plate)) { toast('Не успях да прочета талона. Снимай го отблизо, на светло – или попълни на ръка.', 'err'); return; }
    const got = [r.make && r.model ? `${r.make} ${r.model}` : r.make || r.model, r.year, r.plate].filter(Boolean).join(' · ');
    toast(r.model ? `Намерих: ${got}. Провери и запази.` : `Намерих: ${got}. Моделът не се чете – допиши го.`, r.model ? undefined : 'err');
    onResult(r);
  };
  input.click();
}
