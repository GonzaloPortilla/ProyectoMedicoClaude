import type { Metadata } from "next";
import { LineChart, Plus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { EvolutionView } from "@/features/documents/components/evolution-view";
import { getIndicatorSeries, listIndicators } from "@/server/documents/measurements";
import { requirePatient } from "@/server/patient/context";
import { signedFileUrl } from "@/server/files/urls";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Evolución" };

export default async function EvolutionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, patientId } = await requirePatient();
  const { i } = await searchParams;
  const indicators = await listIndicators({ patientId });
  const selected = indicators.find((x) => x.key === i) ?? indicators[0];

  if (!selected) {
    const toReview = await db.documentExtraction.findFirst({ where: { patientId, status: "READY_FOR_REVIEW" }, orderBy: { createdAt: "desc" }, select: { recordId: true } });
    return (
      <>
        <PageHeader title="Evolución" description="Tus resultados de laboratorio a lo largo del tiempo." />
        <Card>
          <EmptyState
            icon={LineChart}
            title="Todavía no hay resultados confirmados"
            description="Cuando subas un análisis, leemos los resultados y te los mostramos para que los confirmes. Los confirmados aparecen acá, ordenados en el tiempo."
            action={
              toReview ? (
                <ButtonLink href={`/patient/documents/${toReview.recordId}/review`} size="sm">
                  <Sparkles className="size-4" /> Revisar resultados detectados
                </ButtonLink>
              ) : (
                <ButtonLink href="/patient/documents/new" size="sm">
                  <Plus className="size-4" /> Subir un análisis
                </ButtonLink>
              )
            }
          />
        </Card>
      </>
    );
  }

  const series = await getIndicatorSeries({ patientId }, selected.key);
  return (
    <>
      <PageHeader title="Evolución" description="Tus resultados confirmados a lo largo del tiempo. Tocá un punto para abrir el estudio del que proviene." />
      <EvolutionView
        viewer="patient"
        indicators={indicators}
        selected={selected}
        series={series}
        indicatorHref={(key) => `/patient/evolution?i=${encodeURIComponent(key)}`}
        recordHref={(id) => `/patient/documents/${id}`}
        fileHref={(fileId) => signedFileUrl(user.id, fileId)}
      />
    </>
  );
}
