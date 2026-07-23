import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
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

  it("throws when the ciphertext payload has been tampered with", () => {
    const ciphertext = encrypt("sensitive-value");
    const [iv, authTag, data] = ciphertext.split(":");

    // Corrupt one character of the ciphertext portion so decryption fails auth-tag verification.
    const corruptedData =
      data.slice(0, -1) + (data.slice(-1) === "A" ? "B" : "A");
    const tampered = [iv, authTag, corruptedData].join(":");

    expect(() => decrypt(tampered)).toThrow();
  });
});

describe("getKey() failure paths", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.APP_ENCRYPTION_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.APP_ENCRYPTION_KEY;
    } else {
      process.env.APP_ENCRYPTION_KEY = originalKey;
    }
  });

  it("throws from encrypt when APP_ENCRYPTION_KEY is unset", () => {
    delete process.env.APP_ENCRYPTION_KEY;
    expect(() => encrypt("plaintext")).toThrow("APP_ENCRYPTION_KEY is not set");
  });

  it("throws from decrypt when APP_ENCRYPTION_KEY is unset", () => {
    const ciphertext = encrypt("plaintext");
    delete process.env.APP_ENCRYPTION_KEY;
    expect(() => decrypt(ciphertext)).toThrow("APP_ENCRYPTION_KEY is not set");
  });

  it("throws when APP_ENCRYPTION_KEY does not decode to exactly 32 bytes", () => {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(16, 7).toString("base64");
    expect(() => encrypt("plaintext")).toThrow(
      "APP_ENCRYPTION_KEY must decode to exactly 32 bytes"
    );
  });
});
