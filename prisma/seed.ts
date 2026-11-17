/**
 * Datos ficticios para desarrollo. NO contiene información médica real.
 * Idempotente: puede ejecutarse varias veces.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";

if (process.env.NODE_ENV === "production") {
  console.error("El seed de demo no debe ejecutarse en producción.");
  process.exit(1);
}

const password = process.env.SEED_DEMO_PASSWORD;
if (!password) {
  console.error("Definí SEED_DEMO_PASSWORD en .env para crear las cuentas demo.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const passwordHash = await hash(password!, { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 });

  const admin = await db.user.upsert({
    where: { email: "admin@demo.local" },
    update: {},
    create: {
      email: "admin@demo.local",
      passwordHash,
      firstName: "Admin",
      lastName: "Demo",
      roles: { create: { role: "ADMIN" } },
    },
  });

  const martin = await db.user.upsert({
    where: { email: "martin@demo.local" },
    update: {},
    create: {
      email: "martin@demo.local",
      passwordHash,
      firstName: "Martín",
      lastName: "Demo",
      roles: { create: { role: "PATIENT" } },
      patientProfile: {
        create: {
          dateOfBirth: new Date("1990-04-12T00:00:00.000Z"),
          sex: "MALE",
          documentId: "00000000",
          phone: "+54 11 0000-0000",
          province: "AR-C",
          city: "Palermo",
        },
      },
    },
  });

  // Médico verificado
  await db.user.upsert({
    where: { email: "juan.perez@demo.local" },
    update: {},
    create: {
      email: "juan.perez@demo.local",
      passwordHash,
      firstName: "Juan",
      lastName: "Pérez",
      roles: { create: { role: "DOCTOR" } },
      doctorProfile: {
        create: {
          specialty: "Clínica médica",
          licenseNumber: "MN-000001",
          jurisdiction: "AR-NAC",
          verificationStatus: "VERIFIED",
          verifiedAt: new Date(),
          verifications: {
            create: [
              { status: "PENDING", note: "Solicitud de verificación enviada" },
              { status: "VERIFIED", note: "Matrícula verificada (dato de demo)", reviewerId: admin.id },
            ],
          },
        },
      },
    },
  });

  // Médica pendiente, para probar el flujo de aprobación desde administración
  await db.user.upsert({
    where: { email: "laura.gomez@demo.local" },
    update: {},
    create: {
      email: "laura.gomez@demo.local",
      passwordHash,
      firstName: "Laura",
      lastName: "Gómez",
      roles: { create: { role: "DOCTOR" } },
      doctorProfile: {
        create: {
          specialty: "Pediatría",
          licenseNumber: "MP-000002",
          jurisdiction: "AR-X",
          verifications: { create: { status: "PENDING", note: "Solicitud de verificación enviada" } },
        },
      },
    },
  });

  // Segunda paciente, útil para comprobar a mano el aislamiento entre pacientes.
  const carla = await db.user.upsert({
    where: { email: "carla@demo.local" },
    update: {},
    create: {
      email: "carla@demo.local",
      passwordHash,
      firstName: "Carla",
      lastName: "Demo",
      roles: { create: { role: "PATIENT" } },
      patientProfile: { create: { province: "AR-X", city: "Córdoba" } },
    },
  });

  await seedMedicalData(martin.id);
  await seedCarla(carla.id);

  console.info("Seed completado. Cuentas demo (contraseña = SEED_DEMO_PASSWORD):");
  console.table([
    { rol: "Paciente", nombre: "Martín Demo", email: "martin@demo.local" },
    { rol: "Paciente", nombre: "Carla Demo", email: "carla@demo.local" },
    { rol: "Médico (verificado)", nombre: "Dr. Juan Pérez", email: "juan.perez@demo.local" },
    { rol: "Médica (pendiente)", nombre: "Dra. Laura Gómez", email: "laura.gomez@demo.local" },
    { rol: "Administrador", nombre: "Admin Demo", email: "admin@demo.local" },
  ]);
}

// ─── Datos médicos ficticios ────────────────────────────────────────────────

function normalize(v: string) {
  return v.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** PDF mínimo válido de una página con un texto. */
