// Гласово въвеждане: записва гласа, превръща го в текст (Whisper през сървъра; на Android без интернет –
// вграденото разпознаване) и разпознава сумите: „кеш 120, карта 80, гориво 40 евро 28 литра“.

import { h, icon, cx, money } from './util.js';
import { openSheet, sheetHead, toast } from './ui.js';
import * as store from './store.js';
import { parseSpeech } from './speech.js';
export { parseSpeech, wordsToDigits } from './speech.js';

export const parsedItems = (p) => [
  ...Object.entries(p.income).map(([k, v]) => [{ cash: 'Кеш', card: 'Карта', app: 'Приложения', tips: 'Бакшиш' }[k], money(v, v % 1 ? 2 : 0)]),
  p.fuel && ['Гориво', [p.fuel.amount ? money(p.fuel.amount, p.fuel.amount % 1 ? 2 : 0) : '', p.fuel.qty ? `${String(p.fuel.qty).replace('.', ',')} л` : ''].filter(Boolean).join(' · ')],
  p.wash && ['Автомивка', money(p.wash, p.wash % 1 ? 2 : 0)],
  p.parking && ['Паркинг', money(p.parking, p.parking % 1 ? 2 : 0)],
  p.kmStart && ['Начален км', p.kmStart.toLocaleString('bg-BG')],
  p.kmEnd && ['Краен км', p.kmEnd.toLocaleString('bg-BG')],
].filter(Boolean);

// ---------- запис ----------
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
export const voiceAvailable = () => (store.live() && canRecord()) || !!SR;
const pickMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
const toB64 = (blob) => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = bad; r.readAsDataURL(blob); });

// Отваря листа за глас. mode 'shift' – показва разпознатите суми и onApply(parsed); mode 'text' – връща само текста (търсачка).
export function openVoice({ mode = 'shift', title, hint, kmStart = 0, onApply, onText } = {}) {
  let closed = false, state = 'idle', rec = null, stream = null, chunks = [], timer = null, secs = 0, recog = null, text = '';
  return openSheet((close) => {
    const box = h('div', { class: 'voice' });
    const stopAll = () => { clearInterval(timer); try { rec?.state === 'recording' && rec.stop(); } catch { /* */ } try { recog?.stop(); } catch { /* */ } stream?.getTracks().forEach((t) => t.stop()); };
    const finish = (t) => { text = String(t || '').trim(); state = text ? 'done' : 'empty'; draw(); if (mode === 'text' && text) { close(); onText && onText(text); } };
    async function start() {
      text = ''; secs = 0;
      if (store.live() && canRecord()) {
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch { state = 'denied'; draw(); return; }
        const mime = pickMime(); chunks = [];
        rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          if (closed) return;
          state = 'busy'; draw();
          const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
          if (blob.size < 800) { finish(''); return; }
          const r = await store.driverCall('voice', { audio: await toB64(blob), mime: blob.type, mockText: window.__voiceMock });
          if (r.error) { state = 'error'; box.dataset.err = r.error; draw(); return; }
          finish(r.text);
        };
        rec.start(); state = 'rec'; draw();
        timer = setInterval(() => { secs++; const t = box.querySelector('.voice-time'); if (t) t.textContent = `0:${String(secs).padStart(2, '0')}`; if (secs >= 30) stop(); }, 1000);
      } else if (SR) {
        recog = new SR(); recog.lang = 'bg-BG'; recog.interimResults = true; recog.continuous = true;
        let finalT = '';
        recog.onresult = (e) => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) finalT += r[0].transcript + ' '; else interim += r[0].transcript; } const l = box.querySelector('.voice-live'); if (l) l.textContent = (finalT + interim).trim(); };
        recog.onerror = (e) => { if (e.error === 'not-allowed') { state = 'denied'; draw(); } };
        recog.onend = () => { if (state === 'rec') finish(finalT); };
        recog.start(); state = 'rec'; draw();
      } else { state = 'unsupported'; draw(); }
    }
    function stop() { clearInterval(timer); if (rec?.state === 'recording') rec.stop(); else if (recog) { try { recog.stop(); } catch { /* */ } } }
    const parsed = () => parseSpeech(text, { kmStart });
    function draw() {
      const p = mode === 'shift' && text ? parsed() : null; const items = p ? parsedItems(p) : [];
      box.replaceChildren(...[
        h('p', { class: 'muted', style: { margin: '0 0 6px', textAlign: 'center' } }, hint || (mode === 'shift' ? 'Например: „Кеш 120, карта 80, гориво 40 евро, 28 литра, автомивка 6“' : 'Например: „Колко изкарах тази седмица?“')),
        h('button', { class: cx('voice-mic', state === 'rec' && 'on', state === 'busy' && 'scan'), type: 'button', 'aria-label': state === 'rec' ? 'Спри записа' : 'Започни да говориш', disabled: state === 'busy',
          onclick: () => (state === 'rec' ? stop() : start()) }, icon(state === 'rec' ? 'check' : 'mic', 40)),
        h('div', { class: 'voice-live' },
          state === 'idle' ? 'Натисни и говори' :
          state === 'rec' ? h('span', null, h('b', { class: 'voice-time' }, '0:00'), ' – говори; натисни пак, като свършиш') :
          state === 'busy' ? 'Разпознавам…' :
          state === 'denied' ? 'Няма достъп до микрофона. Разреши го в настройките на телефона.' :
          state === 'unsupported' ? 'Този телефон не поддържа запис на глас тук.' :
          state === 'error' ? box.dataset.err || 'Не успях. Опитай пак.' :
          state === 'empty' ? 'Не чух нищо. Опитай пак, по-близо до телефона.' : ''),
        state === 'done' && mode === 'shift' && h('div', { class: 'voice-res' },
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Чух'),
            h('textarea', { class: 'input voice-input', rows: 2, oninput: (e) => { text = e.target.value; const keep = e.target.selectionStart; draw(); const ta = box.querySelector('textarea'); ta.focus(); ta.setSelectionRange(keep, keep); } }, text)),
          items.length ? h('div', { class: 'voice-items' }, items.map(([k, v]) => h('div', { class: 'voice-item' }, icon('check', 16), h('span', { class: 'grow' }, k), h('b', null, v))))
            : h('p', { class: 'err' }, 'Не разпознах суми. Кажи например „кеш 120“ или поправи текста отгоре.'),
          h('div', { class: 'np-actions' },
            h('button', { class: 'btn btn-ghost', onclick: () => { state = 'idle'; text = ''; draw(); } }, 'Пак'),
            h('button', { class: 'btn btn-primary', disabled: !items.length, onclick: () => { close(); onApply && onApply(parsed(), text); } }, icon('check', 18), 'Добави в смяната')))].filter(Boolean));
    }
    draw();
    setTimeout(() => { if (state === 'idle') start(); }, 250);
    return h('div', null, sheetHead(title || 'Кажи на глас', () => { stopAll(); close(); }), box);
  }, { onClose: () => { closed = true; try { rec?.state === 'recording' && rec.stop(); } catch { /* */ } stream?.getTracks().forEach((t) => t.stop()); clearInterval(timer); } });
}

export { toast };
