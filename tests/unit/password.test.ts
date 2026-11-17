import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { generateToken, hashToken } from "@/server/auth/tokens";

describe("password hashing", () => {
  it("usa argon2id y nunca guarda el texto plano", async () => {
    const hash = await hashPassword("Secreta123");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain("Secreta123");
  });

  it("verifica la contraseña correcta y rechaza la incorrecta", async () => {
    const hash = await hashPassword("Secreta123");
    expect(await verifyPassword(hash, "Secreta123")).toBe(true);
    expect(await verifyPassword(hash, "secreta123")).toBe(false);
  });

  it("genera hashes distintos para la misma contraseña (salt)", async () => {
    expect(await hashPassword("Secreta123")).not.toBe(await hashPassword("Secreta123"));
  });

  it("devuelve false ante un hash corrupto", async () => {
    expect(await verifyPassword("no-es-un-hash", "x")).toBe(false);
  });
});

describe("tokens", () => {
  it("genera tokens aleatorios de 256 bits", () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
  });

  it("hashea de forma determinista con SHA-256", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toHaveLength(64);
    expect(hashToken("abc")).not.toBe("abc");
  });
});
