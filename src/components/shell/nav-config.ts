import type { Role } from "@/generated/prisma/enums";

export type NavIcon = "home" | "profile" | "doctor" | "overview" | "users" | "verify" | "health" | "documents" | "history" | "emergency" | "search" | "doctors" | "activity" | "settings";
/** `primary`: aparece en la barra inferior del celular (máx. 4); el resto va en "Más". */
export type NavItem = { href: string; label: string; icon: NavIcon; exact?: boolean; exclude?: string[]; primary?: boolean };
/** `role` ausente = sección visible para cualquier usuario autenticado. */
export type NavSection = { role?: Role; key: string; title: string; items: NavItem[] };

// Sólo controla qué enlaces se muestran: la autorización real está en cada layout/página.
export const NAV_SECTIONS: NavSection[] = [
  {
    role: "PATIENT",
    key: "patient",
    title: "Paciente",
    items: [
      { href: "/patient", label: "Inicio", icon: "home", exact: true, primary: true },
      { href: "/patient/health", label: "Mi salud", icon: "health", primary: true },
      { href: "/patient/documents", label: "Estudios", icon: "documents", primary: true },
      { href: "/patient/history", label: "Historial", icon: "history" },
      { href: "/patient/doctors", label: "Mis médicos", icon: "doctors", primary: true },
      { href: "/patient/emergency", label: "Emergencia", icon: "emergency" },
      { href: "/patient/search", label: "Buscar", icon: "search" },
    ],
  },
  {
    role: "DOCTOR",
    key: "doctor",
    title: "Profesional",
    items: [{ href: "/doctor", label: "Pacientes", icon: "doctor", primary: true }],
  },
  {
    role: "ADMIN",
    key: "admin",
    title: "Administración",
    items: [
      { href: "/admin", label: "Resumen", icon: "overview", exact: true, primary: true },
      { href: "/admin/users", label: "Usuarios", icon: "users", primary: true },
      { href: "/admin/doctors", label: "Médicos", icon: "verify", primary: true },
    ],
  },
  {
    key: "account",
    title: "Cuenta",
    items: [
      { href: "/settings/activity", label: "Actividad", icon: "activity" },
      { href: "/settings", label: "Configuración", icon: "settings", exclude: ["/settings/activity"] },
    ],
  },
];
