import { z } from "zod";
import { DURATION_OPTIONS, LINK_CODE_ALPHABET, normalizeLinkCode, parseResourceId, type ResourceRef } from "@/features/access/resources";

const codeRegex = new RegExp(`^[${LINK_CODE_ALPHABET}]{8}$`);

export const linkCodeSchema = z
  .string({ error: "Ingresá el código" })
  .transform(normalizeLinkCode)
  .refine((v) => codeRegex.test(v), "El código tiene 8 caracteres (por ejemplo, ABCD-2345)");

const resourceList = z
  .array(z.string().max(80))
  .max(60)
  .transform((ids, ctx) => {
    const out: ResourceRef[] = [];
    for (const id of new Set(ids)) {
      const r = parseResourceId(id);
      if (!r) {
        ctx.addIssue({ code: "custom", message: "Recurso no válido" });
        return z.NEVER;
      }
      out.push(r);
    }
    return out;
  });

export const accessRequestSchema = z.object({
  code: linkCodeSchema,
  message: z
    .string()
    .trim()
    .max(300, "Máximo 300 caracteres")
    .optional()
    .transform((v) => (v ? v : null)),
  requested: resourceList,
});

export const approveRequestSchema = z.object({
  requestId: z.string().min(1).max(64),
  resources: resourceList.refine((r) => r.length > 0, "Elegí al menos un dato para compartir"),
  allowCreate: z.boolean(),
  allowUpload: z.boolean(),
  duration: z.enum(DURATION_OPTIONS.map((o) => o.value) as [string, ...string[]], { error: "Elegí la duración" }),
  customDate: z.string().max(10).optional().nullable(),
});

export const reportSchema = z.object({
  categorySlug: z.string().min(1, "Elegí la categoría").max(60),
  title: z.string().trim().min(3, "Ingresá un título").max(120, "Máximo 120 caracteres"),
  content: z.string().trim().min(10, "El informe es demasiado corto").max(20000, "Máximo 20.000 caracteres"),
});

export const reportCorrectionSchema = z.object({
  reportId: z.string().min(1).max(64),
  title: z.string().trim().min(3, "Ingresá un título").max(120, "Máximo 120 caracteres"),
  content: z.string().trim().min(10, "El informe es demasiado corto").max(20000, "Máximo 20.000 caracteres"),
  changeReason: z.string().trim().min(5, "Indicá el motivo de la corrección").max(300, "Máximo 300 caracteres"),
});
