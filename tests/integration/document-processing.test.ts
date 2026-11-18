/**
 * FASE 6 — Procesamiento de estudios y mediciones.
 *
 * Cubre: extracción end-to-end, documento original inmutable, aislamiento entre pacientes,
 * permisos médicos sobre los datos estructurados, normalización, duplicados, valores
 * confirmados / no confirmados y acceso después de la revocación.
 */
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRUNCATE_ALL } from "../helpers/fixtures";
import { requestFile, verifiedDoctor, verifiedPatient } from "../helpers/users";
import { makePdf, type LabRow } from "../../prisma/demo-documents";
import type { ResourceRef } from "@/features/access/resources";
import type { DocumentExtractionService } from "@/server/documents/extraction/types";

const hasDb = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!hasDb)("procesamiento de estudios (Fase 6)", async () => {
  const { db } = await import("@/server/db");
  const { createSession } = await import("@/server/auth/session");
  const { getStorage } = await import("@/server/storage");
  const records = await import("@/server/medical/records");
  const { processDocument } = await import("@/server/documents/process");
  const review = await import("@/server/documents/review");
  const measurements = await import("@/server/documents/measurements");
  const { findDuplicateFile, findPossibleDuplicates } = await import("@/server/documents/duplicates");
  const { generateLinkCode } = await import("@/server/access/codes");
  const requests = await import("@/server/access/requests");
  const { getDoctorAccess } = await import("@/server/access/policy");
  const view = await import("@/server/access/doctor-view");
  const { ExtractionError } = await import("@/server/documents/extraction/types");

  type Patient = { userId: string; patientId: string; token: string };
  let A: Patient, B: Patient;
  let D: { userId: string; token: string };

  const LAB: ResourceRef = { type: "RECORD_CATEGORY", key: "laboratorio" };
  const CARDIO: ResourceRef = { type: "RECORD_CATEGORY", key: "cardiologia" };

  async function patient(email: string): Promise<Patient> {
    const p = await verifiedPatient(email);
    return { ...p, token: (await createSession(p.userId)).token };
  }

  const labPdf = (date: string, rows: LabRow[], title = "Analisis de sangre completo") =>
    makePdf(title, `Fecha de extraccion: ${date.split("-").reverse().join("/")}  -  Protocolo N 1-TEST`, rows, "Valores ficticios.", "Laboratorio Demo");

  /** Carga rápida (como la server action) y procesamiento sincrónico. */
  async function upload(p: Patient, name: string, body: Buffer, opts: { metadataReviewed?: boolean; categorySlug?: string; occurredOn?: string; service?: DocumentExtractionService } = {}) {
    const r = await records.createRecord(
      p.patientId,
      { userId: p.userId, source: "PATIENT" },
      { title: name, occurredOn: new Date(`${opts.occurredOn ?? "2026-11-18"}T00:00:00Z`), categorySlug: opts.categorySlug ?? "otros", specialty: null, institution: null, professionalName: null, description: null, tags: [] },
      { name, size: body.length, bytes: new Uint8Array(body) },
      {},
      { analyze: true, metadataReviewed: opts.metadataReviewed ?? false },
    );
    if (!r.ok) throw new Error(r.error);
    const status = await processDocument(r.data.fileId!, { service: opts.service });
    return { recordId: r.data.recordId, fileId: r.data.fileId!, status };
  }

  async function grant(p: Patient, resources: ResourceRef[]) {
    const { code } = await generateLinkCode(p.patientId);
    const req = await requests.createAccessRequest(D.userId, { code, message: null, requested: [] });
    if (!req.ok) throw new Error(req.error);
    const g = await requests.approveRequest(p.patientId, p.userId, req.data.requestId, { resources, allowCreate: false, allowUpload: false, expiresAt: new Date(Date.now() + 3600_000) });
    if (!g.ok) throw new Error(g.error);
    return g.data.grantId;
  }

  async function confirmAll(p: Patient, recordId: string) {
    return review.reviewMeasurements(p.patientId, p.userId, recordId, { ids: "all-pending", to: "CONFIRMED" });
  }

  beforeAll(async () => {
    await db.$executeRawUnsafe(TRUNCATE_ALL);
    A = await patient("doc-a@test.local");
    B = await patient("doc-b@test.local");
    D = { userId: (await verifiedDoctor("doc-d@test.local", "MN-6001")).userId, token: "" };
    D.token = (await createSession(D.userId)).token;
  });

  afterAll(async () => {
    await db.$executeRawUnsafe(TRUNCATE_ALL);
  });

  // ── Extracción ──────────────────────────────────────────────────────────────

  describe("extracción", () => {
    it("un PDF de laboratorio queda listo para revisar, con propuesta y resultados pendientes", async () => {
      const pdf = labPdf("2026-10-12", [
        ["Glucemia", "92 mg/dL", "70 - 100 mg/dL"],
        ["Colesterol total", "183 mg/dL", "< 200 mg/dL"],
        ["Colesterol HDL", "55 mg/dL", "> 40 mg/dL"],
      ]);
      const up = await upload(A, "laboratorio_octubre.pdf", pdf);
      expect(up.status).toBe("READY_FOR_REVIEW");

      const data = (await review.getReviewData(A.patientId, up.recordId))!;
      expect(data.extraction).toMatchObject({ status: "READY_FOR_REVIEW", method: "PDF_TEXT", metadataReviewed: false });
      expect(data.extraction!.suggestions).toMatchObject({
        title: { value: "Análisis de sangre completo" },
        occurredOn: { value: "2026-10-12" },
        categorySlug: { value: "laboratorio" },
        institution: { value: "Laboratorio Demo" },
      });
      // La propuesta NO cambia el registro hasta que el paciente confirma.
      expect(data.record.title).toBe("laboratorio_octubre.pdf");
      expect(data.record.measurements.map((m) => [m.originalName, m.valueText, m.unit, m.reviewStatus])).toEqual([
        ["Glucemia", "92", "mg/dL", "PENDING"],
        ["Colesterol total", "183", "mg/dL", "PENDING"],
        ["Colesterol HDL", "55", "mg/dL", "PENDING"],
      ]);
      expect(data.record.measurements[0]!.measuredOn.toISOString().slice(0, 10)).toBe("2026-10-12");
      // El texto extraído se puede buscar.
      const rec = await db.medicalRecord.findUniqueOrThrow({ where: { id: up.recordId }, select: { searchText: true } });
      expect(rec.searchText).toContain("glucemia 92");
    });

    it("confirmar los datos actualiza el estudio y sus mediciones", async () => {
      const up = await upload(A, "lab2.pdf", labPdf("2025-06-10", [["Glucosa", "101 mg/dL", "70 - 100 mg/dL"]]));
      const r = await review.confirmDocumentDetails(A.patientId, A.userId, up.recordId, {
        title: "Análisis de control",
        occurredOn: new Date("2025-06-10T00:00:00Z"),
        categorySlug: "laboratorio",
        specialty: null,
        institution: "Laboratorio Demo",
        professionalName: null,
      });
      expect(r.ok).toBe(true);
      const data = (await review.getReviewData(A.patientId, up.recordId))!;
      expect(data.record).toMatchObject({ title: "Análisis de control", category: { slug: "laboratorio" }, institution: { name: "Laboratorio Demo" } });
      expect(data.extraction).toMatchObject({ metadataReviewed: true, status: "READY_FOR_REVIEW" }); // falta revisar el resultado
      expect(data.record.measurements[0]!.measuredOn.toISOString().slice(0, 10)).toBe("2025-06-10");
      await confirmAll(A, up.recordId);
      expect((await review.getReviewData(A.patientId, up.recordId))!.extraction!.status).toBe("CONFIRMED");
    });

    it("sin resultados y con datos ya cargados a mano, queda CONFIRMED directamente", async () => {
      const pdf = makePdf("Informe de ecografia", "Fecha: 01/03/2026", [["Higado", "normal", "-"]], "Sin hallazgos.", "Centro de Imagenes Demo");
      const up = await upload(A, "eco.pdf", pdf, { metadataReviewed: true, categorySlug: "diagnostico-por-imagenes" });
      expect(up.status).toBe("CONFIRMED");
      expect(await db.medicalMeasurement.count({ where: { recordId: up.recordId } })).toBe(0);
    });

    it("si la extracción falla, el estudio original sigue funcionando exactamente igual", async () => {
      const failing: DocumentExtractionService = {
        name: "falla",
        extract: async () => {
          throw new ExtractionError("OCR_FAILED");
        },
      };
      const up = await upload(A, "foto.pdf", labPdf("2026-01-01", [["Glucemia", "90 mg/dL", "70 - 100"]]), { service: failing });
      expect(up.status).toBe("FAILED");
      const ext = await db.documentExtraction.findUniqueOrThrow({ where: { fileId: up.fileId } });
      expect(ext).toMatchObject({ status: "FAILED", errorCode: "OCR_FAILED", text: null });
      expect(await records.getRecord(A.patientId, up.recordId)).not.toBeNull();
      expect((await requestFile(A.token, A.userId, up.fileId)).status).toBe(200);
      // Reintento con el proveedor real.
      expect(await processDocument(up.fileId)).toBe("READY_FOR_REVIEW");
    });

    it("dos procesamientos simultáneos no duplican resultados", async () => {
      const r = await records.createRecord(
        A.patientId,
        { userId: A.userId, source: "PATIENT" },
        { title: "x", occurredOn: new Date("2026-02-02"), categorySlug: "otros", specialty: null, institution: null, professionalName: null, description: null, tags: [] },
        { name: "x.pdf", size: 1, bytes: new Uint8Array(labPdf("2026-02-02", [["Glucemia", "91 mg/dL", "70 - 100"]])) },
        {},
        { analyze: true, metadataReviewed: false },
      );
      if (!r.ok) throw new Error(r.error);
      const results = await Promise.all([processDocument(r.data.fileId!), processDocument(r.data.fileId!)]);
      expect(results.filter((s) => s !== null)).toHaveLength(1);
      expect(await db.medicalMeasurement.count({ where: { recordId: r.data.recordId } })).toBe(1);
    });
  });

  // ── Documento original ─────────────────────────────────────────────────────

  describe("el documento original es inmutable", () => {
    it("procesar no modifica los bytes ni los metadatos del archivo", async () => {
      const pdf = labPdf("2026-03-03", [["Glucemia", "93 mg/dL", "70 - 100"]]);
      const before = createHash("sha256").update(pdf).digest("hex");
      const up = await upload(A, "orig.pdf", pdf);
      const file = await db.medicalFile.findUniqueOrThrow({ where: { id: up.fileId } });
      expect(file.sha256).toBe(before);
      expect(file.originalSha256).toBe(before);
      const stored = await getStorage().get(file.storageKey);
      expect(createHash("sha256").update(stored).digest("hex")).toBe(before);
      // Lo extraído vive aparte.
      expect(await db.documentExtraction.count({ where: { fileId: file.id } })).toBe(1);
    });

    it("la base rechaza cambiar el contenido de un archivo ya guardado", async () => {
      const file = await db.medicalFile.findFirstOrThrow({ where: { patientId: A.patientId } });
      await expect(db.medicalFile.update({ where: { id: file.id }, data: { sha256: "0".repeat(64) } })).rejects.toThrow();
      await expect(db.medicalFile.update({ where: { id: file.id }, data: { storageKey: "medical/otro" } })).rejects.toThrow();
      await expect(db.medicalFile.update({ where: { id: file.id }, data: { sizeBytes: 1 } })).rejects.toThrow();
    });

    it("si el archivo del storage no coincide con su hash, no se analiza", async () => {
      const up = await upload(A, "integ.pdf", labPdf("2026-03-04", [["Glucemia", "94 mg/dL", "70 - 100"]]), {
        service: {
          name: "falla",
          extract: async () => {
            throw new ExtractionError("NO_TEXT");
          },
        },
      });
      expect(up.status).toBe("FAILED");
      const file = await db.medicalFile.findUniqueOrThrow({ where: { id: up.fileId } });
      // Se simula una alteración del storage por fuera de la app.
      await getStorage().delete(file.storageKey);
      await getStorage().put(file.storageKey, Buffer.from("%PDF-1.4 alterado"), "application/pdf");
      expect(await processDocument(up.fileId)).toBe("FAILED");
      expect((await db.documentExtraction.findUniqueOrThrow({ where: { fileId: up.fileId } })).errorCode).toBe("INTEGRITY_MISMATCH");
    });
  });

  // ── Confirmados / no confirmados y normalización ───────────────────────────

  describe("revisión obligatoria y normalización", () => {
    let recordId: string;

    it("lo pendiente no aparece en Evolución; lo confirmado sí", async () => {
      const up = await upload(B, "b1.pdf", labPdf("2024-10-02", [["Glucemia", "94 mg/dL", "70 - 100 mg/dL"], ["Colesterol total", "198 mg/dL", "< 200"]]));
      recordId = up.recordId;
      expect(await measurements.listIndicators({ patientId: B.patientId })).toEqual([]);

      const ids = (await db.medicalMeasurement.findMany({ where: { recordId }, orderBy: { createdAt: "asc" }, select: { id: true, originalName: true } }));
      const glucose = ids.find((m) => m.originalName === "Glucemia")!;
      // Confirmación individual.
      expect(await review.reviewMeasurements(B.patientId, B.userId, recordId, { ids: [glucose.id], to: "CONFIRMED" })).toBe(1);
      const indicators = await measurements.listIndicators({ patientId: B.patientId });
      expect(indicators.map((i) => i.key)).toEqual(["glucose"]);
      const m = await db.medicalMeasurement.findUniqueOrThrow({ where: { id: glucose.id } });
      expect(m).toMatchObject({ reviewStatus: "CONFIRMED", confirmedById: B.userId });
    });

    it("descartar no borra: queda guardado y fuera de Evolución", async () => {
      const chol = await db.medicalMeasurement.findFirstOrThrow({ where: { recordId, originalName: "Colesterol total" } });
      await review.reviewMeasurements(B.patientId, B.userId, recordId, { ids: [chol.id], to: "DISCARDED" });
      expect(await db.medicalMeasurement.findUnique({ where: { id: chol.id } })).toMatchObject({ reviewStatus: "DISCARDED" });
      expect((await measurements.listIndicators({ patientId: B.patientId })).map((i) => i.key)).not.toContain("cholesterol_total");
    });

    it("Glucemia, Glucosa y Glucose se agrupan en un único indicador sin perder el nombre original", async () => {
      const u2 = await upload(B, "b2.pdf", labPdf("2023-09-14", [["Glucosa", "88 mg/dL", "74 - 106 mg/dL"]]));
      const u3 = await upload(B, "b3.pdf", labPdf("2025-06-10", [["Glucose", "101 mg/dL", "70 - 100 mg/dL"]]));
      await review.confirmDocumentDetails(B.patientId, B.userId, u3.recordId, { title: "Lab", occurredOn: new Date("2025-06-10T00:00:00Z"), categorySlug: "laboratorio", specialty: null, institution: null, professionalName: null });
      await confirmAll(B, u2.recordId);
      await confirmAll(B, u3.recordId);
      const series = await measurements.getIndicatorSeries({ patientId: B.patientId }, "glucose");
      expect(series.map((p) => [p.originalName, p.valueText, p.measuredOn.toISOString().slice(0, 10)])).toEqual([
        ["Glucosa", "88", "2023-09-14"],
        ["Glucemia", "94", "2024-10-02"],
        ["Glucose", "101", "2025-06-10"],
      ]);
      expect(series.every((p) => p.concept?.displayName === "Glucemia")).toBe(true);
      // Cada punto conserva su documento de origen.
      expect(series.map((p) => p.record.id)).toEqual([u2.recordId, recordId, u3.recordId]);
    });

    it("corregir un valor conserva el nombre original y lo detectado", async () => {
      const m = await db.medicalMeasurement.findFirstOrThrow({ where: { patientId: B.patientId, originalName: "Glucose" } });
      const r = await review.updateMeasurement(B.patientId, B.userId, m.id, { conceptCode: "glucose", valueText: "100", unit: "mg/dL", refLow: "70", refHigh: "100" });
      expect(r.ok).toBe(true);
      const after = await db.medicalMeasurement.findUniqueOrThrow({ where: { id: m.id } });
      expect(after.originalName).toBe("Glucose");
      expect(after.valueNumeric?.toNumber()).toBe(100);
      expect(after.editedAt).not.toBeNull();
      expect(after.detected).toMatchObject({ originalName: "Glucose", valueText: "101" });
      // Validación: mínimo mayor que máximo.
      expect((await review.updateMeasurement(B.patientId, B.userId, m.id, { conceptCode: null, valueText: "1", unit: null, refLow: "10", refHigh: "5" })).ok).toBe(false);
    });

    it("quitar la confirmación lo saca de Evolución", async () => {
      const m = await db.medicalMeasurement.findFirstOrThrow({ where: { patientId: B.patientId, originalName: "Glucosa" } });
      await review.reviewMeasurements(B.patientId, B.userId, m.recordId, { ids: [m.id], to: "PENDING" });
      const series = await measurements.getIndicatorSeries({ patientId: B.patientId }, "glucose");
      expect(series.map((p) => p.originalName)).not.toContain("Glucosa");
    });
  });

  // ── Duplicados ─────────────────────────────────────────────────────────────

  describe("duplicados", () => {
    it("detecta el mismo archivo por hash, sólo entre los archivos del propio paciente", async () => {
      const pdf = labPdf("2026-04-04", [["Glucemia", "95 mg/dL", "70 - 100"]]);
      const up = await upload(A, "dup.pdf", pdf);
      const hash = createHash("sha256").update(pdf).digest("hex");
      expect((await findDuplicateFile(A.patientId, hash))?.recordId).toBe(up.recordId);
      expect(await findDuplicateFile(B.patientId, hash)).toBeNull();
      expect(await findDuplicateFile(A.patientId, "no-es-un-hash")).toBeNull();
    });

    it("cargar igualmente crea otro estudio y la revisión avisa; nunca se borra nada", async () => {
      const pdf = labPdf("2026-04-04", [["Glucemia", "95 mg/dL", "70 - 100"]]);
      const before = await db.medicalRecord.count({ where: { patientId: A.patientId } });
      const second = await upload(A, "dup-otra-vez.pdf", pdf);
      expect(await db.medicalRecord.count({ where: { patientId: A.patientId } })).toBe(before + 1);
      const data = (await review.getReviewData(A.patientId, second.recordId))!;
      expect(data.duplicates.some((d) => d.reason === "same_file")).toBe(true);
    });

    it("posibles duplicados por fecha, institución y título", async () => {
      const r1 = await records.createRecord(A.patientId, { userId: A.userId, source: "PATIENT" }, { title: "Ecografía abdominal", occurredOn: new Date("2026-05-05"), categorySlug: "diagnostico-por-imagenes", specialty: null, institution: "Centro Sur", professionalName: null, description: null, tags: [] });
      const r2 = await records.createRecord(A.patientId, { userId: A.userId, source: "PATIENT" }, { title: "Eco abdominal (copia)", occurredOn: new Date("2026-05-05"), categorySlug: "diagnostico-por-imagenes", specialty: null, institution: "Centro Sur", professionalName: null, description: null, tags: [] });
      if (!r1.ok || !r2.ok) throw new Error("setup");
      const rec2 = await db.medicalRecord.findUniqueOrThrow({ where: { id: r2.data.recordId } });
      const dups = await findPossibleDuplicates(A.patientId, rec2);
      expect(dups.map((d) => d.recordId)).toContain(r1.data.recordId);
      // Otro paciente con los mismos datos no aparece.
      expect((await findPossibleDuplicates(B.patientId, rec2)).map((d) => d.recordId)).not.toContain(r1.data.recordId);
    });
  });

  // ── Aislamiento ────────────────────────────────────────────────────────────

  describe("aislamiento entre pacientes", () => {
    it("el paciente B no ve ni modifica la extracción ni las mediciones de A", async () => {
      const a = await upload(A, "a-iso.pdf", labPdf("2026-06-06", [["Glucemia", "96 mg/dL", "70 - 100"]]));
      const mA = await db.medicalMeasurement.findFirstOrThrow({ where: { recordId: a.recordId } });

      expect(await review.getReviewData(B.patientId, a.recordId)).toBeNull();
      expect(await review.reviewMeasurements(B.patientId, B.userId, a.recordId, { ids: [mA.id], to: "CONFIRMED" })).toBe(0);
      // Aunque B use su propio recordId, un id de medición ajeno no se toca.
      const bRecord = await db.medicalRecord.findFirstOrThrow({ where: { patientId: B.patientId } });
      expect(await review.reviewMeasurements(B.patientId, B.userId, bRecord.id, { ids: [mA.id], to: "DISCARDED" })).toBe(0);
      expect((await review.updateMeasurement(B.patientId, B.userId, mA.id, { conceptCode: null, valueText: "1", unit: null, refLow: null, refHigh: null })).ok).toBe(false);
      expect((await review.confirmDocumentDetails(B.patientId, B.userId, a.recordId, { title: "x", occurredOn: new Date(), categorySlug: "otros", specialty: null, institution: null, professionalName: null })).ok).toBe(false);
      expect(await review.requestAnalysis(B.patientId, a.recordId)).toBeNull();

      expect(await db.medicalMeasurement.findUniqueOrThrow({ where: { id: mA.id } })).toMatchObject({ reviewStatus: "PENDING", valueText: "96" });
      await confirmAll(A, a.recordId);
      const bKeys = (await measurements.getIndicatorSeries({ patientId: B.patientId }, "glucose")).map((p) => p.record.id);
      expect(bKeys).not.toContain(a.recordId);
    });

    it("la base impide asociar una medición a un registro de otro paciente", async () => {
      const aRecord = await db.medicalRecord.findFirstOrThrow({ where: { patientId: A.patientId } });
      await expect(
        db.medicalMeasurement.create({ data: { patientId: B.patientId, recordId: aRecord.id, originalName: "x", normalizedKey: "x", valueText: "1", measuredOn: new Date(), extractionMethod: "MANUAL" } }),
      ).rejects.toThrow();
    });
  });

  // ── Permisos médicos y revocación ──────────────────────────────────────────

  describe("permisos médicos sobre los datos estructurados", () => {
    let grantId: string;
    let labRecordId: string;

    it("sin permiso de Laboratorio el backend no devuelve mediciones", async () => {
      labRecordId = (await db.medicalMeasurement.findFirstOrThrow({ where: { patientId: A.patientId, reviewStatus: "CONFIRMED" }, select: { recordId: true } })).recordId;
      // Todos los estudios de A con resultados (confirmados y pendientes) pasan a Laboratorio.
      const lab = await db.medicalCategory.findUniqueOrThrow({ where: { slug: "laboratorio" } });
      await db.medicalRecord.updateMany({ where: { patientId: A.patientId, measurements: { some: {} } }, data: { categoryId: lab.id } });
      grantId = await grant(A, [CARDIO]);
      const access = (await getDoctorAccess(D.userId, A.patientId))!;
      expect(await measurements.listIndicatorsForDoctor(access)).toEqual([]);
      expect(await measurements.getIndicatorSeriesForDoctor(access, "glucose")).toEqual([]);
      expect(await view.getRecordForDoctor(access, labRecordId)).toBeNull();
      expect((await view.getTimelineForDoctor(access)).some((t) => t.resultCount > 0)).toBe(false);
    });

    it("con permiso de Laboratorio recibe sólo mediciones confirmadas de Laboratorio", async () => {
      await requests.revokeGrant(A.patientId, A.userId, grantId);
      grantId = await grant(A, [LAB]);
      const access = (await getDoctorAccess(D.userId, A.patientId))!;
      const indicators = await measurements.listIndicatorsForDoctor(access);
      expect(indicators.map((i) => i.key)).toContain("glucose");
      const series = await measurements.getIndicatorSeriesForDoctor(access, "glucose");
      expect(series.length).toBeGreaterThan(0);
      // Todo lo devuelto está confirmado y proviene de registros de Laboratorio.
      const ids = series.map((p) => p.id);
      const rows = await db.medicalMeasurement.findMany({ where: { id: { in: ids } }, select: { reviewStatus: true, record: { select: { category: { select: { slug: true } } } } } });
      expect(rows.every((r) => r.reviewStatus === "CONFIRMED" && r.record.category.slug === "laboratorio")).toBe(true);
      // Lo pendiente nunca llega al médico.
      const pending = await db.medicalMeasurement.findMany({ where: { patientId: A.patientId, reviewStatus: "PENDING", record: { category: { slug: "laboratorio" } } }, select: { id: true } });
      expect(pending.length).toBeGreaterThan(0);
      expect(pending.some((m) => ids.includes(m.id))).toBe(false);
      const rec = await view.getRecordForDoctor(access, labRecordId);
      expect(rec?.measurements.length).toBeGreaterThan(0);
      expect(rec?.measurements.every((m) => m.reviewStatus === "CONFIRMED")).toBe(true);
      // Mediciones de otro paciente: nunca.
      expect(await measurements.getIndicatorSeries({ patientId: B.patientId, allowedCategories: ["laboratorio"] }, "glucose").then((s) => s.some((p) => ids.includes(p.id)))).toBe(false);
    });

    it("después de revocar, el acceso desaparece en la siguiente consulta", async () => {
      await requests.revokeGrant(A.patientId, A.userId, grantId);
      expect(await getDoctorAccess(D.userId, A.patientId)).toBeNull();
      // El archivo original tampoco se entrega.
      const file = await db.medicalFile.findFirstOrThrow({ where: { recordId: labRecordId } });
      expect((await requestFile(D.token, D.userId, file.id)).status).not.toBe(200);
    });

    it("un acceso vencido tampoco devuelve mediciones", async () => {
      grantId = await grant(A, [LAB]);
      await db.accessGrant.update({ where: { id: grantId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect(await getDoctorAccess(D.userId, A.patientId)).toBeNull();
    });
  });
});
