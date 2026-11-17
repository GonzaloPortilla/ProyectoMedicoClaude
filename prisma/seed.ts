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

  await db.user.upsert({
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

  console.info("Seed completado. Cuentas demo (contraseña = SEED_DEMO_PASSWORD):");
  console.table([
    { rol: "Paciente", nombre: "Martín Demo", email: "martin@demo.local" },
    { rol: "Médico (verificado)", nombre: "Dr. Juan Pérez", email: "juan.perez@demo.local" },
    { rol: "Médica (pendiente)", nombre: "Dra. Laura Gómez", email: "laura.gomez@demo.local" },
    { rol: "Administrador", nombre: "Admin Demo", email: "admin@demo.local" },
  ]);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
