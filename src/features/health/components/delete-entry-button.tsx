"use client";

import { Trash2 } from "lucide-react";
import { deleteHealthEntryAction } from "@/features/health/actions";
import type { HealthKind } from "@/features/health/config";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function DeleteEntryButton({ kind, id, label }: { kind: HealthKind; id: string; label: string }) {
  return (
    <ConfirmDialog
      title="¿Eliminar este dato?"
      description={
        <>
          Vas a eliminar <strong className="font-medium text-ink">«{label}»</strong> de Mi salud.
        </>
      }
      confirmLabel="Eliminar"
      pendingLabel="Eliminando…"
      action={deleteHealthEntryAction}
      fields={{ kind, id }}
      trigger={{
        bare: true,
        ariaLabel: `Eliminar ${label}`,
        className: "flex size-9 items-center justify-center rounded-lg text-muted transition hover:bg-red-50 hover:text-red-600",
        content: <Trash2 className="size-4" />,
      }}
    />
  );
}
