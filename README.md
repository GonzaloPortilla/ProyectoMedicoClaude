# Vitalia

**Tu información médica, segura y en un solo lugar.** El paciente guarda su historia clínica, sus estudios y su información de emergencia, y decide qué médico la ve, qué parte y por cuánto tiempo. Cada acceso queda registrado.

> MVP de demostración. Todos los datos incluidos son ficticios. Antes de usar datos reales hay que completar el checklist de producción de [SECURITY.md](SECURITY.md#7-checklist-de-producción).

| Documento | Contenido |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, capas, estructura de carpetas, decisiones de diseño |
| [DATABASE.md](DATABASE.md) | Modelo de datos, relaciones, triggers, migraciones y seed |
| [SECURITY.md](SECURITY.md) | Modelo de amenazas, controles, auditoría, privacidad, checklist de producción |
| [ROADMAP.md](ROADMAP.md) | Qué incluye el MVP y funcionalidades futuras |
| [docs/DEMO.md](docs/DEMO.md) | Guion paso a paso para presentar la aplicación |

## Qué hace

- **Paciente**: guarda su información de salud (alergias, medicación, antecedentes, cirugías, vacunas…), sube estudios en PDF o en imagen —la app **lee el documento** (también fotos y PDF escaneados, con OCR local), propone sus datos y detecta resultados de laboratorio para que los revise—, sigue la **evolución** de sus resultados en el tiempo, ve su historial cronológico, busca en su información, prepara su ficha de emergencia, comparte su información con médicos de forma granular y temporal, y ve quién accedió a qué.
- **Médico** (con matrícula verificada): solicita acceso con un código que le da el paciente, ve **sólo** lo autorizado mientras el acceso esté vigente y crea informes firmados que nunca se reemplazan en silencio.
- **Administrador**: gestiona cuentas y verifica matrículas, **sin** acceso a información médica.

## Requisitos

- **Node.js 20.19 o superior** (probado con Node 22).
- **PostgreSQL 14 o superior**, local con Docker (incluido) o instalado en el sistema.
- npm 10 o superior.

## Instalación

Los comandos funcionan igual en Windows (PowerShell), macOS y Linux, salvo donde se indica.

**1. Dependencias**

```bash
npm install
```

También genera el cliente de Prisma automáticamente.

**2. Variables de entorno**

Windows (PowerShell):

```powershell
Copy-Item .env.example .env
```

macOS / Linux:

```bash
cp .env.example .env
```

**3. Base de datos**

Con Docker Desktop abierto:

```bash
docker compose up -d
```

Sin Docker: instalá PostgreSQL (https://www.postgresql.org/download/) y, con `psql` o pgAdmin, ejecutá:

```sql
CREATE USER medapp WITH PASSWORD 'medapp_dev_password' CREATEDB;
CREATE DATABASE medapp OWNER medapp;
CREATE DATABASE medapp_test OWNER medapp;
```

Si tu PostgreSQL usa otro puerto (por ejemplo 3000), ajustá `DATABASE_URL` y `TEST_DATABASE_URL` en `.env`.

**4. Migraciones**

```bash
npm run db:deploy
```

**5. Datos de demostración**

```bash
npm run db:seed
```

**6. Ejecutar**

```bash
npm run dev
```

Abrí http://localhost:3000. Si el puerto está ocupado (por ejemplo, por PostgreSQL), usá `npm run dev -- --port 3001` y poné `APP_URL="http://localhost:3001"` en `.env`.

## Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | Sí | Conexión a PostgreSQL. |
| `TEST_DATABASE_URL` | Para tests | Base separada para los tests de integración (si falta, esos tests se omiten). |
| `APP_URL` | Sí | URL pública; se usa en los enlaces de los emails. |
| `APP_SECRET` | En producción | Secreto de ≥ 32 caracteres (`openssl rand -base64 48`). Firma los enlaces temporales de archivos y cifra los secretos MFA. En desarrollo hay uno de ejemplo; la app se niega a usarlo en producción. |
| `MFA_REQUIRED_ROLES` | No | Roles con verificación en dos pasos obligatoria. Por defecto: `ADMIN` en producción y ninguno en desarrollo. |
| `STORAGE_DRIVER` | No | `local` (por defecto, carpeta privada en disco) o `s3`. |
| `LOCAL_STORAGE_DIR` | No | Carpeta del storage local (por defecto `./storage/private`). |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Con `s3` | Object storage compatible con S3 (bucket **privado**). |
| `MAIL_TRANSPORT` | No | `console` imprime los emails en la consola (desarrollo). En producción hay que conectar un proveedor real. |
| `SEED_DEMO_PASSWORD` | Para el seed | Contraseña de las cuentas demo. |
| `DOCUMENT_EXTRACTION` | No | `local` (por defecto) o `disabled`. Análisis automático de estudios. |
| `OCR_PROVIDER` | No | `tesseract` (por defecto, OCR local en español, sin red) o `none`. |
| `OCR_MAX_PAGES` | No | Páginas de un PDF escaneado que se leen con OCR (por defecto 3). |

## Cuentas demo

Todas usan la contraseña de `SEED_DEMO_PASSWORD` (en `.env.example`: `Demo1234!`).

| Rol | Nombre | Email | Situación inicial |
| --- | --- | --- | --- |
| Paciente | Martín Demo | `martin@demo.local` | Historia completa: alergias, medicación, antecedentes, vacunas, 11 estudios (análisis de laboratorio de 2023 a 2026 ya leídos y confirmados para **Evolución**, y un perfil lipídico **por revisar**). Ningún médico con acceso; un acceso anterior ya vencido. |
| Paciente | Carla Demo | `carla@demo.local` | Algunos estudios; ya autorizó al Dr. Pérez (Cardiología). |
| Médico | Dr. Juan Pérez · Cardiología | `juan.perez@demo.local` | Verificado; atiende a Carla. |
| Médica | Dra. Sofía Ramos · Clínica médica | `sofia.ramos@demo.local` | Verificada; tuvo acceso a Martín (vencido). |
| Médica | Dra. Laura Gómez · Pediatría | `laura.gomez@demo.local` | Matrícula pendiente de verificación. |
| Administrador | Admin Demo | `admin@demo.local` | En producción debe configurar MFA al ingresar. |

Para volver la demo a su estado inicial antes de una presentación (borra **todos** los datos de la base; sólo desarrollo):

```bash
npm run demo:reset
```

El guion completo de demostración está en [docs/DEMO.md](docs/DEMO.md).

### Archivos de ejemplo para la carga inteligente

`docs/samples/` trae tres estudios ficticios: un PDF con texto (`laboratorio_noviembre.pdf`), una foto (`laboratorio_foto.jpg`) y un PDF escaneado (`laboratorio_escaneado.pdf`). Se regeneran con `npm run demo:samples`.

## Tests

```bash
npm test
```

Ejecuta 220 tests unitarios y de integración contra la base de `TEST_DATABASE_URL`: aislamiento entre pacientes, los casos de seguridad del acceso médico (sin autorización, otro paciente, categoría no permitida, vencido, revocado, ids manipulados), fuerza bruta, MFA, auditoría inmutable, archivos, extracción y OCR, documento original inmutable, permisos sobre mediciones, duplicados y más.

Otros controles:

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run audit:verify
```

El último verifica que nadie haya alterado el registro de auditoría.

## Build de producción

```bash
npm run build
```

```bash
npm start
```

En producción, configurá `APP_SECRET`, un proveedor de email, el storage S3 y el resto del [checklist de producción](SECURITY.md#7-checklist-de-producción). Las migraciones se aplican con `npm run db:deploy`.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build y servidor de producción |
| `npm run typecheck` / `npm run lint` / `npm test` | TypeScript, ESLint y tests |
| `npm run db:deploy` | Aplica las migraciones pendientes |
| `npm run db:migrate` | Crea una migración nueva durante el desarrollo |
| `npm run db:seed` | Carga los datos demo (idempotente) |
| `npm run demo:reset` | Borra todo y recarga la demo (sólo desarrollo) |
| `npm run db:studio` | Prisma Studio |
| `npm run audit:verify` | Verifica la cadena de hashes de la auditoría |
| `npm run jobs:expire-access` | Marca y registra los accesos vencidos (para programar con cron) |
| `npm run demo:samples` | Genera los estudios de ejemplo de `docs/samples/` |

## Problemas frecuentes

| Síntoma | Solución |
| --- | --- |
| `Configuración incompleta (DATABASE_URL)` | Falta el `.env` (paso 2). Reiniciá `npm run dev` después de crearlo. |
| `Can't reach database server` | PostgreSQL no está corriendo o el puerto de `DATABASE_URL` no es el correcto. |
| `Authentication failed … medapp` | El usuario `medapp` no existe o tiene otra contraseña (paso 3). |
| `Module not found: '@/generated/prisma/client'` | Corré `npm run db:generate`. |
| "Tenés que verificar tu email" | En desarrollo, el enlace de activación aparece en la consola de `npm run dev`. Las cuentas demo ya están verificadas. |
| "Demasiados intentos" | La cuenta se bloquea 15 minutos tras 5 intentos fallidos. Esperá o corré `npm run demo:reset`. |
| La página se ve sin estilos | Borrá la carpeta `.next` y volvé a correr `npm run dev`. |
| Un estudio queda "Analizando…" mucho tiempo | Si el servidor se reinició durante el análisis, abrí el estudio y tocá *Reintentar análisis*. El archivo original no se pierde. |
| "No pudimos leer el contenido automáticamente" | El documento no tiene texto legible (foto muy borrosa, manuscrito). El estudio queda guardado igual; completá sus datos a mano. |
| Errores de archivos bloqueados en Windows | Evitá carpetas sincronizadas por OneDrive (por ejemplo, usá `C:\dev\`). |

## Stack

Next.js 16 (App Router, Server Components, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL · Prisma 7 · Zod 4 · Argon2id · pdf.js (`unpdf`) · Tesseract.js (OCR local) · Vitest · Playwright (pruebas manuales end-to-end). Los detalles están en [ARCHITECTURE.md](ARCHITECTURE.md).