function makePdf(lines: string[]): Buffer {
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 18 : 12} Tf 60 ${760 - i * 26} Td (${l.replace(/[()\\]/g, "")}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(text, "latin1")} >>\nstream\n${text}\nendstream`,
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

/** PNG simple (degradado) generado sin dependencias. */
function makePng(width: number, height: number): Buffer {
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const g = Math.round(30 + (200 * x) / width);
      raw[row + 1 + x * 3] = g;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = Math.min(255, g + 20);
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
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
  file?: { name: string; kind: "pdf" | "png" };
};

async function createDemoRecord(userId: string, patientId: string, r: DemoRecord) {
  const category = await db.medicalCategory.findUniqueOrThrow({ where: { slug: r.category } });
  const inst = r.institution ? await institution(patientId, r.institution) : null;
  let file = null;
  if (r.file) {
    const body = r.file.kind === "pdf" ? makePdf([r.title, `Fecha: ${r.date}`, "Documento de demostración con datos ficticios.", "No contiene información médica real."]) : makePng(640, 400);
    const key = await storeFile(body);
    if (key) {
      file = {
        patientId,
        storageKey: key,
        originalName: r.file.name,
        mimeType: r.file.kind === "pdf" ? "application/pdf" : "image/png",
        sizeBytes: body.length,
        sha256: createHash("sha256").update(body).digest("hex"),
        uploadedById: userId,
      };
    }
  }
  await db.medicalRecord.create({
    data: {
      patientId,
      title: r.title,
      occurredOn: new Date(`${r.date}T00:00:00.000Z`),
      categoryId: category.id,
      specialty: r.specialty ?? null,
      institutionId: inst?.id ?? null,
      professionalName: r.professional ?? null,
      description: r.description ?? null,
      tags: r.tags ?? [],
      source: "PATIENT",
      createdById: userId,
      searchText: normalize([r.title, category.name, r.specialty, inst?.name, r.professional, r.description, ...(r.tags ?? []), file?.originalName].filter(Boolean).join(" ")),
      files: file ? { create: file } : undefined,
    },
  });
}

async function seedMedicalData(userId: string) {
  const patient = await db.patientProfile.findUniqueOrThrow({ where: { userId } });
  if ((await db.medicalRecord.count({ where: { patientId: patient.id } })) > 0) return; // idempotente
  const p = patient.id;
  const meta = { patientId: p, source: "PATIENT" as const, createdById: userId };

  await db.healthProfile.upsert({ where: { patientId: p }, create: { patientId: p, bloodType: "O_POS", heightCm: 178, weightKg: 76.5 }, update: {} });
  await db.emergencyProfile.upsert({ where: { patientId: p }, create: { patientId: p, additionalNotes: "Dato de demo: donante de órganos." }, update: {} });
  await db.allergy.createMany({ data: [{ ...meta, name: "Penicilina", severity: "SEVERE", reaction: "Urticaria generalizada" }, { ...meta, name: "Maní", severity: "MODERATE" }] });
  await db.condition.createMany({ data: [{ ...meta, name: "Hipertensión arterial", status: "ACTIVE", diagnosedOn: new Date("2021-06-01") }, { ...meta, name: "Asma infantil", status: "RESOLVED" }] });
  await db.medication.create({ data: { ...meta, name: "Enalapril", dosage: "10 mg", frequency: "Cada 12 horas", startedOn: new Date("2021-06-15") } });
  const hospital = await institution(p, "Hospital Central (demo)");
  await db.surgery.create({ data: { ...meta, name: "Apendicectomía", performedOn: new Date("2015-03-10"), institutionId: hospital.id } });
  await db.hospitalization.create({ data: { ...meta, reason: "Neumonía", admittedOn: new Date("2019-07-02"), dischargedOn: new Date("2019-07-06"), institutionId: hospital.id } });
  await db.vaccination.createMany({ data: [{ ...meta, name: "Antigripal", dose: "Anual", administeredOn: new Date("2026-04-20") }, { ...meta, name: "Antitetánica", dose: "Refuerzo", administeredOn: new Date("2023-09-05") }] });
  await db.familyHistory.create({ data: { ...meta, relationship: "Padre", condition: "Diabetes tipo 2" } });
  await db.emergencyContact.create({ data: { patientId: p, name: "Laura Demo", relationship: "Hermana", phone: "+54 11 0000-0001" } });

  const records: DemoRecord[] = [
    { title: "Análisis de sangre completo", date: "2026-10-12", category: "laboratorio", specialty: "Clínica médica", institution: "Laboratorio Demo", description: "Hemograma, glucemia y perfil lipídico. Control anual.", tags: ["control anual", "hemograma"], file: { name: "analisis-sangre-2026.pdf", kind: "pdf" } },
    { title: "Consulta cardiológica", date: "2026-09-15", category: "cardiologia", specialty: "Cardiología", institution: "Hospital Central (demo)", professional: "Dr. Juan Pérez", description: "Control de presión arterial. Continuar con enalapril." },
    { title: "Electrocardiograma", date: "2026-08-02", category: "cardiologia", specialty: "Cardiología", institution: "Hospital Central (demo)", professional: "Dr. Juan Pérez", tags: ["ecg"], file: { name: "ecg-agosto.pdf", kind: "pdf" } },
    { title: "Radiografía de tórax", date: "2025-12-20", category: "diagnostico-por-imagenes", specialty: "Diagnóstico por imágenes", institution: "Centro de Imágenes Demo", description: "Sin hallazgos patológicos.", file: { name: "rx-torax.png", kind: "png" } },
  ];
  for (const r of records) await createDemoRecord(userId, p, r);
}

async function seedCarla(userId: string) {
  const patient = await db.patientProfile.findUniqueOrThrow({ where: { userId } });
  if ((await db.medicalRecord.count({ where: { patientId: patient.id } })) > 0) return;
  await db.allergy.create({ data: { patientId: patient.id, name: "Ibuprofeno", severity: "MILD", source: "PATIENT", createdById: userId } });
  await createDemoRecord(userId, patient.id, {
    title: "Ecografía abdominal (privada de Carla)",
    date: "2026-05-04",
    category: "diagnostico-por-imagenes",
    institution: "Clínica Demo Córdoba",
    file: { name: "ecografia-carla.pdf", kind: "pdf" },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
