import { z } from "zod";

export const doctorDecisionSchema = z
  .object({
    doctorProfileId: z.string().min(1).max(64),
    decision: z.enum(["VERIFIED", "REJECTED"]),
    note: z
      .string()
      .trim()
      .max(500, "Usá como máximo 500 caracteres")
      .transform((v) => (v === "" ? null : v)),
  })
  .superRefine((data, ctx) => {
    if (data.decision === "REJECTED" && !data.note) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "Indicá el motivo del rechazo" });
    }
  });

export const doctorStatusFilterSchema = z.enum(["ALL", "PENDING", "VERIFIED", "REJECTED"]).catch("PENDING");
