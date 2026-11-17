# Vitalia — Información médica personal

Base de una aplicación web para que pacientes guarden su información médica y la compartan sólo con médicos que ellos autoricen.

| Fase | Estado | Contenido |
| --- | --- | --- |
| 1 | ✅ | Autenticación, usuarios, roles (paciente / médico / administrador), perfiles, dashboards, verificación manual de médicos |
| 2 | ✅ | Experiencia del paciente: Mi salud, estudios con archivos privados, historial cronológico, buscador, información de emergencia |
| 3 | Pendiente | Médicos accediendo con autorización del paciente, solicitudes de acceso, registro de accesos |

## Stack

| Capa | Elección |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components, Server Actions) + React 19 |
| Lenguaje | TypeScript (strict) |
| Estilos | Tailwind CSS 4 |
| Base de datos | PostgreSQL 16 |
| ORM | Prisma 7 (driver adapter `@prisma/adapter-pg`) |
| Validación | Zod 4 (mismos esquemas en cliente y servidor) |
| Hash de contraseñas | Argon2id (`@node-rs/argon2`, parámetros OWASP) |
| Archivos | Storage privado intercambiable: disco local (desarrollo) o S3 compatible (`@aws-sdk/client-s3`) |
| Tests | Vitest (unitarios + integración contra PostgreSQL) |

**¿Por qué Prisma?** Las migraciones y el modelo declarativo hacen que el esquema sea fácil de leer y revisar, y el cliente tipado reduce errores en la capa de datos. Para un dominio que va a crecer con muchas relaciones (permisos, documentos, auditoría) es la opción más mantenible.

**¿Por qué auth propia y no una librería?** El modelo pide sesiones en base de datos, roles múltiples y control fino. Con unas 300 líneas (`src/server/auth/`) se obtienen sesiones revocables, con token aleatorio guardado sólo como hash, sin dependencias opacas.

## Requisitos

- Node.js ≥ 20.19
- PostgreSQL ≥ 14

## Puesta en marcha

```bash
npm install
```

```bash
cp .env.example .env
```

Editá `.env` con tu conexión a PostgreSQL. Crear el usuario y las bases (ejemplo con `psql`):

```bash
psql -U postgres -c "CREATE USER medapp WITH PASSWORD 'tu_password' CREATEDB;" -c "CREATE DATABASE medapp OWNER medapp;" -c "CREATE DATABASE medapp_test OWNER medapp;"
```

Aplicar migraciones y cargar datos demo:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

Levantar en desarrollo:

```bash
npm run dev
```

Abrí http://localhost:3000.

### Cuentas demo

Todas usan la contraseña definida en `SEED_DEMO_PASSWORD` (en `.env`). Datos 100 % ficticios.

| Rol | Nombre | Email |
| --- | --- | --- |
| Paciente | Martín Demo (con datos de salud y estudios de demo) | `martin@demo.local` |
| Paciente | Carla Demo (para probar aislamiento) | `carla@demo.local` |
| Médico (verificado) | Dr. Juan Pérez | `juan.perez@demo.local` |
| Médica (pendiente) | Dra. Laura Gómez | `laura.gomez@demo.local` |
| Administrador | Admin Demo | `admin@demo.local` |

Los administradores no se pueden registrar desde la web: se crean por seed o directamente en la base.

### Documentos médicos (almacenamiento)

Los archivos **nunca** quedan accesibles por una URL pública. Se guardan con una clave aleatoria (sin nombre de archivo ni datos del paciente) y se sirven sólo a través de `GET /api/files/[fileId]`, que en cada request valida **sesión → rol → propiedad** antes de leer el storage.

