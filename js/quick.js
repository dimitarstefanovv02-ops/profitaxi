// Бързи действия за шофьора: гласово въвеждане, снимка на касова бележка за горивото,
// резервации в календара на телефона, картинка на месеца за споделяне и „Изтегли“ (иконка на началния екран).

import { h, icon, cx, money, round2, uid, todayStr, MONTHS, parseDate } from './util.js';
import * as store from './store.js';
import { openSheet, sheetHead, toast, openNumpad } from './ui.js';
import { FUELS, FUEL_TYPES, INCOME_TYPES } from './constants.js';

// ---------------------------------------------------------------------
//  Гласово въвеждане: „кеш 120, карта 40, гориво 35 и 30 литра, бакшиш 5“
// ---------------------------------------------------------------------
const WORDS = { 'нула': 0, 'едно': 1, 'един': 1, 'една': 1, 'две': 2, 'два': 2, 'три': 3, 'четири': 4, 'пет': 5, 'шест': 6, 'седем': 7, 'осем': 8, 'девет': 9, 'десет': 10,
  'единайсет': 11, 'единадесет': 11, 'дванайсет': 12, 'дванадесет': 12, 'тринайсет': 13, 'четиринайсет': 14, 'петнайсет': 15, 'шестнайсет': 16, 'седемнайсет': 17, 'осемнайсет': 18, 'деветнайсет': 19,
  'двайсет': 20, 'двадесет': 20, 'трийсет': 30, 'тридесет': 30, 'четирийсет': 40, 'четиридесет': 40, 'петдесет': 50, 'шейсет': 60, 'шестдесет': 60, 'седемдесет': 70, 'осемдесет': 80, 'деветдесет': 90,
  'сто': 100, 'двеста': 200, 'триста': 300, 'четиристотин': 400, 'петстотин': 500, 'шестстотин': 600, 'седемстотин': 700, 'осемстотин': 800, 'деветстотин': 900, 'хиляда': 1000 };
