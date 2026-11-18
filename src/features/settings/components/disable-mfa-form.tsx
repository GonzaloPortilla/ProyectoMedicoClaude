"use client";

import { useActionState, useState } from "react";
import { disableMfaAction } from "@/features/settings/actions";
import { initialFormState } from "@/lib/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { SubmitButton } from "@/components/ui/submit-button";

export function DisableMfaForm() {
  const [state, action] = useActionState(disableMfaAction, initialFormState);
  const [open, setOpen] = useState(false);
  if (state.status === "success") return <Alert tone="success">{state.message}</Alert>;
  if (!open) {
    return (
      <Button type="button" variant="danger" size="sm" onClick={() => setOpen(true)}>
        Desactivar
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-xl bg-canvas/70 p-4 ring-1 ring-line ring-inset" noValidate>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PasswordField label="Contraseña" name="password" autoComplete="current-password" error={state.fieldErrors?.password} />
        <TextField label="Código actual" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={9} error={state.fieldErrors?.code} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <SubmitButton variant="danger" size="sm" pendingLabel="Desactivando…">
          Desactivar
        </SubmitButton>
      </div>
    </form>
  );
}
