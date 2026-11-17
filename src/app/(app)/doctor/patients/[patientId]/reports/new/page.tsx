import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { ReportForm } from "@/features/doctor/components/report-form";
import { creatableCategories, keysWith } from "@/server/access/policy";
import { requireDoctorAccess } from "@/server/doctor/context";
import { listActiveCategories } from "@/server/medical/records";
import { db } from "@/server/db";
import { fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Nuevo informe" };

export default async function NewReportPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const { access } = await requireDoctorAccess(patientId);
  const allowed = new Set(creatableCategories(access));
  if (allowed.size === 0) notFound();
  const [categories, patient] = await Promise.all([
    listActiveCategories(),
    db.patientProfile.findUniqueOrThrow({ where: { id: patientId }, select: { user: { select: { firstName: true, lastName: true } } } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1">
            <Link href={`/doctor/patients/${patientId}`} className="hover:text-ink">
              {fullName(patient.user)}
            </Link>
            <ChevronRight className="size-3.5" /> Nuevo informe
          </span>
        }
        title="Nuevo informe"
        description="Se agrega al historial del paciente, en la categoría que elijas."
      />
      <Card>
        <CardBody className="sm:p-6">
          <ReportForm patientId={patientId} categories={categories.filter((c) => allowed.has(c.slug))} uploadCategories={keysWith(access, "RECORD_CATEGORY", "UPLOAD")} />
        </CardBody>
      </Card>
    </div>
  );
}