// „сто и двайсет и пет“ → 125; цифрите си остават цифри
function wordsToDigits(text) {
  const toks = text.split(/\s+/); const out = []; let acc = null;
  const flush = () => { if (acc != null) { out.push(String(acc)); acc = null; } };
  for (const t of toks) {
    if (t in WORDS) { acc = (acc || 0) + WORDS[t]; continue; }
    if (t === 'и' && acc != null) continue;
    flush(); out.push(t);
  }
  flush();
  return out.join(' ');
}
const KEYS = [
  ['cash', /^(кеш|кешa|в\s?брой|налични|cash)/], ['card', /^(карт|пос|pos|card)/], ['app', /^(приложени|апликаци|bolt|болт|uber|юбер|app)/], ['tips', /^(бакшиш|tips?)/],
  ['fuel', /^(горив|бензин|газ|дизел|нафта|заредих|зареждане|ток)/], ['wash', /^(автомивк|миене|мивка)/], ['parking', /^(паркинг|паркиране)/],
  ['qty', /^(литр|литъ|л$|l$)/], ['km', /^(километр|км$)/],
];
const FUEL_WORD = [['diesel', /дизел|нафта/], ['lpg', /газ|пропан/], ['electric', /ток|kwh/], ['petrol', /бензин|а95|a95|а100/]];
export function parseVoice(raw) {
  const text = wordsToDigits(String(raw || '').toLowerCase().replace(/(\d)\s*,\s*(\d{1,2})(?!\d)/g, '$1.$2').replace(/[.,;!?]+(\s|$)/g, ' $1').replace(/€|евро|лева|лв\.?/g, ' '));
  const toks = text.split(/\s+/).filter(Boolean);
  const items = []; // {key, value, word}
  let waiting = null, pendingNum = null; // ключова дума, която чака число / число, което чака ключова дума
  for (const t of toks) {
    if (/^\d+(\.\d+)?$/.test(t)) {
      const v = Number(t);
      if (waiting) { waiting.value = v; waiting = null; } else pendingNum = v;
      continue;
    }
    const k = KEYS.find(([, re]) => re.test(t));
    if (!k) continue;
    const it = { key: k[0], value: null, word: t };
    items.push(it);
    if (pendingNum != null) { it.value = pendingNum; pendingNum = null; waiting = null; } else waiting = it;
  }
  const r = { income: {}, expenses: [], fuel: null, km: null };
  for (const it of items) {
    if (it.value == null) continue;
    if (INCOME_TYPES[it.key]) r.income[it.key] = round2((r.income[it.key] || 0) + it.value);
    else if (it.key === 'fuel') r.fuel = { amount: it.value, qty: r.fuel?.qty || 0, type: FUEL_WORD.find(([, re]) => re.test(it.word || ''))?.[0] || null };
    else if (it.key === 'qty') { if (r.fuel) r.fuel.qty = it.value; else r.fuel = { amount: 0, qty: it.value, type: null }; }
    else if (it.key === 'km') r.km = it.value;
    else r.expenses.push({ category: it.key, amount: it.value });
  }
  return r;
}
// Бутонът „Кажи го“ е навсякъде: ако телефонът не разпознава глас, се пише (или се ползва 🎤 на клавиатурата)
export const voiceSupported = () => true;
const srClass = () => window.SpeechRecognition || window.webkitSpeechRecognition;
// Android Chrome понякога връща всяко парче наново („кеш“, „кеш 120“, „кеш 120 карта“…) – пазим само последното
export function joinTranscripts(parts) {
  const out = [];
  for (const raw of parts) {
    const t = String(raw || '').trim(); if (!t) continue;
    const prev = out[out.length - 1];
    if (prev && t.toLowerCase().startsWith(prev.toLowerCase())) out[out.length - 1] = t;
    else if (prev && prev.toLowerCase().startsWith(t.toLowerCase())) continue;
    else out.push(t);
  }
  return out.join(' ');
}
const VOICE_ERR = {
  'not-allowed': 'Микрофонът е забранен за сайта. Разреши го от настройките на браузъра – или натисни 🎤 на клавиатурата и кажи сумите.',
  'service-not-allowed': 'Телефонът не позволява разпознаване на глас тук. Натисни 🎤 на клавиатурата и кажи сумите.',
  'no-speech': 'Не чух нищо. Натисни „Слушай пак“ или напиши.',
  'audio-capture': 'Няма достъп до микрофона. Затвори други приложения, които го ползват, или напиши.',
  'network': 'Разпознаването на глас иска интернет. Напиши сумите тук.',
  'language-not-supported': 'Телефонът не разпознава български тук. Натисни 🎤 на клавиатурата или напиши.',
};
// Слуша и попълва полето; onParsed(parsed, text)
export function listen(onParsed) {
  const SR = srClass();
  // На iPhone в инсталираното приложение разпознаването на Safari не работи – там е 🎤 на клавиатурата
  const canListen = !!SR && !(isIOS && isStandalone());
  let rec = null, heard = [], interim = '', listening = false;
  const status = h('p', { class: 'voice-live' });
  const input = h('input', { class: 'input voice-input', type: 'text', inputmode: 'text', enterkeyhint: 'done', autocomplete: 'off', placeholder: 'кеш 120 карта 40 гориво 35', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } } });
  const mic = h('div', { class: 'voice-mic' }, icon('call', 34));
  const again = h('button', { class: 'btn btn-ghost grow', onclick: () => start() }, icon('call', 18), 'Слушай пак');
  const say = (text, bad) => { status.textContent = text; status.classList.toggle('bad', !!bad); };
  const apply = () => {
    const text = input.value.trim();
    if (!text) { say('Кажи или напиши сумите, например „кеш 120 карта 40“.', true); return; }
    const p = parseVoice(text);
    if (!Object.keys(p.income).length && !p.fuel && !p.expenses.length) { say(`Не разбрах сума в „${text}“. Пиши: дума и число – „кеш 120“, „гориво 40“.`, true); return; }
    stop(); close(); onParsed(p, text);
  };
  const stop = () => { listening = false; mic.classList.remove('on'); try { rec && rec.abort(); } catch { /* */ } };
  const start = () => {
    if (!canListen) { say(SR ? VOICE_ERR['service-not-allowed'] : 'Натисни 🎤 на клавиатурата и кажи сумите – или ги напиши.'); input.focus(); return; }
    stop();
    heard = []; interim = '';
    rec = new SR(); rec.lang = 'bg-BG'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const fin = [], tmp = [];
      for (let i = 0; i < e.results.length; i++) (e.results[i].isFinal ? fin : tmp).push(e.results[i][0].transcript);
      heard = fin; interim = tmp.join(' ');
      input.value = joinTranscripts([...heard, interim]);
    };
    rec.onerror = (e) => { listening = false; mic.classList.remove('on'); if (e.error !== 'aborted') say(VOICE_ERR[e.error] || 'Не те чух. Опитай пак или напиши.', true); };
    rec.onend = () => {
      const wasOn = listening; listening = false; mic.classList.remove('on');
      if (!wasOn) return;
      const text = joinTranscripts([...heard, interim]);
      if (text) { input.value = text; apply(); } else say(VOICE_ERR['no-speech'], true);
    };
    try { rec.start(); listening = true; mic.classList.add('on'); say('Говори… например „кеш 120, карта 40, гориво 35“'); }
    catch { say('Микрофонът е зает. Опитай пак или напиши.', true); }
  };
  const close = openSheet((cl) => h('div', { class: 'voice' },
    sheetHead('Кажи го', cl, 'Кажи сумите с думи – приложението ги попълва само'),
    mic, status, input,
    h('div', { class: 'row gap', style: { marginTop: '12px' } }, canListen && again,
      h('button', { class: 'btn btn-primary grow', onclick: apply }, icon('check', 18), 'Добави'))), { onClose: () => stop() });
  start();
}
// Прилага разпознатото към смяна (чернова или активната)
export function applyParsed(shift, p, profile) {
  const types = FUELS[profile.fuel]?.types || ['petrol'];
  for (const [k, v] of Object.entries(p.income)) shift.income[k] = round2((shift.income[k] || 0) + v);
  if (p.fuel && p.fuel.amount) shift.expenses.push({ id: uid(), category: 'fuel', fuelType: p.fuel.type && types.includes(p.fuel.type) ? p.fuel.type : types[0], amount: p.fuel.amount, qty: p.fuel.qty || 0 });
  for (const e of p.expenses) shift.expenses.push({ id: uid(), category: e.category, amount: e.amount });
  if (p.km && shift.kmStart && p.km > shift.kmStart) shift.kmEnd = Math.round(p.km);
  const parts = [...Object.entries(p.income).map(([k, v]) => `${INCOME_TYPES[k].label} ${money(v, v % 1 ? 2 : 0)}`), p.fuel?.amount && `Гориво ${money(p.fuel.amount, 2)}`, ...p.expenses.map((e) => `${e.category === 'wash' ? 'Автомивка' : 'Паркинг'} ${money(e.amount)}`)].filter(Boolean);
  return parts.join(', ');
}

