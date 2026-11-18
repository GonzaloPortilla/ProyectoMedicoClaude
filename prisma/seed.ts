/**
 * Datos de DEMOSTRACIÓN. Todo es ficticio: nombres, documentos, valores de laboratorio,
 * matrículas e instituciones. No contiene información médica real.
 *
 *   npm run db:seed       → crea las cuentas demo si no existen (idempotente)
 *   npm run demo:reset    → borra TODOS los datos y deja la demo en su estado inicial
 *                           (sólo desarrollo; se niega a correr en producción)
 *
 * Estado inicial pensado para el guion de docs/DEMO.md:
 *  - Martín Demo: historia clínica completa, SIN médicos con acceso (la demo lo muestra
 *    pidiendo y otorgando acceso desde cero) y un acceso anterior ya vencido.
 *  - Dr. Juan Pérez (Cardiología, verificado): ya atiende a Carla Demo.
 *  - Dra. Laura Gómez: matrícula pendiente (para la demo de administración).
 */
import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";

if (process.env.NODE_ENV === "production") {
  console.error("Los datos de demostración no deben cargarse en producción.");
  process.exit(1);
}

const password = process.env.SEED_DEMO_PASSWORD;
if (!password) {
  console.error("Definí SEED_DEMO_PASSWORD en .env para crear las cuentas demo.");
  process.exit(1);
}

const RESET = process.argv.includes("--reset");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const DAY = 864e5;
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const at = (iso: string, hhmm = "10:00") => new Date(`${iso}T${hhmm}:00.000-03:00`);

// ─── Utilidades ─────────────────────────────────────────────────────────────

function normalize(v: string) {
  return v.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** PDF de una página con encabezado, datos del paciente y una tabla de resultados. */
function makePdf(title: string, subtitle: string, rows: [string, string, string][], footer: string): Buffer {
  const esc = (s: string) => s.replace(/[()\\]/g, "");
  const ops: string[] = [];
  const text = (x: number, y: number, size: number, font: "F1" | "F2", s: string) => ops.push(`BT /${font} ${size} Tf ${x} ${y} Td (${esc(s)}) Tj ET`);
  ops.push("0.05 0.5 0.44 rg 0 792 595 50 re f"); // franja superior
  text(50, 810, 16, "F2", "Laboratorio / Centro de diagnostico - DEMO");
  text(50, 760, 18, "F2", title);
  text(50, 740, 10, "F1", subtitle);
  text(50, 724, 10, "F1", "Paciente: Martin Demo  -  DNI 00.000.000 (dato ficticio)");
  ops.push("0.85 0.87 0.9 RG 50 712 m 545 712 l S");
  text(50, 692, 10, "F2", "Determinacion");
  text(300, 692, 10, "F2", "Resultado");
  text(420, 692, 10, "F2", "Valor de referencia");
  rows.forEach(([name, value, ref], i) => {
    const y = 670 - i * 20;
    text(50, y, 10, "F1", name);
    text(300, y, 10, "F2", value);
    text(420, y, 10, "F1", ref);
  });
  text(50, 670 - rows.length * 20 - 24, 9, "F1", footer);
  text(50, 60, 8, "F1", "Documento de demostracion generado automaticamente. No contiene informacion medica real.");
  const content = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Trazado de electrocardiograma ficticio sobre papel milimetrado. */
function makeEcgPng(): Buffer {
  const W = 960;
  const H = 300;
  const px = new Uint8Array(W * H * 3).fill(255);
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (Math.round(y) * W + Math.round(x)) * 3;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  };
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    if (x % 60 === 0 || y % 60 === 0) set(x, y, 240, 170, 180);
    else if (x % 12 === 0 || y % 12 === 0) set(x, y, 252, 225, 230);
  }
  const base = 170;
  const beat = (t: number) => {
    // P (t 0.1–0.2), QRS (0.3–0.38), T (0.5–0.7) sobre un ciclo de 0..1
    if (t > 0.1 && t < 0.2) return -14 * Math.sin(((t - 0.1) / 0.1) * Math.PI);
    if (t > 0.3 && t < 0.32) return 12 * ((t - 0.3) / 0.02);
    if (t >= 0.32 && t < 0.345) return 12 - 132 * ((t - 0.32) / 0.025);
    if (t >= 0.345 && t < 0.37) return -120 + 150 * ((t - 0.345) / 0.025);
    if (t >= 0.37 && t < 0.38) return 30 - 30 * ((t - 0.37) / 0.01);
    if (t > 0.5 && t < 0.7) return -28 * Math.sin(((t - 0.5) / 0.2) * Math.PI);
    return 0;
  };
  let prev = base;
  for (let x = 0; x < W; x++) {
    const y = base + beat((x % 180) / 180);
    const [a, b] = prev < y ? [prev, y] : [y, prev];
    for (let yy = a; yy <= b; yy += 0.5) for (let t = -1; t <= 1; t++) set(x, yy + t, 25, 30, 40);
    prev = y;
  }
  return encodePng(W, H, px);
}

