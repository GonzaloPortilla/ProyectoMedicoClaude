"use client";

import { Sparkles } from "lucide-react";
import { useActionState } from "react";
import { confirmDocumentDetailsAction } from "@/features/documents/actions";
import { initialFormState } from "@/lib/form";
import { SPECIALTY_SUGGESTIONS } from "@/lib/specialties";
import { Alert } from "@/components/ui/alert";
import { SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

type Field = { value: string; detected: boolean };
export type DetailsDefaults = { title: Field; occurredOn: Field; categorySlug: Field; specialty: Field; institution: Field; professionalName: Field };

function Hint({ show }: { show: boolean }) {
  return show ? (
    <span className="mt-1 inline-flex items-center gap-1 text-xs text-brand-700">
      <Sparkles className="size-3" aria-hidden /> Detectado automáticamente
    </span>
  ) : null;
}

/** Datos propuestos del estudio, todos editables antes de confirmar. */
export function DetailsForm({ recordId, defaults, categories, institutions, submitLabel = "Confirmar datos" }: { recordId: string; defaults: DetailsDefaults; categories: { slug: string; name: string }[]; institutions: string[]; submitLabel?: string }) {
  const [state, action] = useActionState(confirmDocumentDetailsAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const today = new Date().toISOString().slice(0, 10);
  const val = (k: keyof DetailsDefaults) => v[k] ?? defaults[k].value;

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="recordId" value={recordId} />
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <div>
        <TextField label="Título" name="title" maxLength={120} defaultValue={val("title")} error={e.title} required />
        <Hint show={defaults.title.detected} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <TextField label="Fecha del estudio" name="occurredOn" type="date" max={today} min="1900-01-01" defaultValue={val("occurredOn")} error={e.occurredOn} required />
          <Hint show={defaults.occurredOn.detected} />
        </div>
        <div>
          <SelectField label="Tipo" name="categorySlug" defaultValue={val("categorySlug")} error={e.categorySlug} required>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <Hint show={defaults.categorySlug.detected} />
        </div>
        <div>
          <TextField label="Institución" name="institution" list="review-institutions" maxLength={120} defaultValue={val("institution")} error={e.institution} />
          <datalist id="review-institutions">
            {institutions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <Hint show={defaults.institution.detected} />
        </div>
        <div>
          <TextField label="Profesional" name="professionalName" maxLength={120} defaultValue={val("professionalName")} error={e.professionalName} />
          <Hint show={defaults.professionalName.detected} />
        </div>
        <div className="sm:col-span-2">
          <TextField label="Especialidad" name="specialty" list="review-specialties" maxLength={80} defaultValue={val("specialty")} error={e.specialty} />
          <datalist id="review-specialties">
            {SPECIALTY_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <Hint show={defaults.specialty.detected} />
        </div>
      </div>
      <div className="flex justify-end border-t border-line pt-4">
        <SubmitButton pendingLabel="Guardando…" className="w-full sm:w-auto">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