- **Desarrollo** (`STORAGE_DRIVER=local`): se guardan en `./storage/private/` (fuera de `public/`, ignorado por git, permisos `0600`).
- **Producción** (`STORAGE_DRIVER=s3`): cualquier object storage compatible con S3 (AWS S3, Cloudflare R2, MinIO). El bucket debe ser **privado** (Block Public Access activado). Los objetos se suben con cifrado del lado del servidor (SSE-AES256) y sin ACL. Variables: `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` (si no es AWS), `S3_FORCE_PATH_STYLE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.

Formatos aceptados: PDF, JPG/JPEG y PNG, hasta 15 MB. El tipo se valida por los **bytes del archivo** (firma), no por la extensión ni por el MIME que manda el navegador.

### Recuperación de contraseña

En `/forgot-password` se genera un enlace de un solo uso que vence en 30 minutos. Todavía no hay proveedor de email: con `MAIL_TRANSPORT=console` el enlace **se imprime en la consola del servidor**. Para producción hay que implementar un proveedor en `src/server/mail/mailer.ts`.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build y servidor de producción |
| `npm run typecheck` | TypeScript sin emitir |
| `npm run lint` | ESLint |
| `npm test` | Tests (los de integración necesitan `TEST_DATABASE_URL`; si falta, se omiten) |
| `npm run db:migrate` | Crear/aplicar migraciones en desarrollo |
| `npm run db:deploy` | Aplicar migraciones en producción |
| `npm run db:seed` | Datos demo (se niega a correr con `NODE_ENV=production`) |
| `npm run db:reset` | Borra la base, re-migra y vuelve a cargar el seed |
| `npm run db:studio` | Prisma Studio |

## Arquitectura

```
prisma/
  schema.prisma          Modelo de datos
  migrations/            Migraciones SQL versionadas
  seed.ts                Datos demo
src/
  proxy.ts               Redirección optimista si no hay cookie (no es la barrera de seguridad)
  app/
    page.tsx             Landing
    api/files/[fileId]/  Entrega de archivos médicos (valida sesión + propiedad)
    (auth)/              login, register, register/doctor, forgot-password, reset-password
    (app)/               Área autenticada (layout con sidebar)
      dashboard/         Redirige al panel del rol principal
      patient/           Inicio, Mi salud, Estudios, Historial, Emergencia, Buscar, Mi perfil
      doctor/            Panel profesional
      admin/             Resumen, usuarios y verificación de médicos
  features/<dominio>/    schemas.ts (Zod), actions.ts (server actions), queries.ts, components/
  server/
    auth/                password, tokens, sesiones, cookies, DAL de autorización, servicio, rate limit
    db.ts, env.ts        Cliente Prisma y variables de entorno validadas
    mail/                Abstracción de email
    patient/context.ts   Resuelve el patientId SIEMPRE desde la sesión
    medical/             Servicios: registros, Mi salud, historial, búsqueda, instituciones
    storage/             Drivers de almacenamiento privado (local / S3)
    files/               Validación de archivos y control de acceso
  components/            UI compartida (botones, campos, cards, shell)
  lib/                   Utilidades puras (jurisdicciones, formato, formularios)
tests/
  unit/                  Hashing, roles, rate limit, validaciones
  integration/           Auth, registros médicos, historial, búsqueda y AISLAMIENTO entre pacientes
