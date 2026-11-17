import type { Role } from "@/generated/prisma/enums";

export const ROLE_LABELS: Record<Role, string> = {
  PATIENT: "Paciente",
  DOCTOR: "Médico",
  ADMIN: "Administrador",
};

export const ROLE_HOME: Record<Role, string> = {
  PATIENT: "/patient",
  DOCTOR: "/doctor",
  ADMIN: "/admin",
};

// Si un usuario tiene varios roles, se usa este orden para elegir su inicio.
const ROLE_PRIORITY: Role[] = ["ADMIN", "DOCTOR", "PATIENT"];

export function hasRole(roles: readonly Role[], role: Role): boolean {
  return roles.includes(role);
}

export function sortRoles(roles: readonly Role[]): Role[] {
  return ROLE_PRIORITY.filter((r) => roles.includes(r));
}

export function homePathForRoles(roles: readonly Role[]): string {
  const primary = sortRoles(roles)[0];
  return primary ? ROLE_HOME[primary] : "/login";
}