// ---------------------------------------------------------------------
//  Касова бележка за горивото: снимка → разпознаване на текста → сума, литри, вид гориво
// ---------------------------------------------------------------------
const num = (s) => Number(String(s).replace(/\s/g, '').replace(',', '.'));
export function parseReceipt(raw) {
  const text = String(raw || '').toUpperCase().replace(/[ОO](?=\d)/g, '0');
  const lines = text.split(/\n+/);
  const NUM = /(\d{1,4}[.,]\d{2})(?!\d)/g;
  let amount = null;
  // 1) сума до „ОБЩА СУМА“, „СУМА“, „ОБЩО“, „ВСИЧКО“, „TOTAL“, „ЗА ПЛАЩАНЕ“
  for (const l of lines) {
    if (/(ОБЩА\s*СУМА|ОБЩО|ВСИЧКО|ЗА\s*ПЛАЩАНЕ|TOTAL|\bСУМА)/.test(l)) {
      const m = [...l.matchAll(NUM)].map((x) => num(x[1]));
      if (m.length) amount = Math.max(amount || 0, ...m);
    }
  }
  // 2) литри: „30,52 Л“ или „30,520 X 2,45“
  let qty = null, price = null;
  const mQty = text.match(/(\d{1,3}[.,]\d{1,3})\s*(Л|L|ЛИТР|KWH)(?![А-ЯA-Z])/);
  if (mQty) qty = num(mQty[1]);
  const mX = text.match(/(\d{1,3}[.,]\d{2,3})\s*(?:Л|L)?\s*[XХ*]\s*(\d{1,2}[.,]\d{2,3})/);
  if (mX) { const a = num(mX[1]), b = num(mX[2]); if (a > b) { qty = qty || a; price = b; } else { qty = qty || b; price = a; } }
  if (!amount && qty && price) amount = round2(qty * price);
  // 3) последна възможност: най-голямото число под 1000 с два знака
  if (!amount) { const all = [...text.matchAll(NUM)].map((x) => num(x[1])).filter((v) => v < 1000); if (all.length) amount = Math.max(...all); }
  const type = /ДИЗЕЛ|DIESEL|НАФТА|\bD\b/.test(text) ? 'diesel' : /ГАЗ|LPG|ПРОПАН|АВТОГАЗ/.test(text) ? 'lpg' : /KWH|ЗАРЕЖДАНЕ\s*НА\s*ЕЛ/.test(text) ? 'electric' : /А\s?95|A\s?95|А\s?98|A\s?98|А\s?100|A\s?100|БЕНЗИН/.test(text) ? 'petrol' : null;
  return { amount: amount ? round2(amount) : null, qty: qty ? round2(qty) : null, type };
}
let tessLoading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tessLoading) tessLoading = new Promise((res, rej) => {
    const sc = h('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/7.0.0/tesseract.min.js' });
    sc.onload = () => res(window.Tesseract); sc.onerror = () => { tessLoading = null; rej(new Error('load')); };
    document.head.append(sc);
  });
  return tessLoading;
}
// Снимай бележката; onResult({amount, qty, type}) – после шофьорът потвърждава в клавиатурата
export function scanReceipt(onResult) {
  const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
  document.body.append(input);
  input.onchange = async () => {
    const file = input.files[0]; input.remove(); if (!file) return;
    if (!navigator.onLine) { toast('Разпознаването на бележка иска интернет. Въведи сумата на ръка.', 'err'); onResult({}); return; }
    let closeSheet;
    const status = h('p', { class: 'muted' }, 'Разпознавам бележката… Първият път отнема до минута.');
    closeSheet = openSheet((close) => h('div', { class: 'voice' }, sheetHead('Касова бележка', close), h('div', { class: 'voice-mic scan' }, icon('camera', 34)), status));
    try {
      const T = await loadTesseract();
      const { data } = await T.recognize(file, 'bul+eng');
      closeSheet();
      const r = parseReceipt(data.text);
      if (!r.amount) toast('Не намерих сумата. Въведи я на ръка.', 'err'); else toast(`Намерих ${money(r.amount, 2)}${r.qty ? `, ${String(r.qty).replace('.', ',')} л` : ''}. Провери и запиши.`);
      onResult(r);
    } catch {
      closeSheet(); toast('Не успях да прочета бележката. Въведи сумата на ръка.', 'err'); onResult({});
    }
  };
  input.click();
}

