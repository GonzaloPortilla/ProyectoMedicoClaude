"use client";

import { useActionState } from "react";
import { updateMeasurementAction } from "@/features/documents/actions";
import { initialFormState } from "@/lib/form";
import { Alert } from "@/components/ui/alert";
import { SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export type MeasurementEditDefaults = { id: string; originalName: string; conceptCode: string; valueText: string; unit: string; refLow: string; refHigh: string };

/** Corrección de un resultado. El nombre del documento se muestra pero no se edita. */
export function MeasurementEditForm({ m, concepts }: { m: MeasurementEditDefaults; concepts: { code: string; displayName: string }[] }) {
  const [state, action] = useActionState(updateMeasurementAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const id = (k: string) => `${k}-${m.id}`;
  return (
    <form action={action} className="mt-3 space-y-3 rounded-xl bg-canvas/70 p-3.5" noValidate>
      <input type="hidden" name="measurementId" value={m.id} />
      {state.message ? <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert> : null}
      <p className="text-[13px] text-muted">
        En el documento figura como <span className="font-medium text-ink">«{m.originalName}»</span>. Ese nombre se conserva siempre.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectField id={id("concept")} label="Indicador" name="conceptCode" defaultValue={v.conceptCode ?? m.conceptCode} error={e.conceptCode} className="sm:col-span-2">
          <option value="">Usar el nombre del documento</option>
          {concepts.map((c) => (
            <option key={c.code} value={c.code}>
              {c.displayName}
            </option>
          ))}
        </SelectField>
        <TextField id={id("value")} label="Valor" name="valueText" maxLength={40} defaultValue={v.valueText ?? m.valueText} error={e.valueText} required />
        <TextField id={id("unit")} label="Unidad" name="unit" maxLength={30} defaultValue={v.unit ?? m.unit} error={e.unit} />
        <TextField id={id("low")} label="Referencia mínima" name="refLow" inputMode="decimal" maxLength={20} defaultValue={v.refLow ?? m.refLow} error={e.refLow} />
        <TextField id={id("high")} label="Referencia máxima" name="refHigh" inputMode="decimal" maxLength={20} defaultValue={v.refHigh ?? m.refHigh} error={e.refHigh} />
      </div>
      <div className="flex justify-end">
        <SubmitButton size="sm" pendingLabel="Guardando…">
          Guardar y confirmar
        </SubmitButton>
      </div>
    </form>
  );
}
