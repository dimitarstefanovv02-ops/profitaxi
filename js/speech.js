// Разпознаване на казаното при гласово въвеждане (без зависимости – ползва се и в тестовете).

// ---------- числа с думи ----------
const UNITS = { нула: 0, един: 1, една: 1, едно: 1, два: 2, две: 2, три: 3, четири: 4, пет: 5, шест: 6, седем: 7, осем: 8, девет: 9, десет: 10,
  единадесет: 11, единайсет: 11, дванадесет: 12, дванайсет: 12, тринадесет: 13, тринайсет: 13, четиринадесет: 14, четиринайсет: 14,
  петнадесет: 15, петнайсет: 15, шестнадесет: 16, шестнайсет: 16, седемнадесет: 17, седемнайсет: 17, осемнадесет: 18, осемнайсет: 18,
  деветнадесет: 19, деветнайсет: 19, двадесет: 20, двайсет: 20, тридесет: 30, трийсет: 30, четиридесет: 40, четирийсет: 40, петдесет: 50,
  шестдесет: 60, седемдесет: 70, осемдесет: 80, деветдесет: 90, сто: 100, двеста: 200, триста: 300, четиристотин: 400, петстотин: 500,
  шестстотин: 600, седемстотин: 700, осемстотин: 800, деветстотин: 900 };
export function wordsToDigits(text) {
  const toks = String(text).split(/(\s+)/);
  const out = []; let cur = null, total = 0, pendingSpace = '';
  const flush = () => { if (cur != null || total) { out.push(String(total + (cur || 0))); } cur = null; total = 0; };
  for (const t of toks) {
    if (/^\s+$/.test(t)) { if (cur != null || total) pendingSpace = t; else out.push(t); continue; }
    const w = t.toLowerCase().replace(/[.,!?;:]+$/, ''); const tail = t.slice(w.length);
    if (w in UNITS) { cur = (cur || 0) + UNITS[w]; pendingSpace = ''; if (tail) { flush(); out.push(tail); } continue; }
    if (w === 'хиляда') { total += 1000; pendingSpace = ''; continue; }
    if (w === 'хиляди') { total += (cur || 1) * 1000; cur = null; pendingSpace = ''; continue; }
    if (w === 'и' && (cur != null || total)) { pendingSpace = ''; continue; }
    if (cur != null || total) { flush(); out.push(pendingSpace || ' '); pendingSpace = ''; }
    out.push(t);
  }
  flush();
  return out.join('');
}

// ---------- какво е казано ----------
const CATS = [
  ['cash', /^(кеш|cash|брой|налични|наличните|кешът)/],
  ['card', /^(карт|пос|card|терминал)/],
  ['app', /^(приложени|болт|bolt|юбер|uber|ъбер|апликаци|апп|app)/],
  ['tips', /^(бакшиш|tips|бакшиши)/],
  ['fuel', /^(горив|бензин|дизел|газ|метан|зареди|зарежда|ток)/],
  ['wash', /^(автомивк|мивк|миене|измих)/],
  ['parking', /^(паркинг|паркира)/],
  ['kmStart', /^(начал|тръгнах|начален)/],
  ['kmEnd', /^(краен|крайн|край|прибрах)/],
  ['km', /^(километ|км|километраж)/],
];
const QTY = /^(литр|л$|л\.|кубик|кг|килограм|квт|kwh)/;
export function parseSpeech(text, { kmStart = 0 } = {}) {
  const norm = wordsToDigits(String(text || '').toLowerCase())
    .replace(/(\d)[\s ](\d{3})(?!\d)/g, '$1$2')   // 250 210 → 250210
    .replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2')          // 12,50 → 12.50
    .replace(/(\d+)\s*(лв|лева|евро|€|eur)\.?/g, '$1');
  const toks = norm.split(/[\s,;:]+|(?<=\d)(?=[а-яa-z])/i).filter(Boolean);
  const nums = []; toks.forEach((t, i) => { const m = /^(\d+(?:\.\d+)?)$/.exec(t.replace(/[.,]$/, '')); if (m) nums.push({ i, v: parseFloat(m[1]), used: false }); });
  const out = { income: {}, fuel: null, wash: 0, parking: 0, kmStart: 0, kmEnd: 0 };
  // литри: число, последвано от „литра“
  nums.forEach((n) => { if (QTY.test(toks[n.i + 1] || '')) { n.used = true; out.fuel = out.fuel || { amount: 0, qty: 0 }; out.fuel.qty = n.v; } });
  // Всяко число отива при най-близката дума (кеш, карта…): първо най-близките двойки.
  // „кеш 120“ (числото след думата) е малко по-сигурно от „120 кеш“.
  const kws = []; toks.forEach((t, i) => { const cat = CATS.find(([, re]) => re.test(t))?.[0]; if (cat) kws.push({ i, cat, used: false }); });
  const pairs = [];
  for (const n of nums) for (const k of kws) {
    if (n.used) continue;
    const d = n.i - k.i;
    if (d > 0 && d <= 3) pairs.push({ n, k, cost: d });
    else if (d < 0 && d >= -2) pairs.push({ n, k, cost: -d + 0.5 });
  }
  pairs.sort((a, b) => a.cost - b.cost);
  for (const { n, k } of pairs) {
    if (n.used || k.used) continue;
    n.used = true; k.used = true;
    const v = n.v, cat = k.cat;
    if (['cash', 'card', 'app', 'tips'].includes(cat)) out.income[cat] = (out.income[cat] || 0) + v;
    else if (cat === 'fuel') { out.fuel = out.fuel || { amount: 0, qty: 0 }; out.fuel.amount += v; }
    else if (cat === 'wash') out.wash += v;
    else if (cat === 'parking') out.parking += v;
    else if (cat === 'kmStart') out.kmStart = Math.round(v);
    else if (cat === 'kmEnd') out.kmEnd = Math.round(v);
    else if (cat === 'km') {
      if (v >= 1000) { if (kmStart && v > kmStart) out.kmEnd = Math.round(v); else if (!out.kmStart && !kmStart) out.kmStart = Math.round(v); else out.kmEnd = Math.round(v); }
      else if (kmStart) out.kmEnd = Math.round(kmStart + v);
    }
  }
  if (out.fuel && !out.fuel.amount) out.fuel = out.fuel.qty ? out.fuel : null;
  return out;
}