/** Radiografía ficticia (degradado con silueta). */
function makeXrayPng(): Buffer {
  const W = 640;
  const H = 520;
  const px = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / (W / 2);
    const dy = (y - H / 2) / (H / 2);
    const lungs = Math.exp(-((Math.abs(dx) - 0.45) ** 2 * 9 + dy ** 2 * 2.2));
    const spine = Math.exp(-(dx ** 2) * 180);
    const v = Math.max(0, Math.min(255, 25 + 150 * (1 - lungs) * Math.exp(-(dy ** 2) * 1.2) + 90 * spine));
    const i = (y * W + x) * 3;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  return encodePng(W, H, px);
}

async function storeFile(body: Buffer): Promise<string | null> {
  if ((process.env.STORAGE_DRIVER ?? "local") !== "local") return null; // con S3 se omiten los archivos demo
  const key = `medical/${new Date().getUTCFullYear()}/${randomUUID()}`;
  const full = path.resolve(process.env.LOCAL_STORAGE_DIR ?? "./storage/private", key);
  await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  await writeFile(full, body, { mode: 0o600 });
  return key;
}

async function institution(patientId: string, name: string) {
  return db.institution.upsert({
    where: { patientId_normalizedName: { patientId, normalizedName: normalize(name) } },
    create: { patientId, name, normalizedName: normalize(name) },
    update: {},
  });
}

type DemoRecord = {
  title: string;
  date: string;
  category: string;
  specialty?: string;
  institution?: string;
  professional?: string;
  description?: string;
  tags?: string[];
  file?: { name: string; body: Buffer; mime: "application/pdf" | "image/png" };
};

async function createDemoRecord(userId: string, patientId: string, r: DemoRecord) {
  const category = await db.medicalCategory.findUniqueOrThrow({ where: { slug: r.category } });
  const inst = r.institution ? await institution(patientId, r.institution) : null;
  let file = null;
  if (r.file) {
    const key = await storeFile(r.file.body);
    if (key) {
      file = {
        patientId,
        storageKey: key,
        originalName: r.file.name,
        mimeType: r.file.mime,
        sizeBytes: r.file.body.length,
        sha256: createHash("sha256").update(r.file.body).digest("hex"),
        uploadedById: userId,
      };
    }
  }
  const record = await db.medicalRecord.create({
    data: {
      patientId,
      title: r.title,
      occurredOn: d(r.date),
      categoryId: category.id,
      specialty: r.specialty ?? null,
      institutionId: inst?.id ?? null,
      professionalName: r.professional ?? null,
      description: r.description ?? null,
      tags: r.tags ?? [],
      source: "PATIENT",
      createdById: userId,
      createdAt: at(r.date, "18:30"),
      searchText: normalize([r.title, category.name, r.specialty, inst?.name, r.professional, r.description, ...(r.tags ?? []), file?.originalName].filter(Boolean).join(" ")),
      files: file ? { create: file } : undefined,
    },
  });
  return { record, category };
}

type AuditSeed = Omit<Prisma.AuditEventUncheckedCreateInput, "id" | "seq" | "hash" | "prevHash">;
const audit = (e: AuditSeed) => db.auditEvent.create({ data: e });

// ─── Datos ──────────────────────────────────────────────────────────────────

