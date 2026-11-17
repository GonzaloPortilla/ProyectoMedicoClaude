import type { DoctorVerificationStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";

export const VERIFICATION_LABELS: Record<DoctorVerificationStatus, string> = {
  PENDING: "Pendiente",
  VERIFIED: "Verificado",
  REJECTED: "Rechazado",
};

const TONES = { PENDING: "amber", VERIFIED: "brand", REJECTED: "red" } as const;

export function VerificationBadge({ status }: { status: DoctorVerificationStatus }) {
  return (
    <Badge tone={TONES[status]} dot>
      {VERIFICATION_LABELS[status]}
    </Badge>
  );
}
