"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { addHealthEntryAction } from "@/features/health/actions";
import { KIND_CONFIG, type HealthKind } from "@/features/health/config";
import { initialFormState } from "@/lib/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function AddEntryForm({ kind }: { kind: HealthKind }) {
  const config = KIND_CONFIG[kind];
  const [state, action] = useActionState(addHealthEntryAction, initialFormState);
  const [open, setOpen] = useState(false);
  const lastState = useRef(state);
  const today = new Date().toISOString().slice(0, 10);

  // Al guardar con éxito, cerrar el formulario.
  useEffect(() => {
    if (state !== lastState.current && state.status === "success") setOpen(false);
    lastState.current = state;
  }, [state]);

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} className="-ml-2 text-brand-700 hover:text-brand-900">
        <Plus className="size-4" /> {config.addLabel}
      </Button>
    );
  }

  const e = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const v = state.status === "error" ? (state.values ?? {}) : {};

  return (
    <form action={action} className="space-y-4 rounded-xl bg-canvas/70 p-4 ring-1 ring-line ring-inset" noValidate>
      <input type="hidden" name="kind" value={kind} />
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {config.fields.map((f, i) =>
          f.type === "select" ? (
            <SelectField key={f.name} label={f.label} name={`${kind}-${f.name}`} defaultValue={v[f.name] ?? f.options![0]!.value} error={e[f.name]}>
              {f.options!.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectField>
          ) : (
            <TextField
              key={f.name}
              label={f.label}
              name={`${kind}-${f.name}`}
              type={f.type === "date" ? "date" : f.type === "tel" ? "tel" : "text"}
              max={f.type === "date" ? today : undefined}
              maxLength={f.max}
              placeholder={f.placeholder}
              defaultValue={v[f.name]}
              error={e[f.name]}
              optional={!f.required}
              autoFocus={i === 0}
              autoComplete="off"
            />
          ),
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <SubmitButton size="sm" pendingLabel="Guardando…">
          Guardar
        </SubmitButton>
      </div>
    </form>
  );
}
