"use client";

import { X } from "lucide-react";
import { rejectRequestAction } from "@/features/access/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function RejectRequestButton({ requestId, doctorName }: { requestId: string; doctorName: string }) {
  return (
    <ConfirmDialog
      title="¿Rechazar la solicitud?"
      description={`${doctorName} no va a poder ver tu información. Si cambiás de idea, puede volver a solicitarlo con un código nuevo.`}
      confirmLabel="Rechazar"
      pendingLabel="Rechazando…"
      action={rejectRequestAction}
      fields={{ requestId }}
      tone="neutral"
      trigger={{
        variant: "secondary",
        content: (
          <>
            <X className="size-3.5" /> Rechazar
          </>
        ),
      }}
    />
  );
}
