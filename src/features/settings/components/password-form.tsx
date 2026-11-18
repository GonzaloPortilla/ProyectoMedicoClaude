"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/features/settings/actions";
import { initialFormState } from "@/lib/form";
import { Alert } from "@/components/ui/alert";
import { PasswordField } from "@/components/ui/password-field";
import { SubmitButton } from "@/components/ui/submit-button";

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message ? <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert> : null}
      <PasswordField label="Contraseña actual" name="currentPassword" autoComplete="current-password" error={e.currentPassword} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PasswordField label="Nueva contraseña" name="password" autoComplete="new-password" hint="Mínimo 8 caracteres, con letras y números." error={e.password} />
        <PasswordField label="Repetí la nueva contraseña" name="confirmPassword" autoComplete="new-password" error={e.confirmPassword} />
      </div>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted">Al cambiarla se cierran tus sesiones en otros dispositivos.</p>
        <SubmitButton size="sm" pendingLabel="Guardando…">
          Cambiar contraseña
        </SubmitButton>
      </div>
    </form>
  );
}
