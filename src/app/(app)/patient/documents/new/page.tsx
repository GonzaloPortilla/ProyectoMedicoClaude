import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { RecordForm } from "@/features/records/components/record-form";
import { SmartUploadForm } from "@/features/documents/components/smart-upload-form";
import { cn } from "@/lib/utils";
import { listActiveCategories } from "@/server/medical/records";
import { requirePatient } from "@/server/patient/context";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Subir estudio" };

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { patientId } = await requirePatient();
  const [categories, institutions, { category, manual }] = await Promise.all([
    listActiveCategories(),
    db.institution.findMany({ where: { patientId }, orderBy: { name: "asc" }, select: { name: true } }),
    searchParams,
  ]);
  const defaultCategory = typeof category === "string" && categories.some((c) => c.slug === category) ? category : undefined;
  // Por defecto, carga inteligente. "Completar a mano" mantiene el formulario de siempre.
  const isManual = manual === "1" || !!defaultCategory;
  const tab = (active: boolean) =>
    cn("flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors", active ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink");

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
        description={isManual ? "Elegí el archivo, la fecha y el tipo. Todo lo demás es opcional." : "Subí el archivo y nosotros completamos los datos. Vas a poder revisarlos antes de confirmar."}
      />
      <nav aria-label="Forma de carga" className="mb-4 flex gap-1 rounded-xl bg-ink/[0.04] p-1">
        <Link href="/patient/documents/new" className={tab(!isManual)} aria-current={!isManual ? "page" : undefined}>
          Subir y analizar
        </Link>
        <Link href="/patient/documents/new?manual=1" className={tab(isManual)} aria-current={isManual ? "page" : undefined}>
          Completar a mano
        </Link>
      </nav>
      <Card>
        <CardBody className="sm:p-6">
          {isManual ? <RecordForm categories={categories} institutions={institutions.map((i) => i.name)} defaultCategory={defaultCategory} /> : <SmartUploadForm />}
        </CardBody>
      </Card>
    </div>
  );
}
