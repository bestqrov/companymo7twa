import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "@/lib/crypto";

beforeAll(() => {
  // 32-byte key, base64-encoded — matches the format documented in .env.example.
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("encrypt/decrypt", () => {
  it("round-trips a plaintext string", () => {
    const plaintext = "AIzaSyD-example-youtube-api-key";
    const ciphertext = encrypt(plaintext);

    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext on repeated calls", () => {
    const plaintext = "same-input";
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });
});
