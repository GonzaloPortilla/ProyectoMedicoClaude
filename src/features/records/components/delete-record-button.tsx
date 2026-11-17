"use client";

import { Trash2 } from "lucide-react";
import { deleteRecordAction } from "@/features/records/actions";
import { SubmitButton } from "@/components/ui/submit-button";

export function DeleteRecordButton({ recordId, title }: { recordId: string; title: string }) {
  return (
    <form
      action={deleteRecordAction}
      onSubmit={(e) => {
        if (!confirm(`¿Eliminar "${title}" y sus archivos? Esta acción no se puede deshacer.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="recordId" value={recordId} />
      <SubmitButton variant="danger" size="sm" pendingLabel="Eliminando…">
        <Trash2 className="size-3.5" /> Eliminar
      </SubmitButton>
    </form>
  );
}
