import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/server/db";
import { hashToken } from "@/server/auth/tokens";
import { LINK_CODE_ALPHABET } from "@/features/access/resources";

export const LINK_CODE_TTL_MS = 60 * 60 * 1000; // 60 minutos

function randomCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)];
  return out;
}

/** Genera un código nuevo e invalida los anteriores sin usar. El código en claro sólo se devuelve acá. */
export async function generateLinkCode(patientId: string): Promise<{ code: string; expiresAt: Date }> {
  const code = randomCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  await db.$transaction([
    db.patientLinkCode.deleteMany({ where: { patientId, usedAt: null } }),
    db.patientLinkCode.create({ data: { patientId, codeHash: hashToken(code), expiresAt } }),
  ]);
  return { code, expiresAt };
}

export async function cancelLinkCodes(patientId: string): Promise<void> {
  await db.patientLinkCode.deleteMany({ where: { patientId, usedAt: null } });
}

export async function getActiveLinkCode(patientId: string) {
  return db.patientLinkCode.findFirst({
    where: { patientId, usedAt: null, expiresAt: { gt: new Date() } },
    select: { expiresAt: true, createdAt: true },
  });
}

/**
 * Consume el código de forma atómica (un solo uso). Devuelve el patientId o null si el
 * código no existe, venció o ya se usó.
 */
export async function consumeLinkCode(code: string, usedByUserId: string): Promise<string | null> {
  const record = await db.patientLinkCode.findUnique({ where: { codeHash: hashToken(code) } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) return null;
  const { count } = await db.patientLinkCode.updateMany({
    where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date(), usedByUserId },
  });
  return count === 1 ? record.patientId : null;
}
