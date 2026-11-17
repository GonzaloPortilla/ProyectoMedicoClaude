"use client";

import { Check, X } from "lucide-react";
import { useActionState } from "react";
import { decideDoctorVerificationAction } from "@/features/admin/actions";
import { initialFormState } from "@/lib/form";
import type { DoctorVerificationStatus } from "@/generated/prisma/enums";
import { Alert } from "@/components/ui/alert";
import { TextAreaField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function DoctorDecisionForm({ doctorProfileId, status, returnTo }: { doctorProfileId: string; status: DoctorVerificationStatus; returnTo: string }) {
  const [approveState, approve] = useActionState(decideDoctorVerificationAction, initialFormState);
  const [rejectState, reject] = useActionState(decideDoctorVerificationAction, initialFormState);
  const message = rejectState.message ?? approveState.message;
  const tone = (rejectState.message ? rejectState.status : approveState.status) === "error" ? "error" : "success";
  const common = (
    <>
      <input type="hidden" name="doctorProfileId" value={doctorProfileId} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );

  return (
    <div className="space-y-3">
      {message ? <Alert tone={tone}>{message}</Alert> : null}
      <div className="flex flex-wrap items-start gap-2">
        {status !== "VERIFIED" ? (
          <form action={approve}>
            {common}
            <input type="hidden" name="decision" value="VERIFIED" />
            <input type="hidden" name="note" value="" />
            <SubmitButton size="sm" pendingLabel="Aprobando…">
              <Check className="size-3.5" /> Aprobar
            </SubmitButton>
          </form>
        ) : null}
        {status !== "REJECTED" ? (
          <details className="group w-full sm:w-auto" open={!!rejectState.fieldErrors?.note}>
            <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-xl border border-red-200 bg-surface px-3 text-[13px] font-medium text-red-700 select-none hover:bg-red-50 [&::-webkit-details-marker]:hidden">
              <X className="size-3.5" /> {status === "VERIFIED" ? "Revocar verificación" : "Rechazar"}
            </summary>
            <form action={reject} className="mt-3 space-y-3 sm:w-96">
              {common}
              <input type="hidden" name="decision" value="REJECTED" />
              <TextAreaField
                label="Motivo (visible para el profesional)"
                name="note"
                rows={3}
                maxLength={500}
                placeholder="Ej.: La matrícula no figura en el registro de la jurisdicción indicada."
                error={rejectState.fieldErrors?.note}
                required
              />
              <SubmitButton size="sm" variant="danger" pendingLabel="Guardando…">
                Confirmar
              </SubmitButton>
            </form>
          </details>
        ) : null}
      </div>
    </div>
  );
}
