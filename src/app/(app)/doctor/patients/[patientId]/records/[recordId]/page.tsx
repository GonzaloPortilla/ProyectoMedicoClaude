import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink, FileText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SourceBadge } from "@/components/status/source-badge";
import { ReportView } from "@/features/access/components/report-view";
import { CorrectReportForm } from "@/features/doctor/components/correct-report-form";
import { can } from "@/server/access/policy";
import { getRecordForDoctor } from "@/server/access/doctor-view";
import { requireDoctorAccess } from "@/server/doctor/context";
import { audit } from "@/server/audit/log";
import { requestContext } from "@/server/audit/request";
import { signedFileUrl } from "@/server/files/urls";
import { formatBytes } from "@/lib/text";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Registro" };

export default async function DoctorRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string; recordId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ patientId, recordId }, sp] = await Promise.all([params, searchParams]);
  const { user, access } = await requireDoctorAccess(patientId);
  // Sólo se devuelve si es de ESTE paciente y de una categoría autorizada.
  const record = await getRecordForDoctor(access, recordId);
  if (!record) notFound();
  await audit(
    { action: "RECORD_VIEWED", actorType: "DOCTOR", actorUserId: user.id, subjectPatientId: patientId, resourceType: "MEDICAL_RECORD", resourceId: record.id, grantId: access.grantId, metadata: { categorySlug: record.category.slug } },
    await requestContext(),
  );

  const current = record.report?.versions[0];
  const canCorrect = !!record.report && record.report.authorUserId === user.id && can(access, "CREATE_MEDICAL_ENTRY", "RECORD_CATEGORY", record.category.slug);
  const notice = sp.created === "1" ? "Informe guardado en el historial del paciente." : typeof sp.corrected === "string" ? `Corrección guardada (versión ${sp.corrected}). La versión anterior se conserva.` : null;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1">
            <Link href={`/doctor/patients/${patientId}`} className="hover:text-ink">
              Paciente
            </Link>
            <ChevronRight className="size-3.5" /> Registro
          </span>
        }
        title={record.title}
        description={`${record.category.name} · ${formatDate(record.occurredOn)}`}
      />
      {notice ? (
        <Alert tone="success" className="mb-5">
          {notice}
        </Alert>
      ) : null}

      {record.report ? (
        <div className="mb-5 space-y-3">
          <ReportView report={record.report} />
          {canCorrect && current ? <CorrectReportForm patientId={patientId} reportId={record.report.id} title={current.title} content={current.content} /> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Detalle" />
          <CardBody>
            <dl className="divide-y divide-line">
              {(
                [
                  ["Categoría", record.category.name],
                  ["Fecha", formatDate(record.occurredOn)],
                  ["Especialidad", record.specialty],
                  ["Institución", record.institution?.name],
                  ["Profesional", record.professionalName],
                ].filter(([, v]) => v) as [string, string][]
              ).map(([l, v]) => (
                <div key={l} className="flex flex-col gap-0.5 py-2.5 first:pt-0 sm:flex-row sm:gap-3">
                  <dt className="shrink-0 text-sm text-muted sm:w-32">{l}</dt>
                  <dd className="min-w-0 text-sm font-medium break-words text-ink">{v}</dd>
                </div>
              ))}
              <div className="flex items-center gap-3 py-2.5">
                <dt className="shrink-0 text-sm text-muted sm:w-32">Origen</dt>
                <dd>
                  <SourceBadge source={record.source} />
                </dd>
              </div>
            </dl>
            {record.description ? <p className="mt-4 rounded-xl bg-canvas/70 p-3.5 text-sm break-words whitespace-pre-line text-ink-soft">{record.description}</p> : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Archivos" description={record.files.length ? "Cada apertura queda registrada para el paciente." : undefined} />
          <CardBody>
            {record.files.length === 0 ? (
              <p className="text-sm text-muted">Sin archivos adjuntos.</p>
            ) : (
              <ul className="space-y-3">
                {record.files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 ring-inset">
                      <FileText className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{f.originalName}</p>
                      <p className="text-xs text-muted">{formatBytes(f.sizeBytes)}</p>
                    </div>
                    <a href={signedFileUrl(user.id, f.id)} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                      <ExternalLink className="size-3.5" /> Ver
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
