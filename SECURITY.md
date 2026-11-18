# Seguridad y privacidad — Vitalia

Vitalia guarda **información médica sensible**. Este documento describe el modelo de amenazas, los controles implementados (con referencias al código), el riesgo residual y la configuración mínima para producción.

> Estado: MVP de demostración (fases 1 a 5). No apto para datos reales hasta completar el checklist de producción (§7). Arquitectura en [ARCHITECTURE.md](ARCHITECTURE.md); modelo de datos y triggers en [DATABASE.md](DATABASE.md).

---

## 1. Activos a proteger

| Activo | Dónde vive | Sensibilidad |
| --- | --- | --- |
| Información clínica (Mi salud, registros, informes) | PostgreSQL | Muy alta |
| Archivos médicos (PDF/JPG/PNG) | Storage privado (disco local / S3) | Muy alta |
| Identidad del paciente (nombre, DNI, teléfono, contactos) | PostgreSQL | Alta |
| Credenciales (hash de contraseña, secreto TOTP, sesiones, tokens) | PostgreSQL (hash/cifrado) | Crítica |
| Autorizaciones médico ↔ paciente | PostgreSQL | Alta (definen quién ve qué) |
| Registro de auditoría | PostgreSQL (append-only) | Alta (evidencia) |
| `APP_SECRET` | Variable de entorno | Crítica |

## 2. Actores y límites de confianza

- **Paciente**: dueño de sus datos. Sólo accede a lo propio.
- **Médico**: sólo accede a un paciente con un **acceso vigente** otorgado por ese paciente, y sólo a los recursos y acciones permitidos.
- **Administrador**: gestiona cuentas y verifica matrículas. **No** tiene acceso a información médica.
- **Anónimo / atacante externo**: sólo ve páginas públicas.
- **Operador con acceso a la base o al servidor**: fuera del modelo de la aplicación; se mitiga con cifrado, hashing, auditoría encadenada y controles de infraestructura (§7).

El navegador **nunca** es de confianza: toda autorización se resuelve en el servidor.

## 3. Resumen de controles

| Área | Control | Código |
| --- | --- | --- |
| Contraseñas | Argon2id (19 MiB, t=2, p=1); re-hash automático si se endurecen los parámetros; bloqueo de contraseñas comunes y de las que contienen el email | `src/server/auth/password.ts`, `src/features/auth/schemas.ts` |
| Fuerza bruta | Bloqueo por cuenta en la base (5 fallos → 15 min, progresivo hasta 24 h) + límite por IP + mismo umbral para emails inexistentes | `src/server/auth/service.ts` (`authenticate`) |
| Enumeración | Mensaje y tiempo de respuesta equivalentes en login; registro y recuperación responden igual exista o no la cuenta (el email de recuperación se envía después de responder) | `service.ts`, `features/auth/actions.ts` |
| Verificación de email | Obligatoria antes del primer login; token de un solo uso (24 h), guardado como hash, que se consume con POST (los escáneres de enlaces del correo no lo consumen) | `service.ts`, `app/(auth)/verify-email` |
| MFA | TOTP (RFC 6238) con anti-replay, 10 códigos de recuperación de un solo uso (hash), secreto cifrado con AES-256-GCM, desafío firmado de 5 min entre contraseña y código. Obligatoria para administradores en producción (`MFA_REQUIRED_ROLES`) | `src/server/auth/mfa.ts`, `totp.ts` |
| Sesiones | Token de 256 bits; en la base sólo su SHA-256; cookie `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`; vencimiento absoluto **y** por inactividad según rol (paciente 7 d / 24 h; médico y administrador 12 h / 2 h); se pueden listar y cerrar; cambiar o restablecer la contraseña cierra las demás sesiones | `src/server/auth/session.ts`, `cookies.ts` |
| Autorización | DAL único (`requireRole` / `authorizeRole`) en layouts, páginas, server actions y route handlers; el `patientId` siempre sale de la sesión | `src/server/auth/dal.ts`, `src/server/patient/context.ts` |
| Acceso médico | Política única evaluada en cada request contra la base (grant activo, no revocado, no vencido, médico verificado); las consultas piden sólo lo autorizado | `src/server/access/policy.ts`, `doctor-view.ts` |
| Archivos | Sin URLs públicas; enlaces **temporales firmados** (HMAC, 10 min, atados a usuario + archivo + modo) además de la sesión; tipo validado por firma de bytes; 15 MB máx.; nombre aleatorio en el storage; se quitan metadatos EXIF/GPS de las imágenes; respuesta con `nosniff`, CSP `default-src 'none'`, `no-store` | `src/server/files/*`, `app/api/files/[fileId]/route.ts` |
| XSS | React escapa por defecto; CSP con **nonce por request** y `strict-dynamic`; sin `dangerouslySetInnerHTML` | `src/proxy.ts` |
| CSRF | Server actions con verificación de `Origin` (Next.js); cookies `SameSite`; exportación sólo por POST desde el mismo origen | `app/api/export/route.ts` |
| Cabeceras | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, HSTS en producción, sin `X-Powered-By` | `next.config.ts`, `src/proxy.ts` |
| Auditoría | Registro append-only con cadena de hashes, triggers que impiden `UPDATE`/`DELETE`/`TRUNCATE`, lista blanca de metadatos, IP anonimizada | `src/server/audit/*`, migración `security_audit` |
| Informes clínicos | Versiones append-only (trigger), con autor, fecha y motivo de cada corrección; el paciente no puede borrar informes de médicos | `src/server/medical/reports.ts` |
| Errores | Páginas de error sin detalles internos (sólo un código para soporte); respuestas de API genéricas; los formularios convierten fallas inesperadas en un mensaje amable sin datos internos | `app/error.tsx`, `src/server/action-errors.ts` |
| Operaciones destructivas | Eliminar, revocar o rechazar piden confirmación explícita en un diálogo accesible | `src/components/ui/confirm-dialog.tsx` |
| Secretos | Sólo en `.env` (ignorado por git); `APP_SECRET` obligatorio en producción y se rechaza el valor de ejemplo; subclaves por propósito (HKDF) | `src/server/env.ts`, `src/server/crypto/keys.ts` |

