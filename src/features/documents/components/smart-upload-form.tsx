"use client";

import { ScanText } from "lucide-react";
import { useActionState, useState } from "react";
import { uploadDocumentAction } from "@/features/documents/actions";
import { initialFormState, type FormState } from "@/lib/form";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { FileDropzone } from "@/features/records/components/file-dropzone";

/** Carga rápida: sólo el archivo. La app lee el documento y propone los datos para revisar. */
export function SmartUploadForm() {
  const [hasFile, setHasFile] = useState(false);
  const [blocked, setBlocked] = useState(false);
  // Tras un error el navegador vacía el selector: se vuelve a montar limpio (attempt).
  const [state, action] = useActionState(async (prev: FormState & { attempt?: number }, formData: FormData) => {
    const result = await uploadDocumentAction(prev, formData);
    setHasFile(false);
    setBlocked(false);
    return { ...result, attempt: (prev.attempt ?? 0) + 1 };
  }, initialFormState as FormState & { attempt?: number });

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <FileDropzone key={state.attempt ?? 0} error={state.fieldErrors?.file} onBlockedChange={setBlocked} onPick={(name) => setHasFile(!!name)} />
      <ul className="space-y-2 text-[13px] text-muted">
        <li className="flex gap-2">
          <ScanText className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
          Leemos el documento (también fotos y PDF escaneados) y te proponemos título, fecha, tipo, institución y los resultados que encontremos.
        </li>
        <li className="pl-6">Nada se guarda como definitivo hasta que lo revises. El archivo original se conserva tal cual.</li>
      </ul>
      <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted">Sólo vos vas a poder ver este archivo.</p>
        <SubmitButton size="lg" pendingLabel="Subiendo…" className="w-full sm:w-auto" disabled={blocked || !hasFile}>
          Subir y analizar
        </SubmitButton>
      </div>
    </form>
  );
}