// ---------------------------------------------------------------------
//  Резервации в календара на телефона (.ics файл – отваря се от Google и Apple календара)
// ---------------------------------------------------------------------
const icsDate = (date, time) => `${date.replace(/-/g, '')}T${(time || '09:00').replace(':', '')}00`;
const esc = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
export function reservationsIcs(list) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const ev = list.map((r) => {
    const [hh, mm] = (r.time || '09:00').split(':').map(Number);
    const end = `${String((hh + 1) % 24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    return ['BEGIN:VEVENT', `UID:${r.id}@profitaxi`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Europe/Sofia:${icsDate(r.date, r.time)}`, `DTEND;TZID=Europe/Sofia:${icsDate(r.date, end)}`,
      `SUMMARY:${esc(`Курс: ${r.client || 'клиент'}${r.price ? ` – ${r.price} €` : ''}`)}`, `LOCATION:${esc(r.from)}`, `DESCRIPTION:${esc(`${r.from} → ${r.to}${r.phone ? `\nТелефон: ${r.phone}` : ''}${r.note ? `\n${r.note}` : ''}`)}`,
      'BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', 'DESCRIPTION:Курс след 1 час', 'END:VALARM', 'END:VEVENT'].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ProfiTaxi//BG', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n');
}
export function addToCalendar(list) {
  if (!list.length) { toast('Няма предстоящи резервации', 'err'); return; }
  const blob = new Blob([reservationsIcs(list)], { type: 'text/calendar;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: list.length === 1 ? 'kurs.ics' : 'rezervacii.ics' });
  document.body.append(a); a.click(); a.remove();
  toast(list.length === 1 ? 'Отвори файла – курсът влиза в календара ти' : `Отвори файла – ${list.length} курса влизат в календара ти`);
}

// ---------------------------------------------------------------------
//  Картинка на месеца за споделяне (Viber, Instagram, Facebook)
// ---------------------------------------------------------------------
export async function shareMonth({ net, income, shifts, hours, name }) {
  const W = 1080, H = 1350; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2A2350'); g.addColorStop(0.6, '#0E0F14'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const font = (w, s) => `${w} ${s}px Onest, Inter, system-ui, sans-serif`;
  x.fillStyle = '#FFC21A'; x.font = font(800, 40); x.fillText(MONTHS[parseDate(todayStr()).getMonth()].toUpperCase() + ' ' + parseDate(todayStr()).getFullYear(), 90, 170);
  x.fillStyle = '#F3F1EA'; x.font = font(700, 64); x.fillText(name ? `${name} изкара` : 'Изкарах', 90, 300);
  x.font = font(800, 200); x.fillStyle = net >= 0 ? '#FFC21A' : '#FF6B7D'; x.fillText(money(net), 90, 530);
  x.fillStyle = '#B9BCC6'; x.font = font(600, 48); x.fillText('чисто, след всички разходи', 90, 610);
  const row = (label, val, y) => { x.fillStyle = '#8C8F9A'; x.font = font(600, 40); x.fillText(label, 90, y); x.fillStyle = '#F3F1EA'; x.font = font(800, 56); x.fillText(val, 90, y + 70); };
  row('Оборот', money(income), 780); row('Смени', String(shifts), 960); row('Часове зад волана', String(Math.round(hours)), 1140);
  x.fillStyle = '#F3F1EA'; x.font = font(800, 52); x.fillText('Profi', 640, 1270); x.fillStyle = '#A78BFA'; x.fillText('Taxi', 640 + x.measureText('Profi').width, 1270);
  x.fillStyle = '#8C8F9A'; x.font = font(600, 30); x.fillText('profitaxi.vercel.app', 640, 1310);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'profitaxi-mesec.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Моят месец в ProfiTaxi' }); return; } catch { /* отказано */ } }
  const a = h('a', { href: URL.createObjectURL(blob), download: 'profitaxi-mesec.png' }); document.body.append(a); a.click(); a.remove();
  toast('Картинката е запазена');
}

