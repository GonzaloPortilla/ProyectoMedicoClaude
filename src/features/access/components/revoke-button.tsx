"use client";

import { ShieldOff } from "lucide-react";
import { revokeGrantAction } from "@/features/access/actions";
import { SubmitButton } from "@/components/ui/submit-button";

export function RevokeButton({ grantId, doctorName }: { grantId: string; doctorName: string }) {
  return (
    <form
      action={revokeGrantAction}
      onSubmit={(e) => {
        if (!confirm(`¿Revocar el acceso de ${doctorName}? Dejará de ver tu información de inmediato.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="grantId" value={grantId} />
      <SubmitButton variant="danger" size="sm" pendingLabel="Revocando…">
        <ShieldOff className="size-3.5" /> Revocar acceso
      </SubmitButton>
    </form>
  );
}
