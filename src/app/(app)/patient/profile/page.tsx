import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { PatientProfileForm } from "@/features/patient/components/profile-form";
import { getOwnPatientProfile } from "@/features/patient/queries";
import { requireRole } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Mi perfil" };

export default async function PatientProfilePage() {
  const user = await requireRole("PATIENT");
  const profile = await getOwnPatientProfile(user.id);

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1">
            <Link href="/patient" className="hover:text-ink">
              Inicio
            </Link>
            <ChevronRight className="size-3.5" /> Mi perfil
          </span>
        }
        title="Mi perfil"
        description="Datos básicos de identificación. Sólo vos podés verlos y editarlos."
      />

      <div className="space-y-5">
        <Card>
          <CardHeader title="Cuenta" description="Para modificar estos datos contactá a soporte." />
          <CardBody>
            <div className="grid gap-5 sm:grid-cols-3">
              <TextField label="Nombre" name="account-firstName" defaultValue={user.firstName} disabled />
              <TextField label="Apellido" name="account-lastName" defaultValue={user.lastName} disabled />
              <TextField label="Email" name="account-email" defaultValue={user.email} disabled />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Datos personales" />
          <CardBody>
            <PatientProfileForm
              defaults={{
                dateOfBirth: profile?.dateOfBirth ? profile.dateOfBirth.toISOString().slice(0, 10) : "",
                sex: profile?.sex ?? "",
                documentId: profile?.documentId ?? "",
                phone: profile?.phone ?? "",
                province: profile?.province ?? "",
                city: profile?.city ?? "",
              }}
            />
          </CardBody>
        </Card>

        <p className="flex items-center gap-2 px-1 text-[13px] text-muted">
          <Lock className="size-3.5" /> Tu información está protegida y no se comparte con nadie sin tu autorización.
        </p>
      </div>
    </>
  );
}
