import { describe, expect, it } from "vitest";
import { hasRole, homePathForRoles, sortRoles } from "@/server/auth/roles";

describe("roles", () => {
  it("envía a cada rol a su panel", () => {
    expect(homePathForRoles(["PATIENT"])).toBe("/patient");
    expect(homePathForRoles(["DOCTOR"])).toBe("/doctor");
    expect(homePathForRoles(["ADMIN"])).toBe("/admin");
  });

  it("con varios roles prioriza admin > médico > paciente", () => {
    expect(homePathForRoles(["PATIENT", "DOCTOR"])).toBe("/doctor");
    expect(sortRoles(["PATIENT", "ADMIN", "DOCTOR"])).toEqual(["ADMIN", "DOCTOR", "PATIENT"]);
  });

  it("sin roles vuelve al login", () => {
    expect(homePathForRoles([])).toBe("/login");
  });

  it("hasRole", () => {
    expect(hasRole(["PATIENT"], "ADMIN")).toBe(false);
    expect(hasRole(["PATIENT", "ADMIN"], "ADMIN")).toBe(true);
  });
});
