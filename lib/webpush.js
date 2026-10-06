// Web Push без външни пакети: VAPID подпис (ES256) + криптиране aes128gcm (RFC 8291 / RFC 8188).
// Работи с Apple (iPhone, добавено на началния екран), Google и Mozilla.
import crypto from 'node:crypto';

const b64u = (b) => Buffer.from(b).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s), 'base64url');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

function vapidKey() {
  const raw = process.env.VAPID_JWK;
  if (!raw) return null;
  const jwk = JSON.parse(raw);
  return { key: crypto.createPrivateKey({ key: jwk, format: 'jwk' }), pub: b64u(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)])) };
}
export const pushReady = () => !!process.env.VAPID_JWK;

function vapidAuth(endpoint, v) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: process.env.VAPID_SUBJECT || 'mailto:admin@profitaxi.bg' }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: v.key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${v.pub}`;
}

function encrypt(sub, payload) {
  const uaPub = fromB64u(sub.keys.p256dh), auth = fromB64u(sub.keys.auth);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPub);
  const salt = crypto.randomBytes(16);
  const prkKey = hmac(auth, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = asPub.length;
  return Buffer.concat([head, asPub, ct]);
}

// Праща едно известие. Връща HTTP статуса (404/410 = абонаментът вече не важи).
export async function sendPush(sub, data) {
  const v = vapidKey(); if (!v || !sub?.endpoint) return 0;
  const body = encrypt(sub, JSON.stringify(data));
  const r = await fetch(sub.endpoint, { method: 'POST', headers: { Authorization: vapidAuth(sub.endpoint, v), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high' }, body });
  return r.status;
}
export const _test = { encrypt };
