"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "@/features/auth/actions";
import { initialFormState } from "@/lib/form";
import { Alert } from "@/components/ui/alert";
import { PasswordField } from "@/components/ui/password-field";
import { SubmitButton } from "@/components/ui/submit-button";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initialFormState);
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <PasswordField label="Nueva contraseña" name="password" autoComplete="new-password" hint="Mínimo 8 caracteres, con letras y números." error={state.fieldErrors?.password} required autoFocus />
      <PasswordField label="Repetí la contraseña" name="confirmPassword" autoComplete="new-password" error={state.fieldErrors?.confirmPassword} required />
      <SubmitButton size="lg" className="w-full" pendingLabel="Guardando…">
        Guardar contraseña
      </SubmitButton>
    </form>
  );
}
