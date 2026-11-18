import "server-only";
import { db } from "@/server/db";

/** Conceptos activos (pocos y casi inmutables): se cachean unos minutos por proceso. */
let cache: { at: number; rows: { id: string; code: string; displayName: string; aliases: string[]; defaultUnit: string | null }[] } | null = null;

export async function loadConcepts() {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.rows;
  const rows = await db.measurementConcept.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" }, select: { id: true, code: true, displayName: true, aliases: true, defaultUnit: true } });
  cache = { at: Date.now(), rows };
  return rows;
}