async function resetEverything() {
  console.info("Reiniciando la demo: se borran todos los datos…");
  await db.$executeRawUnsafe('TRUNCATE "users" CASCADE');
  await db.$transaction([
    db.$executeRawUnsafe("SELECT set_config('app.audit_maintenance', 'on', true)"),
    db.$executeRawUnsafe('TRUNCATE "audit_events"'),
  ]);
  if ((process.env.STORAGE_DRIVER ?? "local") === "local") await rm(path.resolve(process.env.LOCAL_STORAGE_DIR ?? "./storage/private"), { recursive: true, force: true });
}

async function main() {
  if (RESET) await resetEverything();
  const passwordHash = await hash(password!, { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 });
  const account = (email: string, firstName: string, lastName: string, extra: Partial<Prisma.UserCreateInput> = {}) =>
    db.user.upsert({ where: { email }, update: {}, create: { email, passwordHash, emailVerifiedAt: d("2025-05-02"), firstName, lastName, createdAt: d("2025-05-02"), ...extra } });

  const admin = await account("admin@demo.local", "Admin", "Demo", { roles: { create: { role: "ADMIN" } } });

  const martin = await account("martin@demo.local", "Martín", "Demo", {
    roles: { create: { role: "PATIENT" } },
    patientProfile: {
      create: { dateOfBirth: d("1988-04-12"), sex: "MALE", documentId: "00000000", phone: "+54 11 0000-0000", province: "AR-C", city: "Palermo" },
    },
  });

  const juan = await account("juan.perez@demo.local", "Juan", "Pérez", {
    roles: { create: { role: "DOCTOR" } },
    doctorProfile: {
      create: {
        specialty: "Cardiología",
        licenseNumber: "MN-123456",
        jurisdiction: "AR-NAC",
        verificationStatus: "VERIFIED",
        verifiedAt: d("2025-05-03"),
        verifications: {
          create: [
            { status: "PENDING", note: "Solicitud de verificación enviada", createdAt: d("2025-05-02") },
            { status: "VERIFIED", note: "Matrícula verificada (dato de demostración)", reviewerId: admin.id, createdAt: d("2025-05-03") },
          ],
        },
      },
    },
  });

  const sofia = await account("sofia.ramos@demo.local", "Sofía", "Ramos", {
    roles: { create: { role: "DOCTOR" } },
    doctorProfile: { create: { specialty: "Clínica médica", licenseNumber: "MP-45210", jurisdiction: "AR-C", verificationStatus: "VERIFIED", verifiedAt: d("2025-05-10") } },
  });

  await account("laura.gomez@demo.local", "Laura", "Gómez", {
    roles: { create: { role: "DOCTOR" } },
    doctorProfile: {
      create: {
        specialty: "Pediatría",
        licenseNumber: "MP-000002",
        jurisdiction: "AR-X",
        verifications: { create: { status: "PENDING", note: "Solicitud de verificación enviada" } },
      },
    },
  });

  const carla = await account("carla@demo.local", "Carla", "Demo", {
    roles: { create: { role: "PATIENT" } },
    patientProfile: { create: { dateOfBirth: d("1979-09-30"), sex: "FEMALE", province: "AR-X", city: "Córdoba" } },
  });

  await seedMartin(martin.id, sofia.id);
  await seedCarla(carla.id, juan.id);

  console.info("Datos de demostración listos. Contraseña de todas las cuentas: SEED_DEMO_PASSWORD");
  console.table([
    { rol: "Paciente", nombre: "Martín Demo", email: "martin@demo.local" },
    { rol: "Paciente", nombre: "Carla Demo", email: "carla@demo.local" },
    { rol: "Médico · Cardiología", nombre: "Dr. Juan Pérez", email: "juan.perez@demo.local" },
    { rol: "Médica · Clínica médica", nombre: "Dra. Sofía Ramos", email: "sofia.ramos@demo.local" },
    { rol: "Médica (matrícula pendiente)", nombre: "Dra. Laura Gómez", email: "laura.gomez@demo.local" },
    { rol: "Administrador", nombre: "Admin Demo", email: "admin@demo.local" },
  ]);
}

