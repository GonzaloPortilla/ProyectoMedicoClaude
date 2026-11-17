import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { rejectRequestAction } from "@/features/access/actions";
import { ApproveForm } from "@/features/access/components/approve-form";
import { DoctorIdentity } from "@/features/access/components/doctor-identity";
import { formatDateTime } from "@/features/access/format";
import { HEALTH_SECTIONS, SENSITIVE_CATEGORIES } from "@/features/access/resources";
import { getPendingRequestForPatient } from "@/server/access/requests";
import { listActiveCategories } from "@/server/medical/records";
import { requirePatient } from "@/server/patient/context";

export const metadata: Metadata = { title: "Solicitud de acceso" };

export default async function AccessRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { patientId } = await requirePatient();
  const { requestId } = await params;
  const request = await getPendingRequestForPatient(patientId, requestId);
  if (!request) notFound();
  const categories = await listActiveCategories();

  // Preselección: lo que pidió el médico (nunca categorías sensibles) o, si no pidió nada, datos básicos.
  const fallback = HEALTH_SECTIONS.filter((s) => s.key !== "FAMILY_HISTORY").map((s) => `HEALTH_SECTION:${s.key}`);
  const requested = request.requestedResources.filter((r) => !SENSITIVE_CATEGORIES.has(r.replace("RECORD_CATEGORY:", "")));
  const preselected = requested.length ? requested : fallback;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1">
            <Link href="/patient/doctors" className="hover:text-ink">
              Mis médicos
            </Link>
            <ChevronRight className="size-3.5" /> Solicitud
          </span>
        }
        title="Solicitud de acceso"
      />

      <Card className="mb-5 p-5 sm:p-6">
        <DoctorIdentity doctor={request.doctor} size="lg" />
        <p className="mt-4 text-[15px] text-ink">solicita acceso a tu información médica.</p>
        {request.message ? <p className="mt-3 rounded-xl bg-canvas/70 px-4 py-3 text-sm break-words text-ink-soft">“{request.message}”</p> : null}
        <p className="mt-3 text-[13px] text-muted">
          Recibida el {formatDateTime(request.createdAt)} · vence el {formatDateTime(request.expiresAt)} si no respondés.
        </p>
        <form action={rejectRequestAction} className="mt-4 border-t border-line pt-4">
          <input type="hidden" name="requestId" value={request.id} />
          <SubmitButton variant="secondary" size="sm" pendingLabel="Rechazando…">
            <X className="size-3.5" /> Rechazar solicitud
          </SubmitButton>
        </form>
      </Card>

      <Card>
        <CardBody className="sm:p-6">
          <ApproveForm requestId={request.id} categories={categories} preselected={preselected} />
        </CardBody>
      </Card>
    </div>
  );
}
