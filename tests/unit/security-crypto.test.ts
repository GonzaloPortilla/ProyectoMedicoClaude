import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateRecoveryCodes, generateTotpSecret, hotp, normalizeRecoveryCode, verifyTotp } from "@/server/auth/totp";
import { decrypt, encrypt } from "@/server/crypto/keys";
import { anonymizeIp, describeUserAgent } from "@/server/audit/net";
import { needsRehash } from "@/server/auth/password";
import { signedFileUrl, verifyFileSignature } from "@/server/files/urls";
import { createMfaChallenge, readMfaChallenge } from "@/server/auth/mfa";
import { passwordSchema, registerPatientSchema } from "@/features/auth/schemas";

describe("TOTP (RFC 6238)", () => {
  // Vectores oficiales del Apéndice B (SHA-1, 8 dígitos, secreto "12345678901234567890").
  const secret = Buffer.from("12345678901234567890");
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("t=%i → %s", (t, expected) => {
    expect(hotp(secret, Math.floor(t / 30), 8)).toBe(expected);
  });

  it("base32 ida y vuelta", () => {
    expect(base32Encode(secret)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ").equals(secret)).toBe(true);
  });

  it("acepta ±1 paso de desfasaje y rechaza códigos viejos o ya usados", () => {
    const b32 = generateTotpSecret();
    const now = Date.now();
    const step = Math.floor(now / 30000);
    const code = hotp(base32Decode(b32), step);
    expect(verifyTotp(b32, code, { now })).toBe(step);
    expect(verifyTotp(b32, hotp(base32Decode(b32), step - 1), { now })).toBe(step - 1);
    expect(verifyTotp(b32, hotp(base32Decode(b32), step - 3), { now })).toBeNull();
    expect(verifyTotp(b32, code, { now, lastUsedStep: step })).toBeNull(); // anti-replay
    expect(verifyTotp(b32, "12345", { now })).toBeNull();
  });

  it("los códigos de recuperación son únicos y tienen formato legible", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
    expect(normalizeRecoveryCode("ABCD-EF23")).toBe("abcdef23");
  });
});

describe("cifrado en reposo (AES-256-GCM)", () => {
  it("cifra y descifra; el texto cifrado no contiene el original y cambia en cada uso", () => {
    const a = encrypt("mfa-secret", "SECRETO-TOTP");
    const b = encrypt("mfa-secret", "SECRETO-TOTP");
    expect(a).not.toContain("SECRETO");
    expect(a).not.toBe(b);
    expect(decrypt("mfa-secret", a)).toBe("SECRETO-TOTP");
  });
  it("detecta alteraciones y no descifra con otra clave", () => {
    const enc = encrypt("mfa-secret", "dato");
    const parts = enc.split(".");
    parts[3] = Buffer.from("otro").toString("base64url");
    expect(() => decrypt("mfa-secret", parts.join("."))).toThrow();
    expect(() => decrypt("file-url", enc)).toThrow();
  });
});

describe("enlaces temporales de archivos", () => {
  const url = (u: string) => new URL(u, "http://x").searchParams;
  it("válido sólo para el mismo usuario, archivo y modo, y antes de vencer", () => {
    const now = Date.now();
    const p = url(signedFileUrl("user-a", "file-1", "inline", now));
    const params = { exp: p.get("exp"), sig: p.get("sig"), download: p.get("download") };
    expect(verifyFileSignature("user-a", "file-1", params, now)).toEqual({ ok: true, disposition: "inline" });
    expect(verifyFileSignature("user-b", "file-1", params, now).ok).toBe(false);
    expect(verifyFileSignature("user-a", "file-2", params, now).ok).toBe(false);
    expect(verifyFileSignature("user-a", "file-1", { ...params, download: "1" }, now).ok).toBe(false);
    expect(verifyFileSignature("user-a", "file-1", params, now + 11 * 60 * 1000)).toEqual({ ok: false, reason: "expired" });
    expect(verifyFileSignature("user-a", "file-1", {}, now)).toEqual({ ok: false, reason: "missing" });
  });
});

describe("desafío MFA firmado", () => {
  it("vence a los 5 minutos y no se puede falsificar", () => {
    const now = Date.now();
    const { value } = createMfaChallenge("user-1", now);
    expect(readMfaChallenge(value, now)?.userId).toBe("user-1");
    expect(readMfaChallenge(value, now + 6 * 60 * 1000)).toBeNull();
    expect(readMfaChallenge(value.replace("user-1", "user-2"), now)).toBeNull();
    expect(readMfaChallenge("basura", now)).toBeNull();
  });
});

describe("minimización de datos de red", () => {
  it("anonimiza IPv4 e IPv6", () => {
    expect(anonymizeIp("190.12.34.56")).toBe("190.12.34.0");
    expect(anonymizeIp("::ffff:10.1.2.3")).toBe("10.1.2.0");
    expect(anonymizeIp("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8:85a3::");
    expect(anonymizeIp("unknown")).toBeNull();
  });
  it("describe el dispositivo sin guardar más que el User-Agent truncado", () => {
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/130 Safari/537")).toBe("Chrome en Windows");
  });
});

describe("contraseñas", () => {
  it("detecta hashes que necesitan re-hash", () => {
    expect(needsRehash("$argon2id$v=19$m=19456,t=2,p=1$abc$def")).toBe(false);
    expect(needsRehash("$argon2id$v=19$m=4096,t=1,p=1$abc$def")).toBe(true);
    expect(needsRehash("$2b$10$bcrypt")).toBe(true);
  });
  it("rechaza contraseñas comunes y las que contienen el email", () => {
    expect(passwordSchema.safeParse("Password123").success).toBe(false);
    expect(passwordSchema.safeParse("contraseña123").success).toBe(false);
    const r = registerPatientSchema.safeParse({ firstName: "Ana", lastName: "Paz", email: "anapaz@x.com", password: "anapaz2026", confirmPassword: "anapaz2026", acceptTerms: "on" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["password"]);
  });
});
