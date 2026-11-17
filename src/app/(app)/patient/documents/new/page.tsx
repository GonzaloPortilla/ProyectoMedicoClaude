import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { RecordForm } from "@/features/records/components/record-form";
import { listActiveCategories } from "@/server/medical/records";
import { requirePatient } from "@/server/patient/context";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Subir estudio" };

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { patientId } = await requirePatient();
  const [categories, institutions, { category }] = await Promise.all([
    listActiveCategories(),
    db.institution.findMany({ where: { patientId }, orderBy: { name: "asc" }, select: { name: true } }),
    searchParams,
  ]);
  const defaultCategory = typeof category === "string" && categories.some((c) => c.slug === category) ? category : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1">
            <Link href="/patient/documents" className="hover:text-ink">
              Mis estudios
            </Link>
            <ChevronRight className="size-3.5" /> Nuevo
          </span>
        }
        title="Subir estudio"
        description="Elegí el archivo, la fecha y el tipo. Todo lo demás es opcional."
      />
      <Card>
        <CardBody className="sm:p-6">
          <RecordForm categories={categories} institutions={institutions.map((i) => i.name)} defaultCategory={defaultCategory} />
        </CardBody>
      </Card>
    </div>
  );
}
