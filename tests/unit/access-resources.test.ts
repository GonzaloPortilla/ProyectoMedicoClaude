import { describe, expect, it } from "vitest";
import { computeExpiry, formatLinkCode, normalizeLinkCode, parseResourceId } from "@/features/access/resources";
import { approveRequestSchema, linkCodeSchema } from "@/features/access/schemas";
import { buildPermissions } from "@/server/access/requests";

const NOW = new Date("2026-11-17T12:00:00.000Z");

describe("duración de accesos", () => {
  it("calcula 1h, 24h, 7d y 30d", () => {
    expect(computeExpiry("1h", null, NOW)).toEqual(new Date("2026-11-17T13:00:00.000Z"));
    expect(computeExpiry("24h", null, NOW)).toEqual(new Date("2026-11-18T12:00:00.000Z"));
    expect(computeExpiry("7d", null, NOW)).toEqual(new Date("2026-11-24T12:00:00.000Z"));
    expect(computeExpiry("30d", null, NOW)).toEqual(new Date("2026-12-17T12:00:00.000Z"));
  });
  it("permanente = sin vencimiento", () => {
    expect(computeExpiry("permanent", null, NOW)).toBeNull();
  });
  it("fecha personalizada vence al final del día en hora argentina", () => {
    expect(computeExpiry("custom", "2026-11-20", NOW)).toEqual(new Date("2026-11-21T02:59:59.999Z"));
  });
  it("rechaza fechas pasadas, inválidas o demasiado lejanas", () => {
    expect(computeExpiry("custom", "2026-11-01", NOW)).toBe("invalid");
    expect(computeExpiry("custom", "no-fecha", NOW)).toBe("invalid");
    expect(computeExpiry("custom", "2030-01-01", NOW)).toBe("invalid");
  });
});

describe("permisos", () => {
  it("VIEW por recurso; crear y subir sólo en categorías y sólo si se habilitan", () => {
    const rows = buildPermissions({
      resources: [
        { type: "HEALTH_SECTION", key: "ALLERGIES" },
        { type: "RECORD_CATEGORY", key: "laboratorio" },
      ],
      allowCreate: true,
      allowUpload: true,
    });
    expect(rows).toEqual([
      { resourceType: "HEALTH_SECTION", resourceKey: "ALLERGIES", action: "VIEW" },
      { resourceType: "RECORD_CATEGORY", resourceKey: "laboratorio", action: "VIEW" },
      { resourceType: "RECORD_CATEGORY", resourceKey: "laboratorio", action: "CREATE_MEDICAL_ENTRY" },
      { resourceType: "RECORD_CATEGORY", resourceKey: "laboratorio", action: "UPLOAD" },
    ]);
  });
  it("subir archivos sin poder crear informes no otorga UPLOAD", () => {
    const rows = buildPermissions({ resources: [{ type: "RECORD_CATEGORY", key: "laboratorio" }], allowCreate: false, allowUpload: true });
    expect(rows.map((r) => r.action)).toEqual(["VIEW"]);
  });
  it("parsea identificadores de recurso y rechaza los malformados", () => {
    expect(parseResourceId("RECORD_CATEGORY:cardiologia")).toEqual({ type: "RECORD_CATEGORY", key: "cardiologia" });
    expect(parseResourceId("ADMIN:todo")).toBeNull();
    expect(parseResourceId("RECORD_CATEGORY:a:b")).toBeNull();
  });
  it("la aprobación exige al menos un recurso", () => {
    expect(approveRequestSchema.safeParse({ requestId: "x", resources: [], allowCreate: false, allowUpload: false, duration: "1h" }).success).toBe(false);
  });
});

describe("código de vinculación", () => {
  it("normaliza y valida el formato", () => {
    expect(normalizeLinkCode("abcd-2345")).toBe("ABCD2345");
    expect(formatLinkCode("ABCD2345")).toBe("ABCD-2345");
    expect(linkCodeSchema.safeParse("abcd 2345").success).toBe(true);
    expect(linkCodeSchema.safeParse("ABCD-0000").success).toBe(false); // 0 no está en el alfabeto
    expect(linkCodeSchema.safeParse("ABC").success).toBe(false);
  });
});