## 4. Modelo de amenazas

Para cada riesgo: **escenario → mitigaciones existentes → riesgo residual / pendiente**.

### 4.1 Robo de cuenta (credenciales)
- **Escenario**: phishing, reutilización de contraseñas filtradas, credential stuffing.
- **Mitigaciones**: Argon2id; contraseñas comunes bloqueadas; bloqueo progresivo por cuenta; límite por IP; MFA TOTP opcional (obligatoria para administradores en producción) con anti-replay y códigos de recuperación; email al bloquearse la cuenta, al cambiar la contraseña y al activar o desactivar MFA; "Actividad de mi cuenta" muestra inicios de sesión con dispositivo e IP aproximada; cierre remoto de sesiones.
- **Residual / pendiente**: verificar contraseñas contra Have I Been Pwned; ofrecer passkeys (WebAuthn); alertas por inicio de sesión desde un dispositivo nuevo.

### 4.2 Médico malicioso
- **Escenario**: un profesional autorizado intenta ver más de lo permitido, conservar el acceso o alterar información.
- **Mitigaciones**: sólo accede con código de un solo uso **del paciente** y aceptación explícita; permisos por recurso y acción; vencimiento real; revocación inmediata; cada vista, apertura y descarga queda en la auditoría **y el paciente la ve**; los intentos sin permiso se registran (`ACCESS_DENIED`) y también se muestran al paciente; los informes no se pueden reemplazar en silencio (versiones inmutables con autor y motivo); no ve datos de contacto; su propio registro de actividad no repite títulos clínicos; perder la verificación de matrícula corta todos sus accesos.
- **Residual**: lo que ya vio puede copiarlo (capturas de pantalla, descargas). Es inherente; la auditoría deja evidencia. Pendiente: marcas de agua en descargas y alertas por descargas masivas.

### 4.3 Usuario modificando IDs (IDOR)
- **Escenario**: cambiar `recordId`, `fileId`, `patientId`, `grantId` o `publicId` en URLs, formularios o requests.
- **Mitigaciones**: el `patientId` del paciente sale siempre de la sesión; todas las consultas filtran por dueño (`where: { id, patientId }`); las del médico, por grant y categoría permitida; un id ajeno responde **404, igual que uno inexistente**; ids `cuid` no secuenciales; cerrar sesiones filtra por `userId`.
- **Tests**: `patient-isolation.test.ts`, `doctor-access.test.ts` (caso 6), `audit-security.test.ts`.

