"use client";

import { ShieldOff } from "lucide-react";
import { revokeGrantAction } from "@/features/access/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function RevokeButton({ grantId, doctorName }: { grantId: string; doctorName: string }) {
  return (
    <ConfirmDialog
      title={`¿Revocar el acceso de ${doctorName}?`}
      description="Dejará de ver tu información de inmediato. Los informes que ya creó se conservan en tu historial. Si más adelante querés volver a compartir, podés generar un código nuevo."
      confirmLabel="Revocar acceso"
      pendingLabel="Revocando…"
      action={revokeGrantAction}
      fields={{ grantId }}
      trigger={{
        content: (
          <>
            <ShieldOff className="size-3.5" /> Revocar acceso
          </>
        ),
      }}
    />
  );
}
