"use client";

import { useActionState } from "react";
import { registerPatientAction } from "@/features/auth/actions";
import { initialFormState } from "@/lib/form";
import { Alert } from "@/components/ui/alert";
import { TextField } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TermsCheckbox } from "@/features/auth/components/terms-checkbox";

export function RegisterPatientForm() {
  const [state, action] = useActionState(registerPatientAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Nombre" name="firstName" autoComplete="given-name" defaultValue={v.firstName} error={e.firstName} required />
        <TextField label="Apellido" name="lastName" autoComplete="family-name" defaultValue={v.lastName} error={e.lastName} required />
      </div>
      <TextField label="Email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="nombre@ejemplo.com" defaultValue={v.email} error={e.email} required />
      <PasswordField label="Contraseña" name="password" autoComplete="new-password" hint="Mínimo 8 caracteres, con letras y números." error={e.password} required />
      <PasswordField label="Repetí la contraseña" name="confirmPassword" autoComplete="new-password" error={e.confirmPassword} required />
      <TermsCheckbox error={e.acceptTerms} defaultChecked={v.acceptTerms === "on"} />
      <SubmitButton size="lg" className="w-full" pendingLabel="Creando cuenta…">
        Crear cuenta
      </SubmitButton>
    </form>
  );
}
