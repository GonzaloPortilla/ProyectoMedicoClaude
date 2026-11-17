import { requireRole } from "@/server/auth/dal";

// Barrera de autorización del área. Cada página y server action vuelve a verificar el rol.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN");
  return children;
}
