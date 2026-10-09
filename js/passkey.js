// Вход с Face ID / пръстов отпечатък (passkeys). Ключът остава в телефона; сървърът пази само публичната част.
import * as store from './store.js';

const FLAG = 'profitaxi.pk';
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); return Uint8Array.from(atob((s + p).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)); };

export const isApple = () => /iPhone|iPad|Macintosh/.test(navigator.userAgent);
export const faceLabel = () => (isApple() ? 'Face ID' : 'пръстов отпечатък');
export const passkeyOn = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };
const setFlag = (on) => { try { if (on) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG); } catch { /* */ } };
export async function passkeySupported() {
  if (!store.live() || !window.PublicKeyCredential || !navigator.credentials) return false;
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}
const friendly = (e) => (e?.name === 'NotAllowedError' ? 'Отказано или времето изтече. Опитай пак.' : e?.name === 'SecurityError' ? 'Входът с Face ID работи само на profitaxi.vercel.app.' : 'Не стана. Опитай пак.');

// Включване на този телефон (след вход с парола)
export async function enablePasskey() {
  const o = await store.driverCall('pkRegOptions');
  if (o.error) return o;
  const pk = o.publicKey;
  let cred;
  try {
    cred = await navigator.credentials.create({ publicKey: { ...pk, challenge: fromB64u(pk.challenge), user: { ...pk.user, id: fromB64u(pk.user.id) },
      excludeCredentials: (pk.excludeCredentials || []).map((c) => ({ ...c, id: fromB64u(c.id) })) } });
  } catch (e) {
    if (e?.name === 'InvalidStateError') { setFlag(true); return { ok: true, already: true }; }
    return { error: friendly(e) };
  }
  const device = /iPhone/.test(navigator.userAgent) ? 'iPhone' : /iPad/.test(navigator.userAgent) ? 'iPad' : /Android/.test(navigator.userAgent) ? 'Android' : 'компютър';
  const r = await store.driverCall('pkRegister', { device, credential: { id: cred.id, type: cred.type,
    response: { clientDataJSON: b64u(cred.response.clientDataJSON), attestationObject: b64u(cred.response.attestationObject) } } });
  if (!r.error) setFlag(true);
  return r;
}

// Вход: телефонът сам показва кой акаунт и пита за лицето/пръста
export async function loginWithPasskey({ company } = {}) {
  const o = await store.driverCall('pkLoginOptions');
  if (o.error) return o;
  const pk = o.publicKey;
  let cred;
  try { cred = await navigator.credentials.get({ publicKey: { ...pk, challenge: fromB64u(pk.challenge), allowCredentials: [] } }); }
  catch (e) { return { error: friendly(e) }; }
  const r = await store.passkeyLogin({ id: cred.id, type: cred.type, response: {
    clientDataJSON: b64u(cred.response.clientDataJSON), authenticatorData: b64u(cred.response.authenticatorData),
    signature: b64u(cred.response.signature), userHandle: cred.response.userHandle ? b64u(cred.response.userHandle) : null } }, { company });
  if (!r.error) setFlag(true);
  return r;
}

export async function disablePasskey() {
  const r = await store.driverCall('pkRemove');
  if (!r.error) setFlag(false);
  return r;
}

// След вход с парола – веднъж предлагаме да се включи
const ASKED = 'profitaxi.pkAsked';
export async function shouldOffer() {
  if (passkeyOn()) return false;
  try { if (localStorage.getItem(ASKED)) return false; } catch { return false; }
  return passkeySupported();
}
export const markOffered = () => { try { localStorage.setItem(ASKED, '1'); } catch { /* */ } };
