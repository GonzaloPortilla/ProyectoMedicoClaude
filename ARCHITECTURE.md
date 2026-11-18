# Arquitectura

## Visión general

Vitalia es una aplicación web monolítica en **Next.js 16 (App Router)**. El mismo proyecto renderiza la interfaz (Server Components), recibe las acciones de los formularios (Server Actions) y expone dos endpoints HTTP (archivos y exportación). La persistencia es **PostgreSQL** a través de **Prisma 7**; los archivos médicos viven en un **storage privado** intercambiable (disco local o S3).

```
Navegador ──HTTPS──▶ proxy.ts (CSP con nonce + chequeo optimista de sesión)
                        │
                        ▼
              App Router (Server Components / Server Actions / Route Handlers)
                        │   ← autorización SIEMPRE acá (DAL + política de acceso)
                        ▼
              Servicios de dominio (src/server/*)  ──▶  Auditoría (append-only)
                        │                      │
                        ▼                      ▼
                   PostgreSQL            Storage privado (local / S3)
```

Principios:

1. **El servidor es la única fuente de verdad para autorizar.** La UI sólo muestra u oculta; cada página, acción y endpoint vuelve a verificar.
2. **El dueño de los datos sale de la sesión**, nunca de la URL o del formulario (`patientId`, `userId`).
3. **Consultas mínimas**: cada consulta pide sólo los campos y recursos que el usuario puede ver.
4. **Servicios independientes de Next.js** (no leen cookies ni headers) para poder testearlos en aislamiento.
5. **Sin complejidad innecesaria**: un único proceso y sin colas ni microservicios. Lo que haga falta para escalar está documentado (rate limit distribuido, S3).

## Estructura de carpetas

```
prisma/
  schema.prisma            Modelo de datos (ver DATABASE.md)
  migrations/              Migraciones SQL versionadas (incluye triggers de inmutabilidad)
  seed.ts                  Datos de demostración (ficticios)
scripts/                   audit-verify, expire-access
src/
  proxy.ts                 CSP con nonce por request + redirección optimista sin cookie
  app/
    page.tsx               Landing
    (auth)/                login (+ MFA), registro, verificación de email, recuperación
    (app)/                 Área autenticada (layout con barra lateral / barra inferior móvil)
      patient/             Inicio, Mi salud, Estudios, Historial, Mis médicos, Emergencia, Buscar
      doctor/              Panel, vista de paciente autorizado, registros, informes
      admin/               Resumen, usuarios, verificación de médicos
      settings/            Datos personales, Seguridad, Privacidad, Actividad
    api/files/[fileId]/    Entrega de archivos (sesión + permiso + enlace firmado)
    api/export/            Exportación de datos personales (POST, mismo origen)
  features/<dominio>/      UI + schemas (Zod) + server actions por dominio:
                           auth, patient, health, records, access, doctor, admin, settings
  server/                  Lógica de servidor (nunca llega al navegador: "server-only")
    auth/                  sesiones, cookies, DAL, servicio de autenticación, MFA/TOTP, rate limit
    access/                política de acceso médico, códigos, solicitudes/grants, vista del médico, vencimientos
    medical/               registros, Mi salud, historial, búsqueda, informes, instituciones
    audit/                 registro de auditoría, contexto de request, "Actividad de mi cuenta"
    files/                 validación, limpieza de metadatos, URLs firmadas, control de acceso, antivirus (hook)
    storage/               drivers local y S3
    crypto/                HKDF, HMAC, AES-256-GCM
    documents/             Fase 6: procesamiento de estudios
      extraction/          DocumentExtractionService (contrato) + proveedores locales: unpdf (texto/render de PDF), Tesseract (OCR)
      analysis/            lógica pura: metadatos propuestos, resultados de laboratorio, números, conceptos normalizados
      process.ts           pipeline UPLOADED → PROCESSING → READY_FOR_REVIEW / FAILED
      review.ts            revisión del paciente (datos del estudio, confirmar / descartar / corregir resultados)
      measurements.ts      lecturas de Evolución (paciente y médico, con filtro de permisos)
      duplicates.ts        mismo archivo (hash) y posibles duplicados (fecha, institución, título)
    privacy/               exportación de datos
    patient/, doctor/      contexto de paciente / médico para páginas y acciones
  components/              UI compartida (botones, campos, tarjetas, diálogos, estados vacíos, navegación)
  lib/                     Utilidades puras (formato, texto, jurisdicciones, nombres de cookies)
tests/
  unit/                    Lógica pura y criptografía
  integration/             Servicios contra PostgreSQL real (aislamiento, acceso médico, auditoría…)
docs/DEMO.md               Guion de demostración
```

