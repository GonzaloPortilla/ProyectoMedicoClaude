import { z } from "zod";
import { parseDateOnly, parseTags } from "@/lib/text";

const optional = (max: number, label = "Este campo") =>
  z
    .string()
    .trim()
    .max(max, `${label} admite como máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : null));

/** Alta rápida de un estudio / registro. Sólo fecha y categoría son obligatorias. */
export const recordInputSchema = z.object({
  title: optional(120, "El título"),
  occurredOn: z
    .string({ error: "Indicá la fecha" })
    .trim()
    .transform((v, ctx) => {
      const d = parseDateOnly(v);
      if (!d) {
        ctx.addIssue({ code: "custom", message: "Indicá una fecha válida" });
        return z.NEVER;
      }
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      if (d > tomorrow || d.getUTCFullYear() < 1900) {
        ctx.addIssue({ code: "custom", message: "La fecha no puede ser futura" });
        return z.NEVER;
      }
      return d;
    }),
  categorySlug: z.string({ error: "Elegí un tipo" }).trim().min(1, "Elegí un tipo").max(60),
  specialty: optional(80, "La especialidad"),
  institution: optional(120, "La institución"),
  professionalName: optional(120, "El profesional"),
  description: optional(2000, "La descripción"),
  tags: z
    .string()
    .max(400)
    .optional()
    .transform((v) => parseTags(v)),
});

export type RecordInput = z.infer<typeof recordInputSchema>;

export const timelineFiltersSchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100).optional().catch(undefined),
  category: z.string().max(60).optional().catch(undefined),
  specialty: z.string().max(80).optional().catch(undefined),
  institution: z.string().max(64).optional().catch(undefined),
});

export type TimelineFilters = z.infer<typeof timelineFiltersSchema>;