### 4.4 Acceso a archivos ajenos
- **Escenario**: obtener o adivinar la URL de un archivo y descargarlo sin permiso.
- **Mitigaciones**: los bytes viven fuera de la carpeta pública con una clave aleatoria; `/api/files/[id]` exige **sesión + permiso + enlace firmado vigente atado al usuario**; un enlace copiado no sirve a otra persona ni después de 10 minutos; `Cache-Control: no-store`; cada apertura y descarga se audita; el administrador no tiene acceso.
- **Residual**: con S3, configurar el bucket como privado (Block Public Access) y sin URLs prefirmadas de larga duración.

### 4.5 Escalamiento de privilegios
- **Escenario**: un paciente intenta usar funciones de médico o de administración; un médico pendiente intenta operar.
- **Mitigaciones**: roles en tabla propia, sin ningún endpoint para modificarlos; el registro asigna un rol fijo; cada página y acción verifica rol **en el servidor**; las capacidades clínicas exigen además matrícula `VERIFIED`; el área de administración exige MFA en producción; la autoverificación de matrícula está bloqueada.
- **Residual**: los cambios de rol se hacen por base de datos (proceso operativo); pendiente: herramienta de administración con doble aprobación y auditoría.

### 4.6 Robo de sesión
- **Escenario**: XSS que lee la cookie, red insegura, equipo compartido, token filtrado en logs.
- **Mitigaciones**: cookie `HttpOnly` + `Secure` + `__Host-` + `SameSite=Lax`; CSP con nonce (dificulta el XSS); HSTS; el token sólo se guarda como hash; vencimiento por inactividad y absoluto, más corto para roles privilegiados; listado y cierre de sesiones; "cerrar todas las demás"; el cambio de contraseña invalida las otras sesiones.
- **Residual**: no se ata la sesión a la IP (los móviles cambian de IP con frecuencia). Pendiente: step-up de MFA para acciones críticas.

### 4.7 Ataques de fuerza bruta
- **Escenario**: adivinar contraseñas, códigos MFA, códigos de vinculación o tokens.
- **Mitigaciones**: bloqueo por cuenta persistido en la base (funciona con varias instancias); límites por IP en login, registro y recuperación; 5 intentos de MFA por usuario cada 15 min; los códigos de vinculación tienen ~40 bits, vencen en 60 min, son de un solo uso, admiten 10 intentos por médico y sólo los pueden usar médicos verificados; los tokens tienen 256 bits.
- **Residual**: los límites por IP viven en memoria y se pueden saltear falseando `X-Forwarded-For` si no hay un proxy que lo sobrescriba (§7). El bloqueo por cuenta no depende de la IP.

### 4.8 Subida de archivos maliciosos
- **Escenario**: HTML o JS disfrazado de PDF, archivos políglotas, archivos gigantes, nombres con path traversal, malware.
- **Mitigaciones**: tipo detectado por **firma de bytes**, con extensión consistente (sólo PDF/JPG/PNG); 15 MB máximo validado en cliente, en server action y en límites del framework; nombre original saneado y nunca usado como ruta; clave de storage aleatoria con protección contra path traversal; el servidor nunca ejecuta ni interpreta los archivos; se sirven con `nosniff`, `Content-Disposition` y CSP `default-src 'none'`; se eliminan metadatos EXIF/GPS. El hook antivirus está preparado en `src/server/files/scan.ts`.
- **Análisis automático (Fase 6)**: los archivos se leen con librerías locales (pdf.js vía `unpdf` y Tesseract en WebAssembly) que **no ejecutan** el contenido: sólo extraen texto o renderizan páginas. El análisis corre después de validar el archivo, con un máximo de páginas para OCR (`OCR_MAX_PAGES`), sin red (ningún documento se envía a terceros) y sus errores sólo marcan el estudio como `FAILED`: el original sigue disponible.
- **Residual / pendiente**: conectar un antivirus real (por ejemplo ClamAV); los PDF pueden contener JavaScript que interpreta el visor del navegador (aislado por el navegador; se puede forzar la descarga). Un PDF diseñado para consumir mucha CPU al renderizarse podría demorar el análisis en segundo plano: en producción conviene moverlo a un proceso o cola aparte con límite de tiempo.

