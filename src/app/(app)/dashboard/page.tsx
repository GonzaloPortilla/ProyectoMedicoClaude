import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/dal";
import { homePathForRoles } from "@/server/auth/roles";

// Punto de entrada tras el login: envía a cada usuario al panel de su rol principal.
export default async function DashboardPage() {
  const user = await requireUser();
  redirect(homePathForRoles(user.roles));
}
