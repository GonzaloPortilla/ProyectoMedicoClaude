import { ShieldOff } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Sin acceso vigente al paciente (revocado, vencido, nunca otorgado) o registro no autorizado.
 * El mensaje es el mismo en todos los casos para no revelar si el paciente o el registro existen.
 */
export default function DoctorPatientNotFound() {
  return (
    <Card className="mx-auto mt-6 max-w-xl">
      <EmptyState
        icon={ShieldOff}
        title="No tenés un acceso vigente"
        description="El acceso a esta información no está disponible: puede haber vencido, el paciente puede haberlo revocado o no autorizó esta categoría. Para volver a acceder, pedile un código nuevo al paciente."
        action={<ButtonLink href="/doctor">Volver a mis pacientes</ButtonLink>}
      />
    </Card>
  );
}
