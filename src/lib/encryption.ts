// AES-256-GCM encryption for at-rest secrets (Monday API key, Google refresh
// token, anything else we don't want sitting in plaintext in Neon).
//
// Format of an encrypted blob: `${iv}:${authTag}:${ciphertext}` — all hex.
// IV is 12 bytes (GCM standard). Auth tag is 16 bytes. The key is 32 bytes
// hex from process.env.ENCRYPTION_KEY.
//
// Rotating ENCRYPTION_KEY invalidates anything previously encrypted. Plan
// for a re-encrypt migration before doing that in prod.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("ENCRYPTION_KEY env var is not set");
  }
  if (hex.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be 32 bytes hex (64 chars), got ${hex.length}`,
    );
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(blob: string): string {
  const parts = blob.split(":");
  if (parts.length !== 3) {
    throw new Error("Encrypted blob has invalid format");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
