"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/features/auth/actions";
import { initialFormState } from "@/lib/form";
import { Alert } from "@/components/ui/alert";
import { TextField } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { SubmitButton } from "@/components/ui/submit-button";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, initialFormState);
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
      <div className="space-y-2">
        <PasswordField label="Contraseña" name="password" autoComplete="current-password" error={state.fieldErrors?.password} required />
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-[13px] font-medium text-brand-700 hover:text-brand-900">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
      </div>
      <SubmitButton size="lg" className="w-full" pendingLabel="Ingresando…">
        Ingresar
      </SubmitButton>
    </form>
  );
}
