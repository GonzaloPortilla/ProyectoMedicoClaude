"use client";

import { Trash2 } from "lucide-react";
import { deleteRecordAction } from "@/features/records/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function DeleteRecordButton({ recordId, title }: { recordId: string; title: string }) {
  return (
    <ConfirmDialog
      title="¿Eliminar este estudio?"
      description={
        <>
          Se van a eliminar <strong className="font-medium text-ink">«{title}»</strong> y sus archivos. Esta acción no se puede deshacer.
        </>
      }
      confirmLabel="Eliminar"
      pendingLabel="Eliminando…"
      action={deleteRecordAction}
      fields={{ recordId }}
      trigger={{
        content: (
          <>
            <Trash2 className="size-3.5" /> Eliminar
          </>
        ),
      }}
    />
  );
}