### 4.11 Datos extraídos incorrectos o manipulados (Fase 6)
- **Escenario**: el OCR lee mal un valor; alguien altera el archivo del storage; un resultado no confirmado se toma como definitivo; un médico ve valores que el paciente no revisó.
- **Mitigaciones**: **el original nunca se modifica** (storage write-once, trigger `medical_files_immutable`) y siempre está visible junto a lo extraído; antes de analizar se verifica el SHA-256 del archivo almacenado (`INTEGRITY_MISMATCH`); todo lo extraído nace `PENDING` y sólo lo `CONFIRMED` llega a Evolución y a los médicos; cada valor muestra su procedencia (documento, institución, fecha, método, confianza, quién lo confirmó y qué se corrigió); el nombre original y los valores detectados se conservan; no hay interpretación clínica (sólo "Fuera del rango informado por el laboratorio").
- **Permisos**: las mediciones heredan la categoría de su registro y las consultas del médico filtran en la base por las categorías con `VIEW` del acceso vigente; un trigger impide asociar una medición o extracción a un registro de otro paciente.

### 4.9 Fuga de información
- **Escenario**: datos en logs, mensajes de error, respuestas de API, exportaciones o cachés.
- **Mitigaciones**: la auditoría guarda sólo ids y metadatos de una lista blanca (nunca títulos, contenidos, nombres de archivo, emails, contraseñas, tokens ni códigos); IP anonimizada; los logs del servidor no imprimen contenido; las páginas de error no muestran detalles; HTML dinámico con `no-store`; la exportación excluye hashes, secretos y datos de terceros; el médico nunca recibe secciones no autorizadas (no se consultan); el administrador ve sólo datos de cuenta.
- **Residual**: con `MAIL_TRANSPORT=console`, los enlaces de los emails quedan en los logs. Sólo debe usarse en desarrollo (la app lo advierte en producción).

### 4.10 Administrador interno abusivo
- **Escenario**: un administrador intenta leer historias clínicas o manipular la evidencia.
- **Mitigaciones**: el rol `ADMIN` no tiene acceso a información médica (consultas con `select` explícito, sin rutas de datos clínicos, sin acceso a archivos, verificado en tests); sus acciones se auditan (`DOCTOR_VERIFICATION_DECIDED`); MFA obligatoria en producción; no puede verificar su propia matrícula; la auditoría es inmutable desde la aplicación y la manipulación directa en la base se detecta con la cadena de hashes (`npm run audit:verify`).
- **Residual**: un administrador **de infraestructura** (DBA, root del servidor) queda fuera del modelo de la aplicación. Mitigar con separación de funciones, rol de base sin permisos de `UPDATE`/`DELETE` sobre `audit_events`, exportación periódica de los hashes a un almacenamiento WORM y monitoreo (§7).

## 5. Auditoría

- **Qué se registra**: inicio de sesión (exitoso, fallido, bloqueado), cierre de sesión, sesiones cerradas, MFA (activación, desactivación, fallos, códigos de recuperación), contraseñas (cambio, pedido y uso de recuperación), verificación de email, registro, cambios de perfil (**nombres de campos, nunca valores**), alta y baja de registros, visualización y descarga de archivos, vistas del médico, códigos de vinculación, solicitudes, aceptaciones (recursos y vencimiento), rechazos, revocaciones, vencimientos, accesos denegados, informes (creación y corrección con versión anterior y nueva), decisiones de administración y exportación de datos. Fase 6: análisis automático de un estudio (método y **cantidad** de resultados, o el código de error), confirmación de datos del estudio, revisión de resultados (conteos de confirmados, descartados y corregidos) y consultas de Evolución por parte de médicos. **Nunca** se registran valores, nombres de parámetros ni texto extraído.
- **Campos**: actor y tipo de actor, acción, resultado, recurso, paciente afectado, grant, fecha, IP anonimizada, User-Agent truncado, metadatos (lista blanca).
- **Inmutabilidad**: sin claves foráneas (las cascadas no lo tocan); triggers que rechazan `UPDATE`, `DELETE` y `TRUNCATE`; cadena de hashes SHA-256 calculada por la base bajo un lock (`prevHash` → `hash`). `npm run audit:verify` recorre la cadena y señala filas modificadas, borradas o insertadas fuera de orden.
- **Visibilidad**: cada usuario ve sólo su actividad, y el paciente, además, todo lo que ocurrió sobre sus datos, en *Configuración → Actividad*.

## 6. Privacidad

