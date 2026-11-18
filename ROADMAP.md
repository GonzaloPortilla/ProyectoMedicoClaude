# Roadmap

## MVP actual (fases 1 a 5) ✅

| Fase | Contenido |
| --- | --- |
| 1 | Autenticación, usuarios, roles (paciente / médico / administrador), perfiles, verificación manual de matrículas |
| 2 | Mi salud, estudios con archivos privados, historial cronológico, buscador, información de emergencia |
| 3 | Acceso de médicos con autorización explícita del paciente: código de vinculación, permisos granulares por recurso y acción, vencimiento, revocación, informes versionados |
| 4 | Seguridad, auditoría y privacidad: audit log inmutable y encadenado, "Actividad de mi cuenta", MFA TOTP, verificación de email, protección contra fuerza bruta, enlaces temporales, CSP, exportación de datos, modelo de amenazas |
| 5 | UX final, diseño, responsive, estados vacíos y de error, confirmaciones, accesibilidad, datos y guion de demostración, documentación |

## Funcionalidades FUTURAS

> **Ninguna de estas funcionalidades está implementada.** Son la dirección propuesta después del MVP.

### Inteligencia sobre la información
- **OCR de informes**: digitalizar PDFs escaneados y fotos de estudios.
- **Extracción automática de valores**: leer resultados de laboratorio (glucemia, colesterol, etc.) y guardarlos como datos estructurados.
- **IA para búsqueda del historial**: preguntas en lenguaje natural ("¿cuándo fue mi último control de colesterol?"), con respuestas que citan los documentos.
- **Gráficos longitudinales**: evolución de valores en el tiempo (peso, presión, LDL, HbA1c).

### Interoperabilidad
- **FHIR**: importar y exportar en HL7 FHIR R4 (Patient, Observation, DiagnosticReport, DocumentReference, Consent).
- **Laboratorios**: recepción automática de resultados.
- **Hospitales y clínicas**: integración de epicrisis, informes e imágenes.
- **Prepagas y obras sociales**: credencial, autorizaciones y prestaciones.

### Experiencia
- **App móvil** (iOS / Android), con cámara para digitalizar estudios y notificaciones.
- **QR de emergencia**: acceso público, limitado y auditado a la ficha de emergencia (con revocación y registro de cada lectura).
- **Recetas electrónicas**, conforme a la normativa vigente.

### Seguridad
- **MFA avanzado**: llaves de seguridad FIDO2, MFA obligatoria para médicos, verificación adicional para acciones críticas.
- **Passkeys (WebAuthn)**: ingreso sin contraseña.

## Deuda técnica y mejoras recomendadas antes de producción

- Proveedor de email real y plantillas HTML.
- Rate limiting distribuido (Redis) para varias instancias.
- Antivirus en la subida de archivos (hook listo en `src/server/files/scan.ts`).
- Edición de datos ya cargados en Mi salud (hoy se agregan y eliminan).
- Modificar un acceso médico activo sin revocarlo.
- Baja de cuenta autoservicio y exportación de archivos en ZIP.
- Suite end-to-end (Playwright) en CI, junto a los tests de integración existentes.
- Observabilidad: métricas, alertas sobre `LOGIN_FAILED` / `ACCESS_DENIED` y verificación diaria de la auditoría.
- Revisión legal: Ley 25.326 (Protección de Datos Personales) y Ley 26.529 (Derechos del Paciente).
