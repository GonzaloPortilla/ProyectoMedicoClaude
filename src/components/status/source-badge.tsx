import type { DataSource } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";

export const SOURCE_LABELS: Record<DataSource, string> = {
  PATIENT: "Cargado por vos",
  DOCTOR: "Cargado por un médico",
  SYSTEM: "Generado por el sistema",
};

const SHORT: Record<DataSource, string> = { PATIENT: "Paciente", DOCTOR: "Médico", SYSTEM: "Sistema" };
const TONES = { PATIENT: "neutral", DOCTOR: "violet", SYSTEM: "blue" } as const;

/** Indica el origen de cada dato médico (quién lo creó). */
export function SourceBadge({ source, long = false }: { source: DataSource; long?: boolean }) {
  return (
    <Badge tone={TONES[source]} title={SOURCE_LABELS[source]}>
      {long ? SOURCE_LABELS[source] : SHORT[source]}
    </Badge>
  );
}