// ---------------------------------------------------------------------
//  „Изтегли“: иконката на началния екран на телефона
// ---------------------------------------------------------------------
let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; window.dispatchEvent(new Event('profitaxi:installable')); });
window.addEventListener('appinstalled', () => { deferred = null; try { localStorage.setItem('profitaxi.installed', '1'); } catch { /* */ } window.dispatchEvent(new Event('profitaxi:installable')); });
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const inApp = /FBAN|FBAV|Instagram|Viber|Messenger|Line\/|WhatsApp|TikTok/i.test(ua);
const iosSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua) && !inApp;
const markInstalled = () => { try { localStorage.setItem('profitaxi.installed', '1'); } catch { /* */ } };
// Отворено от иконката на началния екран → запомняме, че е инсталирано (Android споделя паметта с Chrome)
if (isStandalone()) markInstalled();
export function installBarVisible() {
  if (isStandalone()) return false;
  try { if (localStorage.getItem('profitaxi.installed') === '1' && !deferred) return false; const d = Number(localStorage.getItem('profitaxi.installHide') || 0); if (Date.now() - d < 7 * 86400000) return false; } catch { /* */ }
  return true;
}
export function installBar(onHide) {
  return h('div', { class: 'install-bar', role: 'region', 'aria-label': 'Изтегли приложението' },
    h('img', { src: document.querySelector('link[rel=apple-touch-icon]')?.href || '/icons/icon-192.png', alt: '' }),
    h('div', { class: 'grow' }, h('b', null, 'Изтегли приложението'), h('small', null, 'Иконка на началния екран')),
    h('button', { class: 'btn btn-primary btn-sm', onclick: install }, icon('download', 16), 'Изтегли'),
    h('button', { class: 'icon-btn plain', 'aria-label': 'Скрий', onclick: () => { try { localStorage.setItem('profitaxi.installHide', String(Date.now())); } catch { /* */ } onHide?.(); } }, icon('x', 18)));
}
export async function install() {
  // Android и компютър: браузърът сам слага иконката след едно потвърждение
  if (deferred) {
    deferred.prompt();
    const { outcome } = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
    deferred = null;
    if (outcome === 'accepted') { try { localStorage.setItem('profitaxi.installed', '1'); } catch { /* */ } toast('Готово! Иконката е на началния екран.'); window.dispatchEvent(new Event('profitaxi:installable')); }
    return;
  }
  // iPhone: Apple не позволява на сайтовете да го правят сами – показваме двата натиска
  const step = (n, ic, title, text) => h('div', { class: 'inst-step' }, h('i', null, String(n)), h('div', { class: 'grow' }, h('b', null, title), h('small', null, text)), h('span', { class: 'inst-ic' }, icon(ic, 22)));
  openSheet((close) => h('div', null,
    sheetHead('Изтегли на телефона', close, isIOS ? 'На iPhone става с 2 натискания – Apple не позволява на никой сайт да го направи сам.' : 'Отнема 2 натискания.'),
    inApp ? h('div', { class: 'inst-warn' }, icon('alert', 18), h('span', null, `Отворил си линка във ${/Viber/i.test(ua) ? 'Viber' : 'друго приложение'}. Натисни „⋯“ горе и избери „Отвори в ${isIOS ? 'Safari' : 'Chrome'}“, после пак „Изтегли“.`)) : null,
    isIOS && !iosSafari && !inApp ? h('div', { class: 'inst-warn' }, icon('alert', 18), h('span', null, 'На iPhone това работи само в Safari. Отвори profitaxi.vercel.app/app в Safari.')) : null,
    isIOS
      ? h('div', { class: 'inst-steps' },
        step(1, 'share', 'Отвори менюто и натисни „Сподели“', 'Иконката „Сподели“ е квадратче със стрелка нагоре. Ако не я виждаш долу в Safari, натисни менюто „⋯“ и после „Сподели“.'),
        step(2, 'plus', 'Натисни „Добави към началния екран“', 'Превърти надолу в менюто, ако не го виждаш.'),
        step(3, 'check', 'Натисни „Добави“', 'Иконката ProfiTaxi излиза на началния екран. Отваряй приложението от нея.'))
      : h('div', { class: 'inst-steps' },
        step(1, 'more', 'Натисни менюто „⋮“', 'Горе вдясно в Chrome.'),
        step(2, 'download', '„Инсталиране на приложението“', 'Или „Добавяне към началния екран“. После „Инсталиране“.')),
    h('div', { class: 'row gap', style: { marginTop: '16px' } },
      h('button', { class: 'btn btn-ghost btn-lg grow', onclick: close }, 'По-късно'),
      h('button', { class: 'btn btn-primary btn-lg grow', onclick: () => { markInstalled(); close(); toast('Готово! Отваряй ProfiTaxi от иконката.'); window.dispatchEvent(new Event('profitaxi:installable')); } }, 'Добавих го'))));
}
