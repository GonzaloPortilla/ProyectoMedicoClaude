"use client";

import { useActionState } from "react";
import { updateNameAction } from "@/features/settings/actions";
import { initialFormState } from "@/lib/form";
import { Alert } from "@/components/ui/alert";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function NameForm({ firstName, lastName }: { firstName: string; lastName: string }) {
  const [state, action] = useActionState(updateNameAction, initialFormState);
  const v = { firstName, lastName, ...state.values };
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message ? <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Nombre" name="firstName" autoComplete="given-name" defaultValue={v.firstName} error={state.fieldErrors?.firstName} />
        <TextField label="Apellido" name="lastName" autoComplete="family-name" defaultValue={v.lastName} error={state.fieldErrors?.lastName} />
      </div>
      <div className="flex justify-end">
        <SubmitButton size="sm" pendingLabel="Guardando…">
          Guardar
        </SubmitButton>
      </div>
    </form>
  );
}
