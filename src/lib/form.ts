import type { z } from "zod";

/** Estado devuelto por las server actions de formularios. */
export type FormState = {
  status?: "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Valores enviados (nunca contraseñas) para repoblar el formulario. */
  values?: Record<string, string>;
};

export const initialFormState: FormState = {};

export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

const SENSITIVE = /password|token/i;

/** Extrae valores de texto de un FormData, excluyendo campos sensibles. */
export function safeValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !SENSITIVE.test(key) && !key.startsWith("$")) out[key] = value.slice(0, 500);
  }
  return out;
}

export function formObject(formData: FormData, keys: readonly string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of keys) {
    const value = formData.get(key);
    out[key] = typeof value === "string" ? value : undefined;
  }
  return out;
}