## Flujo de una request

**Página** (por ejemplo `/doctor/patients/[patientId]`):

1. `proxy.ts` agrega la CSP con nonce y, si no hay cookie, redirige a `/login`.
2. El layout `(app)` llama a `requireUser()`: valida la sesión contra la base (vencimiento absoluto y por inactividad, usuario activo).
3. La página llama a `requireDoctorAccess(patientId)`: médico verificado y **acceso vigente** según `src/server/access/policy.ts`. Sin acceso → 404 con un mensaje claro, y el intento queda auditado.
4. Las consultas (`doctor-view.ts`) piden a la base sólo las secciones y categorías permitidas.
5. La vista queda auditada (`PATIENT_SUMMARY_VIEWED`) y el paciente la ve en su actividad.

**Server action** (por ejemplo, aprobar una solicitud):

1. `authorizePatient()`: sesión + rol `PATIENT`, y deriva el `patientId` de la sesión.
2. Validación con Zod (los mismos esquemas que usa el formulario).
3. Servicio de dominio (transacción) y luego auditoría.
4. `revalidatePath`, más `redirect` con un aviso de éxito, o un `FormState` con errores por campo.
5. `withFormErrors` convierte errores inesperados (por ejemplo, la base caída) en un mensaje amable.

**Archivo** (`GET /api/files/[id]?exp&sig`): sesión, permiso (dueño o médico con VIEW sobre la categoría), firma HMAC atada a usuario y archivo vigente, y auditoría. Después se lee el storage y se responde con `no-store`, `nosniff` y CSP `default-src 'none'`.

## Procesamiento de estudios (Fase 6)

```
Subida ─▶ validación + hash original ─▶ storage (write-once) ─▶ MedicalRecord + MedicalFile + DocumentExtraction(UPLOADED)
                                                                   │  after(): segundo plano
                                                                   ▼
             verifica sha256 del storage ─▶ DocumentExtractionService.extract()
                                              ├─ PDF con texto → unpdf (PDF_TEXT)
                                              └─ foto / PDF escaneado → render + Tesseract (OCR)
                                                                   ▼
                     analyzeDocumentText(): metadatos propuestos + resultados de laboratorio + concepto normalizado
                                                                   ▼
                     DocumentExtraction(READY_FOR_REVIEW) + MedicalMeasurement(PENDING)   ── o FAILED (el estudio sigue igual)
                                                                   ▼
                     Revisión del paciente: confirma datos del estudio y cada resultado ─▶ CONFIRMED ─▶ Evolución
```

Decisiones:

- **El original es la fuente primaria.** Nunca se reescribe: storage write-once, trigger `medical_files_immutable` y verificación del hash antes de analizar. Lo extraído vive en otras tablas.
- **Proveedor reemplazable.** Todo depende de la interfaz `DocumentExtractionService` (`src/server/documents/extraction/types.ts`). La implementación por defecto es local (sin red: el modelo de OCR en español viene en un paquete npm), así que ningún documento sale del servidor. Se configura con `DOCUMENT_EXTRACTION`, `OCR_PROVIDER` y `OCR_MAX_PAGES`.
- **Nada es definitivo sin revisión.** Las propuestas no modifican el registro hasta que el paciente confirma, y las mediciones nacen `PENDING`. Sólo las `CONFIRMED` aparecen en Evolución y las ven los médicos.
- **Análisis puro y determinístico.** `src/server/documents/analysis/` no usa base ni red: se testea con texto y se reutiliza en el seed.
- **Normalización con conservación.** Se guarda siempre el nombre original y, aparte, el concepto (`MeasurementConcept`, con sinónimos en la base y columnas LOINC/SNOMED listas para completar).
- **Sin interpretación clínica.** Sólo se indica "Fuera del rango informado por el laboratorio" comparando con la referencia impresa.
- **Mismos permisos.** Las mediciones heredan la categoría de su registro; las consultas del médico filtran por categorías con `VIEW` en la base de datos.
- **Segundo plano sin colas.** El análisis corre con `after()` en el mismo proceso; un análisis interrumpido se puede reintentar (y uno "colgado" se retoma pasados 10 minutos).

