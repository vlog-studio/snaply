import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

let key: Buffer | null = null;

/** 임의 문자열 시크릿을 sha256으로 32바이트 키로 정규화. */
export function initCrypto(secret: string): void {
  key = createHash('sha256').update(secret).digest();
}

function getKey(): Buffer {
  if (!key) {
    throw new Error('crypto가 초기화되지 않았습니다. initCrypto(secret)를 먼저 호출하세요.');
  }
  return key;
}

/** AES-256-GCM 암호화. 반환 형식: base64(iv).base64(tag).base64(ciphertext) */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ct.toString('base64')}`;
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, ctB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error('암호문 형식이 올바르지 않습니다.');
  }
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

// ── OAuth state (CSRF 방지) ────────────────────────────
// 형식: base64url(payloadJSON).hmac  — payload에 userId + nonce.

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(data: string): string {
  return b64url(createHmac('sha256', getKey()).update(data).digest());
}

export function encodeState(userId: string): string {
  const payload = b64url(Buffer.from(JSON.stringify({ u: userId, n: randomBytes(8).toString('hex') })));
  return `${payload}.${sign(payload)}`;
}

/** state 검증 후 userId 반환. 위조/변조 시 null. */
export function decodeState(state: string): string | null {
  const [payload, mac] = state.split('.');
  if (!payload || !mac) {
    return null;
  }
  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  try {
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof json.u === 'string' ? json.u : null;
  } catch {
    return null;
  }
}

// ── Meta 데이터 삭제 확인 코드 ─────────────────────────
// 형식: base64url({ t: 처리 시각(ms), n: nonce }).hmac — 저장하지 않고 서명으로 진위를 확인한다.
// 삭제는 요청 안에서 끝나므로, 진짜 코드는 곧 "그 시각에 처리됐다"는 뜻이다.

export function encodeDeletionCode(processedAt: Date): string {
  const payload = b64url(
    Buffer.from(JSON.stringify({ t: processedAt.getTime(), n: randomBytes(6).toString('hex') })),
  );
  return `${payload}.${sign(payload)}`;
}

/** 확인 코드 검증 후 처리 시각 반환. 위조/변조 시 null. */
export function decodeDeletionCode(code: string): Date | null {
  const [payload, mac] = code.split('.');
  if (!payload || !mac) {
    return null;
  }
  const a = Buffer.from(mac);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  try {
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof json.t === 'number' ? new Date(json.t) : null;
  } catch {
    return null;
  }
}