async function seedMartin(userId: string, sofiaId: string) {
  const patient = await db.patientProfile.findUniqueOrThrow({ where: { userId } });
  if ((await db.medicalRecord.count({ where: { patientId: patient.id } })) > 0) return; // idempotente
  const p = patient.id;
  const meta = { patientId: p, source: "PATIENT" as const, createdById: userId };
  const central = await institution(p, "Hospital Central (demo)");

  await db.healthProfile.create({ data: { patientId: p, bloodType: "O_POS", heightCm: 178, weightKg: 76.5 } });
  await db.emergencyProfile.create({ data: { patientId: p, additionalNotes: "Hipertenso en tratamiento. Alergia grave a la penicilina." } });
  await db.allergy.createMany({
    data: [
      { ...meta, name: "Penicilina", severity: "SEVERE", reaction: "Urticaria generalizada y dificultad respiratoria" },
      { ...meta, name: "Maní", severity: "MODERATE", reaction: "Hinchazón de labios" },
    ],
  });
  await db.condition.createMany({
    data: [
      { ...meta, name: "Hipertensión arterial", status: "ACTIVE", diagnosedOn: d("2021-06-01"), notes: "Controlada con medicación" },
      { ...meta, name: "Dislipemia", status: "ACTIVE", diagnosedOn: d("2026-04-08") },
      { ...meta, name: "Asma infantil", status: "RESOLVED" },
    ],
  });
  await db.medication.createMany({
    data: [
      { ...meta, name: "Enalapril", dosage: "10 mg", frequency: "Cada 12 horas", startedOn: d("2021-06-15") },
      { ...meta, name: "Atorvastatina", dosage: "20 mg", frequency: "Una vez por día, a la noche", startedOn: d("2026-04-10") },
    ],
  });
  await db.surgery.create({ data: { ...meta, name: "Apendicectomía", performedOn: d("2015-03-10"), institutionId: central.id } });
  await db.hospitalization.create({ data: { ...meta, reason: "Neumonía", admittedOn: d("2019-07-02"), dischargedOn: d("2019-07-06"), institutionId: central.id } });
  await db.vaccination.createMany({
    data: [
      { ...meta, name: "Antigripal", dose: "Anual", administeredOn: d("2026-04-20") },
      { ...meta, name: "COVID-19", dose: "Refuerzo", administeredOn: d("2025-10-14") },
      { ...meta, name: "Antitetánica (doble adultos)", dose: "Refuerzo", administeredOn: d("2023-09-05") },
      { ...meta, name: "Hepatitis B", dose: "3 dosis completas", administeredOn: d("2018-02-20") },
    ],
  });
  await db.familyHistory.createMany({
    data: [
      { ...meta, relationship: "Padre", condition: "Diabetes tipo 2" },
      { ...meta, relationship: "Madre", condition: "Hipertensión arterial" },
    ],
  });
  await db.emergencyContact.create({ data: { patientId: p, name: "Laura Demo", relationship: "Hermana", phone: "+54 11 0000-0001" } });

  const lab = "Laboratorio Central (demo)";
  const records: DemoRecord[] = [
    {
      title: "Análisis de sangre completo",
      date: "2026-10-12",
      category: "laboratorio",
      specialty: "Clínica médica",
      institution: lab,
      professional: "Dra. Sofía Ramos",
      description: "Control anual. Hemograma y química básica dentro de valores normales.",
      tags: ["control anual", "hemograma"],
      file: {
        name: "analisis-de-sangre-2026-10-12.pdf",
        mime: "application/pdf",
        body: makePdf("Analisis de sangre completo", "Fecha de extraccion: 12/10/2026  -  Protocolo N 0000-DEMO", [
          ["Hemoglobina", "14,8 g/dL", "13,5 - 17,5 g/dL"],
          ["Hematocrito", "44 %", "41 - 53 %"],
          ["Globulos blancos", "6.800 /mm3", "4.000 - 10.000 /mm3"],
          ["Plaquetas", "245.000 /mm3", "150.000 - 400.000 /mm3"],
          ["Glucemia en ayunas", "92 mg/dL", "70 - 100 mg/dL"],
          ["Creatinina", "0,9 mg/dL", "0,7 - 1,3 mg/dL"],
          ["Uremia", "31 mg/dL", "15 - 45 mg/dL"],
          ["TSH", "2,1 uUI/mL", "0,4 - 4,0 uUI/mL"],
        ], "Valores dentro de los rangos de referencia. Valores ficticios para demostracion."),
      },
    },
    {
      title: "Electrocardiograma",
      date: "2026-08-02",
      category: "cardiologia",
      specialty: "Cardiología",
      institution: "Hospital Central (demo)",
      description: "Ritmo sinusal, 68 lpm. Sin alteraciones agudas.",
      tags: ["ecg"],
      file: { name: "electrocardiograma-2026-08-02.png", mime: "image/png", body: makeEcgPng() },
    },
    {
      title: "Consulta cardiológica",
      date: "2026-08-02",
      category: "cardiologia",
      specialty: "Cardiología",
      institution: "Hospital Central (demo)",
      description: "Control de hipertensión. TA 128/82 mmHg. Se mantiene enalapril. Control en 6 meses.",
    },
    {
      title: "Perfil lipídico",
      date: "2026-04-08",
      category: "laboratorio",
      specialty: "Clínica médica",
      institution: lab,
      tags: ["colesterol"],
      file: {
        name: "perfil-lipidico-2026-04-08.pdf",
        mime: "application/pdf",
        body: makePdf("Perfil lipidico", "Fecha de extraccion: 08/04/2026  -  Protocolo N 0001-DEMO", [
          ["Colesterol total", "238 mg/dL", "< 200 mg/dL"],
          ["Colesterol LDL", "162 mg/dL", "< 130 mg/dL"],
          ["Colesterol HDL", "44 mg/dL", "> 40 mg/dL"],
          ["Trigliceridos", "160 mg/dL", "< 150 mg/dL"],
        ], "LDL y colesterol total por encima del valor deseable. Valores ficticios para demostracion."),
      },
    },
    { title: "Receta: atorvastatina 20 mg", date: "2026-04-10", category: "recetas", specialty: "Clínica médica", professional: "Dra. Sofía Ramos", description: "Una vez por día, a la noche." },
    { title: "Radiografía de tórax", date: "2025-12-20", category: "diagnostico-por-imagenes", specialty: "Diagnóstico por imágenes", institution: "Centro de Imágenes (demo)", description: "Sin hallazgos patológicos.", file: { name: "rx-torax-2025-12-20.png", mime: "image/png", body: makeXrayPng() } },
    { title: "Ergometría", date: "2025-11-15", category: "cardiologia", specialty: "Cardiología", institution: "Hospital Central (demo)", description: "Prueba suficiente, sin signos de isquemia. Capacidad funcional conservada." },
    { title: "Consulta clínica", date: "2025-06-03", category: "clinica-medica", specialty: "Clínica médica", professional: "Dra. Sofía Ramos", description: "Chequeo general. Se solicita análisis de control." },
  ];
  const created = [];
  for (const r of records) created.push({ r, ...(await createDemoRecord(userId, p, r)) });

  // Acceso anterior de la Dra. Sofía Ramos (ya vencido), para que la historia se vea realista.
  const sofiaGrant = await db.accessGrant.create({
    data: {
      patientId: p,
      doctorUserId: sofiaId,
      status: "EXPIRED",
      startsAt: at("2025-06-03", "09:10"),
      expiresAt: at("2025-06-10", "09:10"),
      createdAt: at("2025-06-03", "09:10"),
      permissions: {
        create: [
          { resourceType: "HEALTH_SECTION", resourceKey: "GENERAL", action: "VIEW" },
          { resourceType: "HEALTH_SECTION", resourceKey: "MEDICATIONS", action: "VIEW" },
          { resourceType: "RECORD_CATEGORY", resourceKey: "clinica-medica", action: "VIEW" },
        ],
      },
    },
  });

  // Historial de actividad (eventos de auditoría con fechas pasadas).
  const base = { subjectPatientId: p } as const;
  await audit({ ...base, action: "ACCOUNT_REGISTERED", actorType: "PATIENT", actorUserId: userId, resourceType: "USER", resourceId: userId, createdAt: at("2025-05-02", "20:05"), metadata: { role: "PATIENT" } });
  await audit({ ...base, action: "ACCESS_GRANTED", actorType: "PATIENT", actorUserId: userId, resourceType: "ACCESS_GRANT", resourceId: sofiaGrant.id, grantId: sofiaGrant.id, createdAt: at("2025-06-03", "09:10"), metadata: { sections: ["GENERAL", "MEDICATIONS"], categories: ["clinica-medica"], expiresAt: at("2025-06-10", "09:10").toISOString() } });
  await audit({ ...base, action: "PATIENT_SUMMARY_VIEWED", actorType: "DOCTOR", actorUserId: sofiaId, resourceType: "PATIENT", resourceId: p, grantId: sofiaGrant.id, createdAt: at("2025-06-03", "09:14") });
  await audit({ ...base, action: "ACCESS_EXPIRED", actorType: "SYSTEM", resourceType: "ACCESS_GRANT", resourceId: sofiaGrant.id, grantId: sofiaGrant.id, createdAt: at("2025-06-10", "09:10") });
  for (const c of [...created].reverse()) {
    await audit({ ...base, action: "RECORD_CREATED", actorType: "PATIENT", actorUserId: userId, resourceType: "MEDICAL_RECORD", resourceId: c.record.id, createdAt: at(c.r.date, "18:30"), metadata: { categorySlug: c.r.category, occurredOn: c.r.date, fileCount: c.r.file ? 1 : 0 } });
  }
  await audit({ ...base, action: "LOGIN_SUCCEEDED", actorType: "PATIENT", actorUserId: userId, resourceType: "USER", resourceId: userId, createdAt: new Date(Date.now() - 2 * DAY), ip: "190.12.34.0", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1", metadata: { method: "password" } });
}

async function seedCarla(userId: string, juanId: string) {
  const patient = await db.patientProfile.findUniqueOrThrow({ where: { userId } });
  if ((await db.medicalRecord.count({ where: { patientId: patient.id } })) > 0) return;
  const p = patient.id;
  const meta = { patientId: p, source: "PATIENT" as const, createdById: userId };
  await db.healthProfile.create({ data: { patientId: p, bloodType: "A_POS", heightCm: 164, weightKg: 61 } });
  await db.allergy.create({ data: { ...meta, name: "Ibuprofeno", severity: "MILD", reaction: "Erupción leve" } });
  await db.medication.create({ data: { ...meta, name: "Levotiroxina", dosage: "50 mcg", frequency: "En ayunas" } });
  await db.condition.create({ data: { ...meta, name: "Hipotiroidismo", status: "ACTIVE", diagnosedOn: d("2020-03-01") } });
  await createDemoRecord(userId, p, { title: "Holter de 24 horas", date: "2026-09-21", category: "cardiologia", specialty: "Cardiología", institution: "Clínica Demo Córdoba", description: "Extrasístoles aisladas, sin arritmias significativas." });
  await createDemoRecord(userId, p, { title: "Ecografía abdominal", date: "2026-05-04", category: "diagnostico-por-imagenes", institution: "Clínica Demo Córdoba" });

  // Carla ya autorizó al Dr. Pérez (Cardiología) por 30 días: su panel no arranca vacío.
  const grant = await db.accessGrant.create({
    data: {
      patientId: p,
      doctorUserId: juanId,
      expiresAt: new Date(Date.now() + 30 * DAY),
      permissions: {
        create: [
          { resourceType: "HEALTH_SECTION", resourceKey: "GENERAL", action: "VIEW" },
          { resourceType: "HEALTH_SECTION", resourceKey: "ALLERGIES", action: "VIEW" },
          { resourceType: "HEALTH_SECTION", resourceKey: "MEDICATIONS", action: "VIEW" },
          { resourceType: "RECORD_CATEGORY", resourceKey: "cardiologia", action: "VIEW" },
          { resourceType: "RECORD_CATEGORY", resourceKey: "cardiologia", action: "CREATE_MEDICAL_ENTRY" },
        ],
      },
    },
  });
  await audit({ subjectPatientId: p, action: "ACCESS_GRANTED", actorType: "PATIENT", actorUserId: userId, resourceType: "ACCESS_GRANT", resourceId: grant.id, grantId: grant.id, createdAt: new Date(Date.now() - 3 * DAY), metadata: { sections: ["GENERAL", "ALLERGIES", "MEDICATIONS"], categories: ["cardiologia"], allowCreate: true, expiresAt: grant.expiresAt!.toISOString() } });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