- **Privacy by design**: aislamiento por paciente en todas las consultas; permisos granulares; auditoría visible para el paciente; metadatos GPS eliminados de las fotos; informes versionados.
- **Privacy by default**: nada es visible para terceros sin una acción explícita; las autorizaciones arrancan en 24 h; las categorías sensibles (Salud mental, Ginecología, Urología) nunca vienen preseleccionadas; no hay buscador de pacientes; la ficha de emergencia no tiene acceso público.
- **Minimización**: el médico no ve datos de contacto; el log no guarda contenido; la IP se guarda anonimizada; la exportación excluye secretos.
- **Mínimo privilegio**: el administrador no accede a datos clínicos; los médicos sólo acceden a lo autorizado y por tiempo limitado; sesiones más cortas para roles privilegiados.
- **Derechos del titular**: ver y editar sus datos (*Configuración*), revisar y revocar accesos (*Mis médicos*), ver la actividad (*Actividad*) y **exportar sus datos** en JSON (*Privacidad*). Pendiente: baja de cuenta autoservicio y exportación de los archivos en ZIP.

## 7. Checklist de producción

- [ ] `APP_SECRET` propio de ≥ 32 bytes aleatorios (`openssl rand -base64 48`), guardado en un gestor de secretos. Rotarlo invalida los enlaces temporales y **los secretos MFA** (planificar re-enrolamiento).
- [ ] HTTPS en todo el sitio (HSTS ya activo en producción).
- [ ] Reverse proxy confiable que **sobrescriba** `X-Forwarded-For` (si no, los límites por IP se pueden saltear).
- [ ] `STORAGE_DRIVER=s3` con bucket privado (Block Public Access), cifrado en reposo, versionado y política de mínimo privilegio para la credencial de la app.
- [ ] Proveedor de email real; **nunca** `MAIL_TRANSPORT=console`.
- [ ] `MFA_REQUIRED_ROLES=ADMIN` (por defecto) y evaluar `ADMIN,DOCTOR`.
- [ ] Rol de base de datos de la app **distinto del dueño de las tablas**, sin `UPDATE`/`DELETE`/`TRUNCATE` sobre `audit_events` ni `medical_report_versions`.
- [ ] Backups cifrados y probados; retención definida para la auditoría.
- [ ] `npm run jobs:expire-access` programado (cada 5–15 min) y `npm run audit:verify` diario, con alerta si falla.
- [ ] Rate limiting distribuido (Redis) si hay más de una instancia.
- [ ] Antivirus conectado en `src/server/files/scan.ts`.
- [ ] Monitoreo y alertas: picos de `LOGIN_FAILED`, `ACCESS_DENIED`, descargas masivas.
- [ ] Revisión legal (Ley 25.326 de Protección de Datos Personales, Ley 26.529 de Derechos del Paciente) antes de cargar datos reales.

## 8. Pruebas de seguridad

`npm test` ejecuta, entre otros:

- `tests/integration/patient-isolation.test.ts`: aislamiento entre pacientes, enlaces firmados, archivos.
- `tests/integration/doctor-access.test.ts`: los 6 casos obligatorios de acceso médico (sin autorización, otro paciente, categoría no permitida, vencido, revocado, ids manipulados), además de informes y verificación.
- `tests/integration/auth-service.test.ts`: fuerza bruta, enumeración, verificación de email, re-hash, sesiones por rol e inactividad, cambio y recuperación de contraseña.
- `tests/integration/audit-security.test.ts`: cadena de hashes, inmutabilidad (incluida una manipulación simulada), minimización, eventos del ciclo de acceso, actividad e aislamiento, MFA, exportación.
- `tests/integration/document-processing.test.ts`: aislamiento de extracciones y mediciones, documento original inmutable (trigger y verificación de hash), permisos médicos sobre mediciones (con y sin Laboratorio, sólo confirmadas), revocación y vencimiento, duplicados, confirmados / no confirmados, normalización.
- `tests/unit/document-analysis.test.ts` y `document-extraction.test.ts`: parser de resultados, metadatos, normalización, elección de método (texto / OCR) y OCR real sobre una imagen y un PDF escaneado.
- `tests/unit/security-crypto.test.ts` y `file-sanitize.test.ts`: TOTP con los vectores de la RFC 6238, cifrado, firmas, IP anonimizada, EXIF/GPS.

## 9. Reporte de vulnerabilidades

Si encontrás una vulnerabilidad, **no abras un issue público**. Escribí al responsable del proyecto con los pasos para reproducirla. Nos comprometemos a responder en 72 h y a no tomar acciones legales contra investigaciones de buena fe.
