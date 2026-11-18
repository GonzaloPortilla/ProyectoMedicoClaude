import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { file, HTML_BYTES, PNG_BYTES, TRUNCATE_ALL } from "../helpers/fixtures";
import { verifiedPatient } from "../helpers/users";

const hasDb = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!hasDb)("registros médicos, historial y búsqueda", async () => {
  const { db } = await import("@/server/db");
  const records = await import("@/server/medical/records");
  const health = await import("@/server/medical/health");
  const { getTimeline, getTimelineFilterOptions } = await import("@/server/medical/timeline");
  const { searchPatientData } = await import("@/server/medical/search");
  const { getStorage } = await import("@/server/storage");

  let userId: string;
  let patientId: string;
  const actor = () => ({ userId, source: "PATIENT" as const });
  const base = { title: null, specialty: null, institution: null, professionalName: null, description: null, tags: [] as string[] };

  beforeEach(async () => {
    await db.$executeRawUnsafe(TRUNCATE_ALL);
    ({ userId, patientId } = await verifiedPatient("ana@test.local"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("guarda el archivo en el storage privado con clave aleatoria y registra el origen", async () => {
    const r = await records.createRecord(patientId, actor(), { ...base, occurredOn: new Date("2026-01-10"), categorySlug: "diagnostico-por-imagenes" }, file("Mi Radiografía.png", PNG_BYTES));
    expect(r.ok).toBe(true);
    const rec = await db.medicalRecord.findFirstOrThrow({ include: { files: true } });
    expect(rec.title).toBe("Mi Radiografía"); // título derivado del nombre de archivo
    expect(rec.source).toBe("PATIENT");
    expect(rec.createdById).toBe(userId);
    const f = rec.files[0]!;
    expect(f.mimeType).toBe("image/png");
    expect(f.storageKey).not.toContain("Radiograf");
    expect(f.storageKey).not.toContain(patientId);
    expect(new Uint8Array(await getStorage().get(f.storageKey))).toEqual(PNG_BYTES);
  });

  it("permite registros sin archivo (p. ej. una consulta) con título por defecto", async () => {
    const r = await records.createRecord(patientId, actor(), { ...base, occurredOn: new Date("2026-02-01"), categorySlug: "cardiologia" });
    expect(r.ok).toBe(true);
    expect((await db.medicalRecord.findFirstOrThrow()).title).toBe("Cardiología");
  });

  it("rechaza archivos con contenido no permitido sin guardar nada", async () => {
    const r = await records.createRecord(patientId, actor(), { ...base, occurredOn: new Date("2026-02-01"), categorySlug: "otros" }, file("x.pdf", HTML_BYTES));
    expect(r).toMatchObject({ ok: false, field: "file" });
    expect(await db.medicalRecord.count()).toBe(0);
  });

  it("rechaza categorías inexistentes", async () => {
    const r = await records.createRecord(patientId, actor(), { ...base, occurredOn: new Date("2026-02-01"), categorySlug: "no-existe" });
    expect(r).toMatchObject({ ok: false, field: "categorySlug" });
  });

  it("reutiliza la institución sin distinguir acentos ni mayúsculas", async () => {
    await records.createRecord(patientId, actor(), { ...base, occurredOn: new Date("2026-01-01"), categorySlug: "laboratorio", institution: "Clínica Güemes" });
    await records.createRecord(patientId, actor(), { ...base, occurredOn: new Date("2026-01-02"), categorySlug: "laboratorio", institution: "clinica guemes" });
    expect(await db.institution.count({ where: { patientId } })).toBe(1);
  });

  it("arma el historial cronológico combinando registros y datos de Mi salud, con filtros", async () => {
    await records.createRecord(patientId, actor(), { ...base, title: "Análisis", occurredOn: new Date("2026-10-12"), categorySlug: "laboratorio", institution: "Lab X" });
    await records.createRecord(patientId, actor(), { ...base, title: "ECG", occurredOn: new Date("2026-08-02"), categorySlug: "cardiologia", specialty: "Cardiología" });
    await records.createRecord(patientId, actor(), { ...base, title: "Radiografía", occurredOn: new Date("2025-12-20"), categorySlug: "diagnostico-por-imagenes" });
    await health.addHealthEntry(patientId, actor(), "vaccination", { name: "Antigripal", dose: null, administeredOn: new Date("2026-04-01") });
    await health.addHealthEntry(patientId, actor(), "vaccination", { name: "Sin fecha", dose: null, administeredOn: null });

    const all = await getTimeline(patientId, {});
    expect(all.map((i) => i.title)).toEqual(["Análisis", "ECG", "Antigripal", "Radiografía"]);

    expect((await getTimeline(patientId, { year: 2025 })).map((i) => i.title)).toEqual(["Radiografía"]);
    expect((await getTimeline(patientId, { category: "vacunas" })).map((i) => i.title)).toEqual(["Antigripal"]);
    expect((await getTimeline(patientId, { specialty: "Cardiología" })).map((i) => i.title)).toEqual(["ECG"]);
    const lab = await db.institution.findFirstOrThrow({ where: { patientId } });
    expect((await getTimeline(patientId, { institution: lab.id })).map((i) => i.title)).toEqual(["Análisis"]);

    const options = await getTimelineFilterOptions(patientId);
    expect(options.years).toEqual([2026, 2025]);
    expect(options.specialties).toEqual(["Cardiología"]);
  });

  it("busca por título, categoría, especialidad, institución, médico, tags y descripción sin acentos", async () => {
    await records.createRecord(patientId, actor(), {
      ...base,
      title: "Hemograma",
      occurredOn: new Date("2026-01-01"),
      categorySlug: "laboratorio",
      specialty: "Hematología",
      institution: "Hospital Italiano",
      professionalName: "Dra. Núñez",
      description: "Valores dentro de parámetros",
      tags: ["control anual"],
    });
    for (const q of ["hemograma", "LABORATORIO", "hematologia", "italiano", "nunez", "control anual", "parametros", "hospital hemograma"]) {
      const res = await searchPatientData(patientId, q);
      expect(res?.records.length, `búsqueda "${q}"`).toBe(1);
    }
    expect((await searchPatientData(patientId, "cardiologia"))?.total).toBe(0);

    await health.addHealthEntry(patientId, actor(), "medication", { name: "Enalapril", dosage: "10 mg", frequency: null, startedOn: null });
    expect((await searchPatientData(patientId, "enala"))?.health).toHaveLength(1);
  });
});
