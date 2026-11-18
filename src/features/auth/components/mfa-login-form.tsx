"use client";

import Link from "next/link";
import { useActionState } from "react";
import { mfaLoginAction } from "@/features/auth/actions";
import { initialFormState } from "@/lib/form";
import { Alert } from "@/components/ui/alert";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function MfaLoginForm() {
  const [state, action] = useActionState(mfaLoginAction, initialFormState);
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message ? (
        <Alert tone="error">
          {state.message}{" "}
          <Link href="/login" className="font-medium underline">
            Volver
          </Link>
        </Alert>
      ) : null}
      <TextField
        label="Código de verificación"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={9}
        placeholder="123456"
        hint="El código de 6 dígitos de tu app de autenticación, o uno de tus códigos de recuperación."
        error={state.fieldErrors?.code}
        className="[&_input]:font-mono [&_input]:tracking-widest"
        autoFocus
      />
      <SubmitButton size="lg" className="w-full" pendingLabel="Verificando…">
        Verificar
      </SubmitButton>
    </form>
  );
}
