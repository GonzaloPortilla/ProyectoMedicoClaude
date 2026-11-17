"use client";

import { useActionState } from "react";
import { registerDoctorAction } from "@/features/auth/actions";
import { initialFormState } from "@/lib/form";
import { JURISDICTIONS } from "@/lib/jurisdictions";
import { SPECIALTY_SUGGESTIONS } from "@/lib/specialties";
import { Alert } from "@/components/ui/alert";
import { SelectField, TextField } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TermsCheckbox } from "@/features/auth/components/terms-checkbox";

export function RegisterDoctorForm() {
  const [state, action] = useActionState(registerDoctorAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}

      <fieldset className="space-y-5">
        <legend className="mb-4 text-xs font-semibold tracking-wide text-muted uppercase">Datos personales</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Nombre" name="firstName" autoComplete="given-name" defaultValue={v.firstName} error={e.firstName} required />
          <TextField label="Apellido" name="lastName" autoComplete="family-name" defaultValue={v.lastName} error={e.lastName} required />
        </div>
        <TextField label="Email profesional" name="email" type="email" autoComplete="email" inputMode="email" placeholder="nombre@ejemplo.com" defaultValue={v.email} error={e.email} required />
      </fieldset>

      <fieldset className="space-y-5 border-t border-line pt-6">
        <legend className="sr-only">Datos profesionales</legend>
        <p aria-hidden className="text-xs font-semibold tracking-wide text-muted uppercase">Datos profesionales</p>
        <TextField
          label="Especialidad"
          name="specialty"
          list="specialty-suggestions"
          placeholder="Ej.: Cardiología"
          defaultValue={v.specialty}
          error={e.specialty}
          required
        />
        <datalist id="specialty-suggestions">
          {SPECIALTY_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <div className="grid gap-5 sm:grid-cols-[1fr_1.4fr]">
          <TextField label="Matrícula" name="licenseNumber" placeholder="Ej.: 123456" defaultValue={v.licenseNumber} error={e.licenseNumber} required />
          <SelectField label="Provincia / jurisdicción" name="jurisdiction" defaultValue={v.jurisdiction ?? ""} error={e.jurisdiction} required>
            <option value="" disabled>
              Elegí una opción
            </option>
            {JURISDICTIONS.map((j) => (
              <option key={j.code} value={j.code}>
                {j.name}
              </option>
            ))}
          </SelectField>
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-line pt-6">
        <legend className="sr-only">Seguridad</legend>
        <PasswordField label="Contraseña" name="password" autoComplete="new-password" hint="Mínimo 8 caracteres, con letras y números." error={e.password} required />
        <PasswordField label="Repetí la contraseña" name="confirmPassword" autoComplete="new-password" error={e.confirmPassword} required />
      </fieldset>

      <TermsCheckbox error={e.acceptTerms} defaultChecked={v.acceptTerms === "on"} />
      <SubmitButton size="lg" className="w-full" pendingLabel="Enviando solicitud…">
        Solicitar cuenta profesional
      </SubmitButton>
    </form>
  );
}
