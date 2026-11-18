import { PageHeader } from "@/components/page-header";
import { SettingsTabs } from "@/features/settings/components/settings-tabs";
import { requireUser } from "@/server/auth/dal";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <PageHeader eyebrow="Tu cuenta" title="Configuración y privacidad" description="Revisá tus datos, tu seguridad, quién accede a tu información y la actividad de tu cuenta." />
      <SettingsTabs />
      {children}
    </>
  );
}
