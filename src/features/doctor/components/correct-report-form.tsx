"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";
import { correctReportAction } from "@/features/access/actions";
import { initialFormState } from "@/lib/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function CorrectReportForm({ patientId, reportId, title, content }: { patientId: string; reportId: string; title: string; content: string }) {
  const [state, action] = useActionState(correctReportAction, initialFormState);
  const [open, setOpen] = useState(false);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  if (!open && state.status !== "error") {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" /> Corregir informe
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-4 rounded-2xl bg-canvas/70 p-4 ring-1 ring-line ring-inset sm:p-5" noValidate>
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="reportId" value={reportId} />
      <p className="text-sm font-medium text-ink">Nueva versión del informe</p>
      <p className="text-[13px] text-muted">La versión actual se conserva y el paciente verá ambas.</p>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <TextField label="Título" name="title" maxLength={120} defaultValue={v.title ?? title} error={e.title} />
      <TextAreaField label="Informe" name="content" rows={10} maxLength={20000} defaultValue={v.content ?? content} error={e.content} />
      <TextField label="Motivo de la corrección" name="changeReason" maxLength={300} placeholder="Ej.: Error en la dosis indicada" defaultValue={v.changeReason} error={e.changeReason} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <SubmitButton size="sm" pendingLabel="Guardando…">
          Guardar corrección
        </SubmitButton>
      </div>
    </form>
  );
}
