import { z } from "zod";
import { parseDateOnly } from "@/lib/text";
import { HEALTH_KINDS, KIND_CONFIG, type FieldDef, type HealthKind } from "@/features/health/config";

function fieldSchema(field: FieldDef): z.ZodType<unknown> {
  if (field.type === "date") {
    return z
      .string()
      .trim()
      .optional()
      .transform((v, ctx) => {
        if (!v) return null;
        const d = parseDateOnly(v);
        if (!d || d > new Date() || d.getUTCFullYear() < 1900) {
          ctx.addIssue({ code: "custom", message: "Fecha no válida" });
          return z.NEVER;
        }
        return d;
      });
  }
  if (field.type === "select") {
    const values = field.options!.map((o) => o.value) as [string, ...string[]];
    return z.enum(values, { error: "Opción no válida" }).optional().transform((v) => v ?? values[0]);
  }
  const max = field.max ?? 200;
  let base = z.string().trim().max(max, `Máximo ${max} caracteres`);
  if (field.type === "tel") base = base.regex(/^$|^[+\d\s()\-]{6,30}$/, "Teléfono no válido");
  if (field.required) return base.min(1, `Completá "${field.label}"`);
  return base.optional().transform((v) => (v ? v : null));
}

/** Esquema Zod por tipo, derivado de la configuración compartida. */
export const KIND_SCHEMAS = Object.fromEntries(
  HEALTH_KINDS.map((kind) => [kind, z.object(Object.fromEntries(KIND_CONFIG[kind].fields.map((f) => [f.name, fieldSchema(f)])))]),
) as Record<HealthKind, z.ZodObject>;

export const healthKindSchema = z.enum(HEALTH_KINDS as [HealthKind, ...HealthKind[]]);

export const vitalsSchema = z.object({
  bloodType: z
    .enum(["", "A_POS", "A_NEG", "B_POS", "B_NEG", "AB_POS", "AB_NEG", "O_POS", "O_NEG"], { error: "Opción no válida" })
    .transform((v) => (v === "" ? null : v)),
  heightCm: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (!v) return null;
      const n = Number(v.replace(",", "."));
      if (!Number.isInteger(n) || n < 30 || n > 260) {
        ctx.addIssue({ code: "custom", message: "Ingresá la altura en cm (30–260)" });
        return z.NEVER;
      }
      return n;
    }),
  weightKg: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (!v) return null;
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n) || n < 1 || n > 400) {
        ctx.addIssue({ code: "custom", message: "Ingresá el peso en kg (1–400)" });
        return z.NEVER;
      }
      return Math.round(n * 10) / 10;
    }),
});

export const emergencySettingsSchema = z.object({
  showBloodType: z.literal("on").optional().transform(Boolean),
  showAllergies: z.literal("on").optional().transform(Boolean),
  showConditions: z.literal("on").optional().transform(Boolean),
  showMedications: z.literal("on").optional().transform(Boolean),
  showEmergencyContacts: z.literal("on").optional().transform(Boolean),
  additionalNotes: z
    .string()
    .trim()
    .max(500, "Máximo 500 caracteres")
    .optional()
    .transform((v) => (v ? v : null)),
});