## Autenticación y sesiones

- Contraseñas con **Argon2id** (parámetros OWASP) y re-hash automático.
- Sesión = token aleatorio de 256 bits en cookie `__Host-` (`HttpOnly`, `Secure`, `SameSite=Lax`); en la base sólo se guarda su SHA-256.
- Vencimiento **absoluto y por inactividad según el rol** (paciente 7 d / 24 h; médico y administrador 12 h / 2 h).
- Verificación de email obligatoria, bloqueo progresivo ante fuerza bruta y respuestas que no revelan qué cuentas existen.
- **MFA TOTP** con desafío firmado entre contraseña y código; obligatoria para los roles de `MFA_REQUIRED_ROLES`.

## Autorización

| Capa | Mecanismo |
| --- | --- |
| Rol | `requireRole` / `authorizeRole` (`src/server/auth/dal.ts`), que también exige MFA si el rol la requiere |
| Propiedad (paciente) | `requirePatient` / `authorizePatient`: el `patientId` sale de la sesión; todas las consultas filtran por él |
| Acceso médico | `getDoctorAccess` (`src/server/access/policy.ts`): grant activo, no revocado, no vencido, médico verificado. Permisos = recurso + clave + acción |
| Archivos | `findAccessibleFile` + enlace firmado (`src/server/files`) |
| Administración | Rol `ADMIN` con consultas de `select` explícito, sin datos clínicos |

## Auditoría

`audit()` (`src/server/audit/log.ts`) es la única forma de escribir eventos. Aplica una lista blanca de metadatos y anonimiza la IP. La base encadena cada evento con un hash y rechaza `UPDATE`, `DELETE` y `TRUNCATE`. "Actividad de mi cuenta" (`activity.ts`) traduce los eventos a frases para cada usuario, dentro de su alcance.

## Frontend

- **Server Components por defecto**; componentes cliente sólo donde hay interacción (formularios con `useActionState`, diálogos, navegación móvil, carga de archivos).
- **Formularios** sin JavaScript extra: server actions, errores por campo con `aria-invalid` y `aria-describedby`, y estados de envío con `useFormStatus`.
- **Diseño**: Tailwind 4 con tokens propios (`globals.css`), tipografía Geist, paleta neutra con un acento verde azulado y contraste AA verificado.
- **Responsive**: barra lateral en escritorio y barra inferior con "Más" en el celular. Los listados apilan la información en pantallas chicas.
- **Accesibilidad**: enlace "Saltar al contenido", foco visible, diálogos nativos (`<dialog>`) para confirmaciones, `aria-current` en la navegación, `prefers-reduced-motion`.

## Decisiones principales

| Decisión | Motivo |
| --- | --- |
| Monolito Next.js | Un equipo chico, un despliegue; Server Actions evitan una API REST paralela |
| Prisma 7 + PostgreSQL | Esquema declarativo y migraciones revisables; triggers SQL donde la inmutabilidad debe garantizarla la base |
| Auth propia (sin librería) | Requisitos específicos (sesiones revocables en base, roles múltiples, MFA, auditoría) con poco código y sin cajas negras |
| Código de vinculación del paciente | Más seguro que un buscador de pacientes o que invitar por email: no permite enumerar cuentas y requiere la intención del paciente |
| Política de acceso única sin caché | Revocación y vencimiento inmediatos, fáciles de testear |
| Archivos servidos por la app (no URLs prefirmadas) | Cada lectura pasa por la autorización y la auditoría |
| Auditoría sin claves foráneas | Sobrevive a bajas de usuarios y ninguna cascada la modifica |

## Testing

- **Vitest**: tests unitarios (criptografía, validaciones, sanitización) y de integración contra una base PostgreSQL de tests (`TEST_DATABASE_URL`), que ejercitan los mismos servicios que usan páginas y endpoints.
- **Playwright** (scripts de verificación manual durante el desarrollo): recorridos completos en escritorio, tablet y celular, incluido el guion de [docs/DEMO.md](docs/DEMO.md).
