"use client";

import { useActionState } from "react";
import { createReportAction } from "@/features/access/actions";
import { initialFormState } from "@/lib/form";
import { Alert } from "@/components/ui/alert";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FileDropzone } from "@/features/records/components/file-dropzone";

export function ReportForm({ patientId, categories, uploadCategories }: { patientId: string; categories: { slug: string; name: string }[]; uploadCategories: string[] }) {
  const [state, action] = useActionState(createReportAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="patientId" value={patientId} />
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <SelectField label="Categoría" name="categorySlug" defaultValue={v.categorySlug ?? (categories.length === 1 ? categories[0]!.slug : "")} error={e.categorySlug} required>
          <option value="" disabled>
            Elegí una categoría
          </option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Título" name="title" maxLength={120} placeholder="Ej.: Informe de control cardiológico" defaultValue={v.title} error={e.title} required />
      </div>
      <TextAreaField label="Informe" name="content" rows={12} maxLength={20000} placeholder="Motivo de consulta, hallazgos, diagnóstico, indicaciones…" defaultValue={v.content} error={e.content} required />
      {uploadCategories.length ? (
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium text-ink-soft">Adjunto (opcional)</p>
          <FileDropzone error={e.file} />
          <p className="text-[12px] text-muted">El paciente te autorizó a adjuntar archivos en: {categories.filter((c) => uploadCategories.includes(c.slug)).map((c) => c.name).join(", ")}.</p>
        </div>
      ) : null}
      <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted">Al guardar, el informe queda firmado con tu nombre y matrícula. Las correcciones conservan la versión anterior.</p>
        <SubmitButton size="lg" pendingLabel="Guardando…" className="w-full shrink-0 sm:w-auto">
          Guardar informe
        </SubmitButton>
      </div>
    </form>
  );
}
