import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LineChart } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { EvolutionView } from "@/features/documents/components/evolution-view";
import { getIndicatorSeriesForDoctor, listIndicatorsForDoctor } from "@/server/documents/measurements";
import { requireDoctorAccess } from "@/server/doctor/context";
import { audit } from "@/server/audit/log";
import { requestContext } from "@/server/audit/request";
import { signedFileUrl } from "@/server/files/urls";
import { db } from "@/server/db";
import { fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Evolución del paciente" };

export default async function DoctorEvolutionPage({ params, searchParams }: { params: Promise<{ patientId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ patientId }, { i }] = await Promise.all([params, searchParams]);
  // Acceso vigente obligatorio (revocado / vencido → 404 y queda registrado).
  const { user, access } = await requireDoctorAccess(patientId);
  // Sólo mediciones confirmadas de categorías con permiso VIEW: el filtro está en la consulta.
  const indicators = await listIndicatorsForDoctor(access);
  const selected = indicators.find((x) => x.key === i) ?? indicators[0];
  const patient = await db.patientProfile.findUniqueOrThrow({ where: { id: patientId }, select: { user: { select: { firstName: true, lastName: true } } } });
  const series = selected ? await getIndicatorSeriesForDoctor(access, selected.key) : [];
  await audit(
    { action: "MEASUREMENTS_VIEWED", actorType: "DOCTOR", actorUserId: user.id, subjectPatientId: patientId, resourceType: "PATIENT", resourceId: patientId, grantId: access.grantId, metadata: { resultCount: series.length } },
    await requestContext(),
  );

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1">
            <Link href={`/doctor/patients/${patientId}`} className="hover:text-ink">
              {fullName(patient.user)}
            </Link>
            <ChevronRight className="size-3.5" /> Evolución
          </span>
        }
        title="Evolución de resultados"
        description="Resultados confirmados por el paciente, de las categorías que te autorizó."
      />
      {selected ? (
        <EvolutionView
          viewer="doctor"
          indicators={indicators}
          selected={selected}
          series={series}
          indicatorHref={(key) => `/doctor/patients/${patientId}/evolution?i=${encodeURIComponent(key)}`}
          recordHref={(id) => `/doctor/patients/${patientId}/records/${id}`}
          fileHref={(fileId) => signedFileUrl(user.id, fileId)}
        />
      ) : (
        <Card>
          <EmptyState icon={LineChart} title="No hay resultados para mostrar" description="El paciente no tiene resultados confirmados en las categorías que te autorizó." />
        </Card>
      )}
    </>
  );
}
