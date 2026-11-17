"use client";

import { useActionState } from "react";
import { forgotPasswordAction } from "@/features/auth/actions";
import { initialFormState } from "@/lib/form";
import { Alert } from "@/components/ui/alert";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initialFormState);
  if (state.status === "success") return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="nombre@ejemplo.com"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
        required
        autoFocus
      />
      <SubmitButton size="lg" className="w-full" pendingLabel="Enviando…">
        Enviar enlace
      </SubmitButton>
    </form>
  );
}
