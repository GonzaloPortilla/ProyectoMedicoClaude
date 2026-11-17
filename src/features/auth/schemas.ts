import { z } from "zod";
import { JURISDICTION_CODES } from "@/lib/jurisdictions";

// Esquemas compartidos entre cliente (UX) y servidor (fuente de verdad).

export const emailSchema = z
  .string({ error: "Ingresá tu email" })
  .trim()
  .toLowerCase()
  .max(254, "El email es demasiado largo")
  .pipe(z.email({ error: "Ingresá un email válido" }));

export const passwordSchema = z
  .string({ error: "Ingresá una contraseña" })
  .min(8, "Usá al menos 8 caracteres")
  .max(128, "Usá como máximo 128 caracteres")
  .regex(/[A-Za-zÀ-ÿ]/, "Incluí al menos una letra")
  .regex(/\d/, "Incluí al menos un número");

const nameSchema = (label: string) =>
  z
    .string({ error: `Ingresá tu ${label}` })
    .trim()
    .min(1, `Ingresá tu ${label}`)
    .max(80, `El ${label} es demasiado largo`)
    .regex(/^[\p{L}\p{M}' .-]+$/u, `El ${label} contiene caracteres no válidos`);

const passwordConfirmation = <T extends { password: string; confirmPassword: string }>(data: T, ctx: z.RefinementCtx) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Las contraseñas no coinciden" });
  }
};

export const loginSchema = z.object({
  email: emailSchema,
  // En login no se aplican reglas de complejidad: sólo se verifica.
  password: z.string().min(1, "Ingresá tu contraseña").max(128),
});

export const registerPatientSchema = z
  .object({
    firstName: nameSchema("nombre"),
    lastName: nameSchema("apellido"),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal("on", { error: "Necesitás aceptar los términos para continuar" }),
  })
  .superRefine(passwordConfirmation);

export const registerDoctorSchema = z
  .object({
    firstName: nameSchema("nombre"),
    lastName: nameSchema("apellido"),
    email: emailSchema,
    specialty: z.string().trim().min(2, "Ingresá tu especialidad").max(80, "La especialidad es demasiado larga"),
    licenseNumber: z
      .string()
      .trim()
      .toUpperCase()
      .min(2, "Ingresá tu número de matrícula")
      .max(20, "La matrícula es demasiado larga")
      .regex(/^[A-Z0-9.\- ]+$/, "La matrícula sólo puede contener letras, números, puntos y guiones"),
    jurisdiction: z.enum(JURISDICTION_CODES, { error: "Elegí la jurisdicción de tu matrícula" }),
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal("on", { error: "Necesitás aceptar los términos para continuar" }),
  })
  .superRefine(passwordConfirmation);

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine(passwordConfirmation);

export type RegisterPatientInput = z.infer<typeof registerPatientSchema>;
export type RegisterDoctorInput = z.infer<typeof registerDoctorSchema>;