```

Flujo de una petición: **página / server action → DAL (`requireRole` / `authorizeRole`) → validación Zod → servicio / query con `select` explícito → Prisma**.

## Modelo de datos

- **User**: identidad y credenciales (`passwordHash`, nunca la contraseña), estado `ACTIVE`/`SUSPENDED`.
- **UserRole**: tabla `(userId, role)`. Una persona puede tener varios roles a lo largo del tiempo (por ejemplo, un médico que también es paciente) sin duplicar cuentas. Guarda quién otorgó el rol.
- **PatientProfile**: datos básicos del paciente (nacimiento, sexo, documento, teléfono, provincia, ciudad).
- **DoctorProfile**: especialidad, matrícula, jurisdicción y `verificationStatus` (`PENDING` / `VERIFIED` / `REJECTED`). La matrícula es única por jurisdicción.
- **DoctorVerification**: historial de cada decisión (estado, nota, revisor, fecha), que sólo crece. Sirve como base para la auditoría futura.
- **Session**: el `id` es el SHA-256 del token; el token en claro sólo vive en la cookie. Guarda IP, user agent y expiración.
- **PasswordResetToken**: hash del token, expiración y marca de uso.

Los perfiles están separados por rol a propósito: los permisos futuros (paciente autoriza a médico, auditoría de accesos) se podrán aplicar por tipo de dato.

### Información médica (Fase 2)

Todo cuelga de `PatientProfile` (`patientId`), y cada dato clínico guarda su **origen** (`source`: `PATIENT` | `DOCTOR` | `SYSTEM`) y su **autor** (`createdById`). En esta fase casi todo lo carga el paciente; en la próxima, un médico autorizado podrá crear registros con `source = DOCTOR` sin cambiar el modelo.

- **MedicalCategory**: catálogo extensible (slug, nombre, orden, activo). Las 20 categorías iniciales se insertan en la propia migración.
- **MedicalRecord**: un hecho médico fechado (estudio, consulta, informe, receta…) con categoría, especialidad, institución, profesional, descripción y tags. Es la unidad del historial y de la búsqueda (`searchText` normalizado, sin acentos).
- **MedicalFile**: metadatos del archivo (clave en el storage, nombre original, MIME detectado, tamaño, SHA-256). 0..n por registro.
- **Institution**: instituciones normalizadas **por paciente** (no se comparten entre pacientes para no filtrar dónde se atiende alguien).
- **HealthProfile**: grupo sanguíneo, altura y peso.
- **Allergy, Condition, Medication, Surgery, Hospitalization, Vaccination, FamilyHistory, EmergencyContact**: una tabla por tipo de dato.
- **EmergencyProfile**: qué secciones muestra la ficha de emergencia (todavía sin acceso público ni QR).

El **historial** se arma al vuelo combinando `MedicalRecord` con los datos fechados de Mi salud (cirugías, internaciones, vacunas), sin duplicar información.

## Seguridad

- **Autorización en el servidor:** cada layout, página y server action verifica la sesión contra la base y el rol (`src/server/auth/dal.ts`). El menú sólo muestra u oculta enlaces; no protege nada. El `proxy` sólo evita renderizar si falta la cookie.
- **Sesiones:** token aleatorio de 256 bits, cookie `httpOnly`, `SameSite=Lax`, `Secure` en producción y expiración de 7 días. Se pueden revocar (logout las borra). Al restablecer la contraseña se cierran todas las sesiones.
- **Contraseñas:** Argon2id (19 MiB, t=2). Para un email inexistente igual se calcula un hash, así el tiempo de respuesta no revela qué cuentas existen.
- **Validación server-side** con Zod en todas las entradas, incluidos los `searchParams`.
- **No revelar qué emails existen:** el login usa un mensaje genérico y la recuperación responde lo mismo exista o no la cuenta.
- **Rate limiting** de login, registro y recuperación. Está en memoria: con varias instancias hay que reemplazarlo por Redis manteniendo la interfaz.
- **CSRF:** Next.js verifica `Origin` contra `Host` en server actions, y la cookie usa `SameSite=Lax`.
- **Cabeceras:** `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS en producción.
- **Mínimo privilegio del administrador:** gestiona cuentas y verificaciones, pero no puede entrar al área de pacientes, y sus consultas (`src/features/admin/queries.ts`) usan `select` explícito sin datos de `PatientProfile`. Nadie puede revisar su propia matrícula.
- **Aislamiento entre pacientes:** el `patientId` se obtiene siempre de la sesión (`src/server/patient/context.ts`), nunca de la URL o del formulario. Toda consulta filtra por él; un id ajeno responde 404, igual que uno inexistente. Cubierto por `tests/integration/patient-isolation.test.ts`.
- **Archivos:** validación por firma de bytes, nombres saneados, claves aleatorias, `Cache-Control: no-store`, `nosniff` y CSP restrictiva al servirlos. Ni el administrador ni los médicos (todavía) pueden abrirlos.
- **Secretos:** sólo en `.env` (ignorado por git); `.env.example` no tiene valores reales.

## Pendiente para próximas fases

- Autorizaciones paciente → médico con vencimiento, y registro de cada acceso (el punto de extensión es `src/server/files/access.ts`).
- Edición de datos ya cargados (hoy se agregan y eliminan).
- Acceso público a la ficha de emergencia (QR) con controles propios.
- Escaneo antivirus de archivos subidos.
- Proveedor real de email y verificación de email.
- Rate limiting distribuido, 2FA para médicos y administradores.
