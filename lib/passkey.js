// Вход с Face ID / пръстов отпечатък (WebAuthn „passkeys“) без външни пакети.
// Разчита атестацията (CBOR + COSE ключ) при включване и проверява подписа при вход.
import crypto from 'node:crypto';

export const b64u = (b) => Buffer.from(b).toString('base64url');
export const fromB64u = (s) => Buffer.from(String(s || ''), 'base64url');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest();

// Минимален CBOR декодер (стига за attestationObject и COSE ключове)
export function cbor(buf, start = 0) {
  let i = start;
  const rd = () => {
    const ib = buf[i++]; const mt = ib >> 5, ai = ib & 31;
    let len = ai;
    if (ai === 24) len = buf[i++];
    else if (ai === 25) { len = buf.readUInt16BE(i); i += 2; }
    else if (ai === 26) { len = buf.readUInt32BE(i); i += 4; }
    else if (ai === 27) { len = Number(buf.readBigUInt64BE(i)); i += 8; }
    else if (ai > 27 && mt !== 7) throw new Error('cbor: неподдържана дължина');
    switch (mt) {
      case 0: return len;
      case 1: return -1 - len;
      case 2: { const v = buf.subarray(i, i + len); i += len; return v; }
      case 3: { const v = buf.toString('utf8', i, i + len); i += len; return v; }
      case 4: { const a = []; for (let k = 0; k < len; k++) a.push(rd()); return a; }
      case 5: { const m = new Map(); for (let k = 0; k < len; k++) { const key = rd(); m.set(key, rd()); } return m; }
      case 6: return rd();
      case 7: return ai === 20 ? false : ai === 21 ? true : null;
      default: throw new Error('cbor: тип ' + mt);
    }
  };
  const value = rd();
  return { value, end: i };
}

export function parseAuthData(ad) {
  const out = { rpIdHash: ad.subarray(0, 32), flags: ad[32], counter: ad.readUInt32BE(33) };
  out.up = !!(out.flags & 0x01); out.uv = !!(out.flags & 0x04);
  if (out.flags & 0x40) {
    let i = 37 + 16;
    const len = ad.readUInt16BE(i); i += 2;
    out.credId = ad.subarray(i, i + len); i += len;
    out.cose = cbor(ad, i).value;
  }
  return out;
}

// COSE → JWK (ES256 или RS256)
export function coseToJwk(m) {
  const kty = m.get(1), alg = m.get(3);
  if (kty === 2) return { alg: alg || -7, jwk: { kty: 'EC', crv: 'P-256', x: b64u(m.get(-2)), y: b64u(m.get(-3)) } };
  if (kty === 3) return { alg: alg || -257, jwk: { kty: 'RSA', n: b64u(m.get(-1)), e: b64u(m.get(-2)) } };
  throw new Error('Неподдържан ключ');
}

function checkClient(clientDataJSON, type, challenge, origins) {
  const c = JSON.parse(Buffer.from(clientDataJSON).toString('utf8'));
  if (c.type !== type) throw new Error('Грешен тип');
  if (c.challenge !== challenge) throw new Error('Грешно предизвикателство');
  if (!origins.includes(c.origin)) throw new Error('Грешен адрес: ' + c.origin);
  return c;
}

// Включване: връща { credId, jwk, alg, counter }
export function verifyRegistration({ clientDataJSON, attestationObject }, { challenge, rpId, origins }) {
  const cd = fromB64u(clientDataJSON);
  checkClient(cd, 'webauthn.create', challenge, origins);
  const att = cbor(fromB64u(attestationObject)).value;
  const ad = parseAuthData(Buffer.from(att.get('authData')));
  if (!ad.rpIdHash.equals(sha256(rpId))) throw new Error('Грешен сайт');
  if (!ad.up || !ad.uv) throw new Error('Без потвърждение с лице или пръст');
  if (!ad.credId || !ad.cose) throw new Error('Липсва ключ');
  const { jwk, alg } = coseToJwk(ad.cose);
  crypto.createPublicKey({ key: jwk, format: 'jwk' }); // проверка, че ключът е валиден
  return { credId: b64u(ad.credId), jwk, alg, counter: ad.counter };
}

// Вход: проверява подписа с пазения ключ; връща новия брояч
export function verifyLogin({ clientDataJSON, authenticatorData, signature }, cred, { challenge, rpId, origins }) {
  const cd = fromB64u(clientDataJSON);
  checkClient(cd, 'webauthn.get', challenge, origins);
  const adBuf = fromB64u(authenticatorData);
  const ad = parseAuthData(adBuf);
  if (!ad.rpIdHash.equals(sha256(rpId))) throw new Error('Грешен сайт');
  if (!ad.up || !ad.uv) throw new Error('Без потвърждение с лице или пръст');
  const data = Buffer.concat([adBuf, sha256(cd)]);
  const key = crypto.createPublicKey({ key: cred.jwk, format: 'jwk' });
  const ok = cred.alg === -257
    ? crypto.verify('sha256', data, { key, padding: crypto.constants.RSA_PKCS1_PADDING }, fromB64u(signature))
    : crypto.verify('sha256', data, { key, dsaEncoding: 'der' }, fromB64u(signature));
  if (!ok) throw new Error('Невалиден подпис');
  if (ad.counter && cred.counter && ad.counter <= cred.counter) throw new Error('Повторен подпис');
  return { counter: ad.counter };
}
