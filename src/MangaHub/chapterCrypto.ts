import { CHAPTER_CRYPTO_PATH, scheduleRequestSafely } from "./network.ts";

export const ENCRYPTED_PAGES_PREFIX = "enc:v1:";

// Refetch this long before actual expiry so a chapter load never races a key
// that's about to rotate out from under it.
const KEY_EXPIRY_SAFETY_MARGIN_MS = 30_000;
const DEFAULT_KEY_TTL_MS = 5 * 60_000;

export interface ChapterCryptoKey {
  keyId: string;
  keyBytes: ArrayBuffer;
  expiresAt: number;
}

interface ChapterCryptoKeyDto {
  keyId?: string;
  key?: string;
  expiresAt?: number;
}

export interface EncryptedPagesEnvelope {
  keyId: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

/**
 * Parses MangaHub's `enc:v1:<keyId>:<iv>:<authTag>:<ciphertext>` chapter
 * pages format (the latter three fields base64url-encoded: a 12-byte
 * AES-GCM nonce, a 16-byte auth tag, and the ciphertext). Returns null for
 * anything that doesn't match this exact shape.
 */
export function parseEncryptedPagesEnvelope(encoded: string): EncryptedPagesEnvelope | null {
  if (!encoded.startsWith(ENCRYPTED_PAGES_PREFIX)) return null;
  const parts = encoded.split(":");
  if (parts.length !== 6) return null;
  const [, , keyId, iv, authTag, ciphertext] = parts;
  if (!keyId || !iv || !authTag || !ciphertext) return null;
  return { keyId, iv, authTag, ciphertext };
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const standard = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);
  const decoded = Application.base64Decode(padded);
  // Application.base64Decode hands back a UTF8 string when the decoded bytes
  // happen to form valid UTF8 — re-encoding that string is lossless and
  // recovers the exact original bytes.
  return typeof decoded === "string" ? new TextEncoder().encode(decoded).buffer : decoded;
}

/**
 * Fetches MangaHub's current chapter-decryption key from its own site (not
 * the GraphQL API) — the same same-origin endpoint its web frontend calls
 * before decrypting a chapter's `pages` field.
 */
export async function fetchChapterCryptoKey(baseUrl: string): Promise<ChapterCryptoKey> {
  const [response, data] = await scheduleRequestSafely({
    url: `${baseUrl}${CHAPTER_CRYPTO_PATH}`,
    method: "GET",
  });
  if (response.status >= 400) throw new Error("Chapter decryption key unavailable");

  const json = JSON.parse(Application.arrayBufferToUTF8String(data)) as ChapterCryptoKeyDto;
  if (!json.keyId || !json.key) throw new Error("Chapter decryption key unavailable");

  return {
    keyId: json.keyId,
    keyBytes: base64UrlToArrayBuffer(json.key),
    expiresAt:
      typeof json.expiresAt === "number" ? json.expiresAt : Date.now() + DEFAULT_KEY_TTL_MS,
  };
}

export function isChapterCryptoKeyFresh(key: ChapterCryptoKey | null): key is ChapterCryptoKey {
  return key !== null && key.expiresAt > Date.now() + KEY_EXPIRY_SAFETY_MARGIN_MS;
}

/**
 * Decrypts a `pages` field already identified as `enc:v1:...` back into the
 * original `{"p":...,"i":[...]}` JSON MangaHub used to send unencrypted.
 */
export async function decryptChapterPages(encoded: string, key: ChapterCryptoKey): Promise<string> {
  const envelope = parseEncryptedPagesEnvelope(encoded);
  if (!envelope) throw new Error("Unrecognized chapter pages encoding");
  if (envelope.keyId !== key.keyId) throw new Error("Chapter decryption key mismatch");

  const iv = base64UrlToArrayBuffer(envelope.iv);
  const authTag = base64UrlToArrayBuffer(envelope.authTag);
  const ciphertext = base64UrlToArrayBuffer(envelope.ciphertext);

  // WebCrypto's AES-GCM expects ciphertext and auth tag concatenated.
  const combined = new Uint8Array(ciphertext.byteLength + authTag.byteLength);
  combined.set(new Uint8Array(ciphertext), 0);
  combined.set(new Uint8Array(authTag), ciphertext.byteLength);

  const cryptoKey = await crypto.subtle.importKey("raw", key.keyBytes, { name: "AES-GCM" }, false, [
    "decrypt",
  ]);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    cryptoKey,
    combined.buffer,
  );
  return Application.arrayBufferToUTF8String(plainBuf);
}
