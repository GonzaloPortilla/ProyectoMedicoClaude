/**
 * Configuración (serializable) de cada tipo de dato de "Mi Salud".
 * La usan tanto el formulario (cliente) como la validación (servidor, en schemas.ts).
 */
export type FieldType = "text" | "date" | "select" | "tel";
export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  max?: number;
  options?: { value: string; label: string }[];
};
export type HealthKind =
  | "allergy"
  | "condition"
  | "medication"
  | "surgery"
  | "hospitalization"
  | "vaccination"
  | "familyHistory"
  | "emergencyContact";

export const HEALTH_KINDS: HealthKind[] = ["allergy", "condition", "medication", "surgery", "hospitalization", "vaccination", "familyHistory", "emergencyContact"];

export const SEVERITY_OPTIONS = [
  { value: "UNKNOWN", label: "No sé" },
  { value: "MILD", label: "Leve" },
  { value: "MODERATE", label: "Moderada" },
  { value: "SEVERE", label: "Grave" },
];

export const CONDITION_STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Activa" },
  { value: "RESOLVED", label: "Resuelta" },
];

export const KIND_CONFIG: Record<HealthKind, { title: string; description: string; addLabel: string; empty: string; fields: FieldDef[] }> = {
  allergy: {
    title: "Alergias",
    description: "Medicamentos, alimentos u otras sustancias.",
    addLabel: "Agregar alergia",
    empty: "No registraste alergias.",
    fields: [
      { name: "name", label: "Alergia a", type: "text", required: true, placeholder: "Ej.: Penicilina", max: 120 },
      { name: "severity", label: "Severidad", type: "select", options: SEVERITY_OPTIONS },
      { name: "reaction", label: "Reacción", type: "text", placeholder: "Ej.: Urticaria", max: 200 },
    ],
  },
  condition: {
    title: "Enfermedades y condiciones",
    description: "Diagnósticos relevantes, actuales o pasados.",
    addLabel: "Agregar condición",
    empty: "No registraste condiciones.",
    fields: [
      { name: "name", label: "Condición", type: "text", required: true, placeholder: "Ej.: Hipertensión", max: 120 },
      { name: "status", label: "Estado", type: "select", options: CONDITION_STATUS_OPTIONS },
      { name: "diagnosedOn", label: "Diagnóstico", type: "date" },
      { name: "notes", label: "Notas", type: "text", max: 500 },
    ],
  },
  medication: {
    title: "Medicación actual",
    description: "Lo que tomás hoy, con dosis y frecuencia.",
    addLabel: "Agregar medicamento",
    empty: "No registraste medicación.",
    fields: [
      { name: "name", label: "Medicamento", type: "text", required: true, placeholder: "Ej.: Enalapril", max: 120 },
      { name: "dosage", label: "Dosis", type: "text", placeholder: "Ej.: 10 mg", max: 60 },
      { name: "frequency", label: "Frecuencia", type: "text", placeholder: "Ej.: Cada 12 horas", max: 80 },
      { name: "startedOn", label: "Desde", type: "date" },
    ],
  },
  surgery: {
    title: "Cirugías",
    description: "Intervenciones quirúrgicas previas.",
    addLabel: "Agregar cirugía",
    empty: "No registraste cirugías.",
    fields: [
      { name: "name", label: "Cirugía", type: "text", required: true, placeholder: "Ej.: Apendicectomía", max: 120 },
      { name: "performedOn", label: "Fecha", type: "date" },
      { name: "institution", label: "Institución", type: "text", max: 120 },
      { name: "notes", label: "Notas", type: "text", max: 500 },
    ],
  },
  hospitalization: {
    title: "Internaciones",
    description: "Hospitalizaciones y su motivo.",
    addLabel: "Agregar internación",
    empty: "No registraste internaciones.",
    fields: [
      { name: "reason", label: "Motivo", type: "text", required: true, placeholder: "Ej.: Neumonía", max: 160 },
      { name: "admittedOn", label: "Ingreso", type: "date" },
      { name: "dischargedOn", label: "Alta", type: "date" },
      { name: "institution", label: "Institución", type: "text", max: 120 },
    ],
  },
  vaccination: {
    title: "Vacunas",
    description: "Vacunas aplicadas y dosis.",
    addLabel: "Agregar vacuna",
    empty: "No registraste vacunas.",
    fields: [
      { name: "name", label: "Vacuna", type: "text", required: true, placeholder: "Ej.: Antitetánica", max: 120 },
      { name: "dose", label: "Dosis", type: "text", placeholder: "Ej.: Refuerzo", max: 60 },
      { name: "administeredOn", label: "Fecha", type: "date" },
    ],
  },
  familyHistory: {
    title: "Antecedentes familiares",
    description: "Enfermedades relevantes en tu familia.",
    addLabel: "Agregar antecedente",
    empty: "No registraste antecedentes familiares.",
    fields: [
      { name: "relationship", label: "Familiar", type: "text", required: true, placeholder: "Ej.: Madre", max: 60 },
      { name: "condition", label: "Condición", type: "text", required: true, placeholder: "Ej.: Diabetes tipo 2", max: 160 },
      { name: "notes", label: "Notas", type: "text", max: 500 },
    ],
  },
  emergencyContact: {
    title: "Contactos de emergencia",
    description: "A quién avisar ante una urgencia.",
    addLabel: "Agregar contacto",
    empty: "No registraste contactos de emergencia.",
    fields: [
      { name: "name", label: "Nombre", type: "text", required: true, max: 120 },
      { name: "relationship", label: "Vínculo", type: "text", placeholder: "Ej.: Hermana", max: 60 },
      { name: "phone", label: "Teléfono", type: "tel", required: true, placeholder: "+54 11 5555-0000", max: 30 },
    ],
  },
};

export const BLOOD_TYPE_LABELS = {
  A_POS: "A+",
  A_NEG: "A−",
  B_POS: "B+",
  B_NEG: "B−",
  AB_POS: "AB+",
  AB_NEG: "AB−",
  O_POS: "0+",
  O_NEG: "0−",
} as const;

export const SEVERITY_LABELS: Record<string, string> = Object.fromEntries(SEVERITY_OPTIONS.map((o) => [o.value, o.label]));
