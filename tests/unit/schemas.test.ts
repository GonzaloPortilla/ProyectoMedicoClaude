import { describe, expect, it } from "vitest";
import { loginSchema, registerDoctorSchema, registerPatientSchema } from "@/features/auth/schemas";
import { doctorDecisionSchema } from "@/features/admin/schemas";
import { patientProfileSchema } from "@/features/patient/schemas";

const patient = {
  firstName: "Ana",
  lastName: "López",
  email: "  Ana@Ejemplo.COM ",
  password: "Segura123",
  confirmPassword: "Segura123",
  acceptTerms: "on",
};

describe("registerPatientSchema", () => {
  it("normaliza el email", () => {
    const r = registerPatientSchema.parse(patient);
    expect(r.email).toBe("ana@ejemplo.com");
  });

  it("exige contraseña con letras y números, y que coincidan", () => {
    expect(registerPatientSchema.safeParse({ ...patient, password: "corta1", confirmPassword: "corta1" }).success).toBe(false);
    expect(registerPatientSchema.safeParse({ ...patient, password: "sololetras", confirmPassword: "sololetras" }).success).toBe(false);
    const mismatch = registerPatientSchema.safeParse({ ...patient, confirmPassword: "Otra1234" });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });

  it("exige aceptar los términos", () => {
    expect(registerPatientSchema.safeParse({ ...patient, acceptTerms: undefined }).success).toBe(false);
  });

  it("rechaza nombres con caracteres no válidos", () => {
    expect(registerPatientSchema.safeParse({ ...patient, firstName: "<script>" }).success).toBe(false);
  });
});

describe("registerDoctorSchema", () => {
  const doctor = { ...patient, specialty: "Cardiología", licenseNumber: "mn 1234", jurisdiction: "AR-C" };

  it("acepta datos válidos y normaliza la matrícula", () => {
    const r = registerDoctorSchema.parse(doctor);
    expect(r.licenseNumber).toBe("MN 1234");
  });

  it("rechaza jurisdicciones desconocidas", () => {
    expect(registerDoctorSchema.safeParse({ ...doctor, jurisdiction: "XX" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("no aplica reglas de complejidad en el login", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });
});

describe("patientProfileSchema", () => {
  const base = { dateOfBirth: "", sex: "", documentId: "", phone: "", province: "", city: "" };

  it("convierte campos vacíos en null", () => {
    expect(patientProfileSchema.parse(base)).toEqual({ dateOfBirth: null, sex: null, documentId: null, phone: null, province: null, city: null });
  });

  it("rechaza fechas futuras", () => {
    expect(patientProfileSchema.safeParse({ ...base, dateOfBirth: "2999-01-01" }).success).toBe(false);
  });

  it("acepta un perfil completo", () => {
    const r = patientProfileSchema.parse({ ...base, dateOfBirth: "1990-01-31", sex: "FEMALE", province: "AR-B", phone: "+54 11 5555-0000" });
    expect(r.dateOfBirth?.toISOString()).toBe("1990-01-31T00:00:00.000Z");
  });
});

describe("doctorDecisionSchema", () => {
  it("exige motivo al rechazar", () => {
    expect(doctorDecisionSchema.safeParse({ doctorProfileId: "x", decision: "REJECTED", note: "" }).success).toBe(false);
    expect(doctorDecisionSchema.safeParse({ doctorProfileId: "x", decision: "VERIFIED", note: "" }).success).toBe(true);
  });
});
