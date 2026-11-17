/**
 * Jurisdicciones que emiten matrículas profesionales en Argentina.
 * Se guardan como código en la base para poder ampliar a otros países sin migrar datos.
 */
export const JURISDICTIONS = [
  { code: "AR-NAC", name: "Nación (Matrícula Nacional)" },
  { code: "AR-C", name: "Ciudad Autónoma de Buenos Aires" },
  { code: "AR-B", name: "Buenos Aires" },
  { code: "AR-K", name: "Catamarca" },
  { code: "AR-H", name: "Chaco" },
  { code: "AR-U", name: "Chubut" },
  { code: "AR-X", name: "Córdoba" },
  { code: "AR-W", name: "Corrientes" },
  { code: "AR-E", name: "Entre Ríos" },
  { code: "AR-P", name: "Formosa" },
  { code: "AR-Y", name: "Jujuy" },
  { code: "AR-L", name: "La Pampa" },
  { code: "AR-F", name: "La Rioja" },
  { code: "AR-M", name: "Mendoza" },
  { code: "AR-N", name: "Misiones" },
  { code: "AR-Q", name: "Neuquén" },
  { code: "AR-R", name: "Río Negro" },
  { code: "AR-A", name: "Salta" },
  { code: "AR-J", name: "San Juan" },
  { code: "AR-D", name: "San Luis" },
  { code: "AR-Z", name: "Santa Cruz" },
  { code: "AR-S", name: "Santa Fe" },
  { code: "AR-G", name: "Santiago del Estero" },
  { code: "AR-V", name: "Tierra del Fuego" },
  { code: "AR-T", name: "Tucumán" },
] as const;

export type JurisdictionCode = (typeof JURISDICTIONS)[number]["code"];

export const JURISDICTION_CODES = JURISDICTIONS.map((j) => j.code) as [JurisdictionCode, ...JurisdictionCode[]];

/** Provincias (sin la jurisdicción nacional), para domicilio de pacientes. */
export const PROVINCES = JURISDICTIONS.filter((j) => j.code !== "AR-NAC");
export const PROVINCE_CODES = PROVINCES.map((p) => p.code) as [JurisdictionCode, ...JurisdictionCode[]];

export function jurisdictionName(code: string | null | undefined): string {
  if (!code) return "—";
  return JURISDICTIONS.find((j) => j.code === code)?.name ?? code;
}
