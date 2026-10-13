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

// Писмата – в стила на „Чисто“: тъмна лента с логото, бяла карта, голям бутон, зелени акценти.
// Таблици и вградени стилове – така изглеждат еднакво в Gmail, Outlook и Apple Mail.
const SITE = () => (process.env.PUBLIC_URL || 'https://chistoapp.vercel.app').replace(/\/$/, '');
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function mailHtml({ pre = '', title, lines = [], btn, url, note, foot }) {
  const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  return `<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#EFEBEA;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFEBEA"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="background:#231F20;border-radius:24px 24px 0 0;padding:22px 28px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle"><img src="${SITE()}/icons/icon-192.png" width="40" height="40" alt="" style="display:block;border-radius:11px"></td>
    <td style="vertical-align:middle;padding-left:12px;font-family:${F};font-size:24px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px">Чисто</td>
  </tr></table>
</td></tr>
<tr><td style="background:#22C55E;height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
<tr><td style="background:#FFFFFF;border-radius:0 0 24px 24px;padding:30px 28px 28px;font-family:${F};color:#1D1B1B">
  <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-0.3px">${title}</h1>
  ${lines.map((l) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#3A3536">${l}</p>`).join('')}
  ${btn ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="background:#231F20;border-radius:999px">
    <a href="${url}" style="display:inline-block;padding:16px 30px;font-family:${F};font-size:17px;font-weight:700;color:#FFFFFF;text-decoration:none">${btn} &rarr;</a></td></tr></table>` : ''}
  ${note ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr><td style="background:#F1F8F3;border-left:4px solid #22C55E;border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.45;color:#1F4D2A">${note}</td></tr></table>` : ''}
  ${btn ? `<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#8C8586">Бутонът не работи? Копирай линка в браузъра:<br><a href="${url}" style="color:#8C8586;word-break:break-all">${url}</a></p>` : ''}
</td></tr>
<tr><td style="padding:18px 20px 6px;text-align:center;font-family:${F};font-size:12px;line-height:1.6;color:#8C8586">
  ${foot || 'Получаваш това писмо, защото имаш акаунт в „Чисто“.'}<br>
  <a href="${SITE()}" style="color:#5E5859;text-decoration:none;font-weight:600">Чисто</a> · колко ти остава след смяната
</td></tr>
</table></td></tr></table></body></html>`;
}
const first = (n) => esc(String(n || '').split(' ')[0]);
export const verifyMail = (name, url) => ({
  subject: 'Потвърди имейла си в „Чисто“',
  html: mailHtml({ pre: 'Едно натискане и си готов.', title: `Здравей, ${first(name) || 'шофьоре'}!`, lines: ['Благодарим, че се регистрира в <b>„Чисто“</b>. Остава само да потвърдиш имейла си.', 'Така ще можеш сам да си смениш паролата, ако я забравиш.'], btn: 'Потвърди имейла', url, note: 'Линкът работи 7 дни.', foot: 'Не си се регистрирал в „Чисто“? Просто изтрий това писмо.' }),
  text: `Здравей! Потвърди имейла си в „Чисто“: ${url}`,
});
export const resetMail = (name, url) => ({
  subject: 'Нова парола за „Чисто“',
  html: mailHtml({ pre: 'Линкът работи 1 час.', title: 'Смяна на паролата', lines: [`Здравей, ${first(name)}! Получихме молба за нова парола за акаунта ти.`, 'Натисни бутона и задай нова парола.'], btn: 'Задай нова парола', url, note: 'Линкът работи <b>1 час</b> и само веднъж.', foot: 'Не си ти? Не прави нищо – паролата ти остава същата.' }),
  text: `Нова парола за „Чисто“ (линкът работи 1 час): ${url}`,
});
export const testMail = () => ({
  subject: 'Проба от „Чисто“',
  html: mailHtml({ pre: 'Имейлите работят.', title: 'Имейлите работят ✓', lines: ['Това е пробно писмо от админ панела на „Чисто“. Ако го виждаш, връзката с Brevo е наред.'], note: 'Провери и дали не е отишло в „Спам“ – ако е там, маркирай го „Не е спам“.' }),
  text: 'Имейлите от „Чисто“ работят.',
});
export const smsText = (code) => `Чисто: кодът ти е ${code}. Валиден 10 минути.`;
