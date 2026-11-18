import { z } from "zod";
import { recordInputSchema } from "@/features/records/schemas";

const optional = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} admite como máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : null));

/** Datos del estudio que el paciente confirma después del análisis automático. */
export const documentDetailsSchema = z.object({
  title: z.string({ error: "Indicá un título" }).trim().min(2, "Indicá un título").max(120, "El título admite como máximo 120 caracteres"),
  occurredOn: recordInputSchema.shape.occurredOn,
  categorySlug: recordInputSchema.shape.categorySlug,
  specialty: optional(80, "La especialidad"),
  institution: optional(120, "La institución"),
  professionalName: optional(120, "El profesional"),
});

const numberText = z
  .string()
  .trim()
  .max(20)
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d[\d.,]*$/.test(v), "Ingresá un número");

/** Corrección manual de un resultado detectado. El nombre original no se edita. */
export const measurementEditSchema = z.object({
  measurementId: z.string().min(1).max(64),
  conceptCode: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => (v ? v : null)),
  valueText: z.string({ error: "Indicá el valor" }).trim().min(1, "Indicá el valor").max(40, "Máximo 40 caracteres"),
  unit: optional(30, "La unidad"),
  refLow: numberText,
  refHigh: numberText,
});

export const SHA256_RE = /^[a-f0-9]{64}$/;
