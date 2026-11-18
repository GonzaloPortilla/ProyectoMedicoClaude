"use client";

import { ChevronDown } from "lucide-react";
import { useActionState, useState } from "react";
import { createRecordAction } from "@/features/records/actions";
import { initialFormState } from "@/lib/form";
import { SPECIALTY_SUGGESTIONS } from "@/lib/specialties";
import { Alert } from "@/components/ui/alert";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FileDropzone } from "@/features/records/components/file-dropzone";

type Option = { slug: string; name: string };

export function RecordForm({ categories, institutions, defaultCategory }: { categories: Option[]; institutions: string[]; defaultCategory?: string }) {
  const [state, action] = useActionState(createRecordAction, initialFormState);
  const [showMore, setShowMore] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const today = new Date().toISOString().slice(0, 10);
  const moreHasErrors = !!(e.title || e.specialty || e.institution || e.professionalName || e.tags);

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      {e.file ? null : state.status === "error" && v.categorySlug ? (
        <Alert tone="info">Por seguridad, si había un archivo seleccionado tenés que volver a elegirlo.</Alert>
      ) : null}

      <FileDropzone error={e.file} onBlockedChange={setBlocked} />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextField label="Fecha" name="occurredOn" type="date" max={today} min="1900-01-01" defaultValue={v.occurredOn ?? today} error={e.occurredOn} required />
        <SelectField label="Tipo" name="categorySlug" defaultValue={v.categorySlug ?? defaultCategory ?? ""} error={e.categorySlug} required>
          <option value="" disabled>
            Elegí una categoría
          </option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </SelectField>
      </div>

      <TextAreaField label="Descripción" name="description" rows={2} maxLength={2000} placeholder="Ej.: Control anual, valores normales." defaultValue={v.description} error={e.description} optional />

      <div className="rounded-2xl ring-1 ring-line ring-inset">
        <button
          type="button"
          onClick={() => setShowMore((s) => !s)}
          aria-expanded={showMore || moreHasErrors}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-ink-soft hover:text-ink"
        >
          Más detalles (opcional)
          <ChevronDown className={`size-4 transition-transform ${showMore || moreHasErrors ? "rotate-180" : ""}`} />
        </button>
        <div className={showMore || moreHasErrors ? "grid grid-cols-1 gap-5 border-t border-line p-4 sm:grid-cols-2" : "hidden"}>
          <TextField label="Título" name="title" maxLength={120} placeholder="Se completa solo si lo dejás vacío" defaultValue={v.title} error={e.title} className="sm:col-span-2" />
          <TextField label="Especialidad" name="specialty" list="specialty-options" maxLength={80} defaultValue={v.specialty} error={e.specialty} />
          <datalist id="specialty-options">
            {SPECIALTY_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <TextField label="Institución" name="institution" list="institution-options" maxLength={120} placeholder="Ej.: Laboratorio Central" defaultValue={v.institution} error={e.institution} />
          <datalist id="institution-options">
            {institutions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <TextField label="Profesional" name="professionalName" maxLength={120} placeholder="Ej.: Dra. Ana Ruiz" defaultValue={v.professionalName} error={e.professionalName} />
          <TextField label="Etiquetas" name="tags" maxLength={400} placeholder="Separadas por coma: control, anual" defaultValue={v.tags} error={e.tags} />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted">Sólo vos vas a poder ver este archivo.</p>
        <SubmitButton size="lg" pendingLabel="Guardando…" className="w-full sm:w-auto" disabled={blocked}>
          Guardar
        </SubmitButton>
      </div>
    </form>
  );
}
