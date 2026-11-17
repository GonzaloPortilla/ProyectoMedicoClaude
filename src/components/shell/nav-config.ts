import type { Role } from "@/generated/prisma/enums";

export type NavIcon = "home" | "profile" | "doctor" | "overview" | "users" | "verify";
export type NavItem = { href: string; label: string; icon: NavIcon; exact?: boolean };
export type NavSection = { role: Role; title: string; items: NavItem[] };

// Sólo controla qué enlaces se muestran: la autorización real está en cada layout/página.
export const NAV_SECTIONS: NavSection[] = [
  {
    role: "PATIENT",
    title: "Paciente",
    items: [
      { href: "/patient", label: "Inicio", icon: "home", exact: true },
      { href: "/patient/profile", label: "Mi perfil", icon: "profile" },
    ],
  },
  {
    role: "DOCTOR",
    title: "Profesional",
    items: [{ href: "/doctor", label: "Panel profesional", icon: "doctor", exact: true }],
  },
  {
    role: "ADMIN",
    title: "Administración",
    items: [
      { href: "/admin", label: "Resumen", icon: "overview", exact: true },
      { href: "/admin/users", label: "Usuarios", icon: "users" },
      { href: "/admin/doctors", label: "Médicos", icon: "verify" },
    ],
  },
];
