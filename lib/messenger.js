// Имейли и SMS през Brevo (brevo.com). Ключовете са само на сървъра (Vercel → Environment Variables):
//   BREVO_API_KEY – ключът от Brevo → SMTP & API → API Keys
//   MAIL_FROM     – потвърденият подател в Brevo (Senders)
//   SMS_SENDER    – име на подателя на SMS, до 11 латински букви (по подразбиране Chisto)
// Без ключ и при локален сървър (PT_MEMORY=1) всичко отива в „кутия“ в паметта – за тестовете.
const KEY = () => process.env.BREVO_API_KEY || '';
const FROM = () => process.env.MAIL_FROM || '';
const SENDER = () => (process.env.SMS_SENDER || 'Chisto').replace(/[^A-Za-z0-9]/g, '').slice(0, 11) || 'Chisto';
const MOCK = () => !KEY() && (process.env.PT_MEMORY === '1' || process.env.NODE_ENV === 'test' || process.env.MAIL_MOCK === '1');
export const outbox = []; // само при MOCK
export const mailReady = () => MOCK() || !!(KEY() && FROM());
export const smsReady = () => MOCK() || !!KEY();
export const mockMode = () => MOCK();
export const hasKey = () => !!KEY();
export const mailFrom = () => (MOCK() ? 'test@chisto.local' : FROM());

async function brevo(path, body) {
  const r = await fetch('https://api.brevo.com/v3' + path, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': KEY() }, body: JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`brevo ${r.status} ${txt.slice(0, 200)}`);
  try { return JSON.parse(txt || '{}'); } catch { return {}; }
}

export async function sendMail({ to, name, subject, html, text }) {
  if (MOCK()) { outbox.push({ kind: 'mail', to, subject, html, text, at: Date.now() }); return { ok: true, mock: true }; }
  if (!mailReady()) return { error: 'Имейлът не е настроен' };
  await brevo('/smtp/email', { sender: { name: 'Чисто', email: FROM() }, to: [{ email: to, name: name || to }], subject, htmlContent: html, textContent: text });
  return { ok: true };
}

// Телефон от България → 3598XXXXXXXX
export const intlPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('359') ? d : d.startsWith('0') ? '359' + d.slice(1) : d; };
export async function sendSms({ to, text }) {
  if (MOCK()) { outbox.push({ kind: 'sms', to: intlPhone(to), text, at: Date.now() }); return { ok: true, mock: true }; }
  if (!smsReady()) return { error: 'SMS не е настроен' };
  const body = { sender: SENDER(), recipient: intlPhone(to), content: text, type: 'transactional', tag: 'code', unicodeEnabled: /[^\x00-\x7F]/.test(text) };
  try { await brevo('/transactionalSMS/send', body); }
  catch (e) { if (!/ 404 /.test(e.message)) throw e; await brevo('/transactionalSMS/sms', body); } // по-старият адрес
  return { ok: true };
}

// Писмата – кратки, на български, с голям бутон
const wrap = (title, lines, btn, url, foot) => `<!doctype html><html lang="bg"><body style="margin:0;background:#F4F1F1;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1D1B1B">
<div style="max-width:520px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border-radius:22px;padding:28px 24px">
<div style="font-size:22px;font-weight:800;margin-bottom:6px">Чисто</div>
<h1 style="font-size:22px;line-height:1.25;margin:10px 0 12px">${title}</h1>
${lines.map((l) => `<p style="font-size:16px;line-height:1.5;margin:0 0 12px">${l}</p>`).join('')}
${btn ? `<p style="margin:22px 0"><a href="${url}" style="display:inline-block;background:#231F20;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 22px;border-radius:999px">${btn}</a></p>
<p style="font-size:13px;color:#776F70;line-height:1.4;margin:0">Ако бутонът не работи, отвори този линк:<br><a href="${url}" style="color:#776F70;word-break:break-all">${url}</a></p>` : ''}
</div><p style="font-size:12px;color:#968E8F;text-align:center;margin-top:14px">${foot || 'Получаваш това писмо, защото имаш акаунт в „Чисто“.'}</p></div></body></html>`;
export const verifyMail = (name, url) => ({
  subject: 'Потвърди имейла си в „Чисто“',
  html: wrap(`Здравей, ${String(name || '').split(' ')[0] || 'шофьоре'}!`, ['Натисни бутона, за да потвърдиш имейла си. Така ще можеш сам да си смениш паролата, ако я забравиш.'], 'Потвърди имейла', url, 'Ако не си се регистрирал в „Чисто“, просто изтрий това писмо.'),
  text: `Потвърди имейла си в „Чисто“: ${url}`,
});
export const resetMail = (name, url) => ({
  subject: 'Нова парола за „Чисто“',
  html: wrap('Смяна на паролата', [`Здравей, ${String(name || '').split(' ')[0] || ''}! Някой (надяваме се ти) поиска нова парола за акаунта ти.`, 'Линкът работи 1 час.'], 'Задай нова парола', url, 'Ако не си ти – не прави нищо, паролата ти остава същата.'),
  text: `Нова парола за „Чисто“ (линкът работи 1 час): ${url}`,
});
export const smsText = (code) => `Чисто: кодът ти е ${code}. Валиден 10 минути.`;
