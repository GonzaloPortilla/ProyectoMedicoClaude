import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Clock, EyeOff, FilePlus2, Paperclip } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SourceBadge } from "@/components/status/source-badge";
import { PermissionChips } from "@/features/access/components/permission-chips";
import { formatDateTime, relativeExpiry, summarizePermissions } from "@/features/access/format";
import { HEALTH_SECTIONS } from "@/features/access/resources";
import { BLOOD_TYPE_LABELS, SEVERITY_LABELS } from "@/features/health/config";
import { SEX_LABELS } from "@/features/patient/schemas";
import { CategoryIcon } from "@/features/records/components/category-icon";
import { creatableCategories, viewableSections } from "@/server/access/policy";
import { getPatientOverviewForDoctor, getTimelineForDoctor } from "@/server/access/doctor-view";
import { requireDoctorAccess } from "@/server/doctor/context";
import { listActiveCategories } from "@/server/medical/records";
import { formatDate, fullName, joinUnique } from "@/lib/utils";

export const metadata: Metadata = { title: "Paciente" };

function age(dob: Date) {
  const now = new Date();
  let a = now.getUTCFullYear() - dob.getUTCFullYear();
  if (now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())) a--;
  return a;
}

function List({ items }: { items: { key: string; primary: string; secondary?: string | null; badge?: string | null }[] }) {
  if (!items.length) return <p className="text-sm text-muted">Sin datos cargados.</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((i) => (
        <li key={i.key} className="py-2 first:pt-0 last:pb-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
            {i.primary}
            {i.badge ? <Badge tone="amber">{i.badge}</Badge> : null}
          </p>
          {i.secondary ? <p className="text-[13px] text-muted">{i.secondary}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export default async function DoctorPatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  // Sin acceso vigente → 404. El acceso queda registrado.
  const { access } = await requireDoctorAccess(patientId, { action: "VIEW_PATIENT" });
  const [overview, timeline, categories, grantPerms] = await Promise.all([
    getPatientOverviewForDoctor(access),
    getTimelineForDoctor(access),
    listActiveCategories(),
    Promise.resolve([...access.permissions].map((p) => {
      const [resourceType, resourceKey, action] = p.split(":") as [string, string, string];
      return { resourceType, resourceKey, action };
    })),
  ]);
  const catNames = new Map(categories.map((c) => [c.slug, c.name]));
  const shared = new Set(viewableSections(access));
  const notShared = HEALTH_SECTIONS.filter((s) => !shared.has(s.key)).map((s) => s.label);
  const canCreate = creatableCategories(access).length > 0;
  const g = overview.general;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1">
            <Link href="/doctor" className="hover:text-ink">
              Panel
            </Link>
            <ChevronRight className="size-3.5" /> Paciente
          </span>
        }
        title={fullName(overview.name)}
        action={
          canCreate ? (
            <ButtonLink href={`/doctor/patients/${patientId}/reports/new`}>
              <FilePlus2 className="size-4" /> Crear informe
            </ButtonLink>
          ) : undefined
        }
      />

      <Card className="mb-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="mb-1.5 text-xs font-medium text-muted">Autorizado a ver</p>
            <PermissionChips summary={summarizePermissions(grantPerms, catNames)} />
          </div>
          <p className="flex shrink-0 items-center gap-1.5 text-[13px] text-ink-soft">
            <Clock className="size-3.5" />
            {access.expiresAt ? `${relativeExpiry(access.expiresAt)} · ${formatDateTime(access.expiresAt)}` : "Sin vencimiento"}
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {g ? (
          <Card>
            <CardHeader title="Datos generales" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                {[
                  ["Edad", g.dateOfBirth ? `${age(g.dateOfBirth)} años` : "—"],
                  ["Sexo", g.sex ? SEX_LABELS[g.sex] : "—"],
                  ["Grupo sanguíneo", g.healthProfile?.bloodType ? BLOOD_TYPE_LABELS[g.healthProfile.bloodType] : "—"],
                  ["Altura", g.healthProfile?.heightCm ? `${g.healthProfile.heightCm} cm` : "—"],
                  ["Peso", g.healthProfile?.weightKg ? `${String(g.healthProfile.weightKg).replace(".", ",")} kg` : "—"],
                ].map(([l, v]) => (
                  <div key={l}>
                    <dt className="text-xs text-muted">{l}</dt>
                    <dd className="text-sm font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        ) : null}
        {overview.allergies ? (
          <Card>
            <CardHeader title="Alergias" />
            <CardBody>
              <List items={overview.allergies.map((a) => ({ key: a.id, primary: a.name, secondary: a.reaction, badge: a.severity === "UNKNOWN" ? null : SEVERITY_LABELS[a.severity] }))} />
            </CardBody>
          </Card>
        ) : null}
        {overview.conditions ? (
          <Card>
            <CardHeader title="Antecedentes personales" />
            <CardBody>
              <List
                items={overview.conditions.map((c) => ({
                  key: c.id,
                  primary: c.name,
                  secondary: joinUnique([c.status === "ACTIVE" ? "Activa" : "Resuelta", c.diagnosedOn && `Desde ${formatDate(c.diagnosedOn)}`, c.notes]),
                }))}
              />
            </CardBody>
          </Card>
        ) : null}
        {overview.medications ? (
          <Card>
            <CardHeader title="Medicación" />
            <CardBody>
              <List items={overview.medications.map((m) => ({ key: m.id, primary: m.name, secondary: joinUnique([m.dosage, m.frequency]) || null }))} />
            </CardBody>
          </Card>
        ) : null}
        {overview.familyHistory ? (
          <Card>
            <CardHeader title="Antecedentes familiares" />
            <CardBody>
              <List items={overview.familyHistory.map((f) => ({ key: f.id, primary: f.condition, secondary: f.relationship }))} />
            </CardBody>
          </Card>
        ) : null}
      </div>
      {notShared.length ? (
        <p className="mt-3 flex items-start gap-1.5 text-[13px] text-muted">
          <EyeOff className="mt-0.5 size-3.5 shrink-0" /> No compartido: {notShared.join(", ")}.
        </p>
      ) : null}

      <section className="mt-8" aria-labelledby="timeline-title">
        <h2 id="timeline-title" className="mb-3 text-[17px] font-semibold tracking-tight text-ink">
          Historial autorizado
        </h2>
        {timeline.length === 0 ? (
          <Card className="px-6 py-10 text-center text-sm text-muted">No hay registros en las categorías autorizadas.</Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {timeline.map((t) => {
                const body = (
                  <>
                    <CategoryIcon slug={t.categorySlug} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium break-words text-ink">{t.title}</p>
                      <p className="text-[13px] break-words text-muted">{joinUnique([t.categoryName, t.specialty, t.institution, t.professional])}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[13px] text-ink-soft tabular-nums">{formatDate(t.date)}</span>
                      <div className="flex items-center gap-1.5">
                        {t.fileCount ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted">
                            <Paperclip className="size-3" /> {t.fileCount}
                          </span>
                        ) : null}
                        {t.source !== "PATIENT" ? <SourceBadge source={t.source} /> : null}
                      </div>
                    </div>
                  </>
                );
                return (
                  <li key={t.key}>
                    {t.href ? (
                      <Link href={t.href} className="flex items-center gap-4 px-4 py-3.5 hover:bg-canvas/60 sm:px-6">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-4 px-4 py-3.5 sm:px-6">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>
    </>
  );
}
