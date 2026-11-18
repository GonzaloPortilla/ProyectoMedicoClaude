import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { FormState } from "@/lib/form";

export const UNEXPECTED_ERROR = "No pudimos completar la operación. Revisá tu conexión y probá de nuevo en unos minutos.";

/**
 * Envuelve una server action de formulario: si ocurre un error inesperado (base de datos
 * caída, timeout…) devuelve un mensaje amable en lugar de dejar el formulario sin respuesta.
 * Las redirecciones y notFound() de Next se relanzan normalmente.
 * El error se registra sin datos del formulario.
 */
export function withFormErrors<A extends unknown[]>(name: string, fn: (...args: A) => Promise<FormState>) {
  return async (...args: A): Promise<FormState> => {
    try {
      return await fn(...args);
    } catch (error) {
      unstable_rethrow(error);
      console.error(`[action:${name}] Error inesperado`, error instanceof Error ? error.message : "error");
      return { status: "error", message: UNEXPECTED_ERROR };
    }
  };
}
