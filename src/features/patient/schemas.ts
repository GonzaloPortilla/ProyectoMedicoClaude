import { z } from "zod";
import { PROVINCE_CODES } from "@/lib/jurisdictions";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Usá como máximo ${max} caracteres`)
    .transform((v) => (v === "" ? null : v));

export const patientProfileSchema = z.object({
  dateOfBirth: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        ctx.addIssue({ code: "custom", message: "Ingresá una fecha válida" });
        return z.NEVER;
      }
      const date = new Date(`${v}T00:00:00.000Z`);
      const now = new Date();
      if (Number.isNaN(date.getTime()) || date > now || date.getUTCFullYear() < 1900) {
        ctx.addIssue({ code: "custom", message: "Ingresá una fecha válida" });
        return z.NEVER;
      }
      return date;
    }),
  sex: z
    .enum(["", "FEMALE", "MALE", "OTHER", "UNDISCLOSED"], { error: "Elegí una opción válida" })
    .transform((v) => (v === "" ? null : v)),
  documentId: optionalText(20).refine((v) => v === null || /^[A-Za-z0-9.\-]+$/.test(v), "Documento no válido"),
  phone: optionalText(30).refine((v) => v === null || /^[+\d\s()\-]{6,30}$/.test(v), "Teléfono no válido"),
  province: z
    .union([z.literal(""), z.enum(PROVINCE_CODES)], { error: "Elegí una provincia válida" })
    .transform((v) => (v === "" ? null : v)),
  city: optionalText(80),
});

export type PatientProfileInput = z.infer<typeof patientProfileSchema>;

export const SEX_LABELS = {
  FEMALE: "Femenino",
  MALE: "Masculino",
  OTHER: "Otro",
  UNDISCLOSED: "Prefiero no decirlo",
} as const;
