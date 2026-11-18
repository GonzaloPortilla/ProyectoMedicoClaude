# Roadmap

## Implementado (fases 1 a 6) ✅

| Fase | Contenido |
| --- | --- |
| 1 | Autenticación, usuarios, roles (paciente / médico / administrador), perfiles, verificación manual de matrículas |
| 2 | Mi salud, estudios con archivos privados, historial cronológico, buscador, información de emergencia |
| 3 | Acceso de médicos con autorización explícita del paciente: código de vinculación, permisos granulares por recurso y acción, vencimiento, revocación, informes versionados |
| 4 | Seguridad, auditoría y privacidad: audit log inmutable y encadenado, "Actividad de mi cuenta", MFA TOTP, verificación de email, protección contra fuerza bruta, enlaces temporales, CSP, exportación de datos, modelo de amenazas |
| 5 | UX final, diseño, responsive, estados vacíos y de error, confirmaciones, accesibilidad, datos y guion de demostración, documentación |
| 6 | Procesamiento de estudios: extracción de texto (PDF y OCR local), propuesta de metadatos, extracción de resultados de laboratorio, revisión obligatoria, mediciones con procedencia, normalización de conceptos, sección Evolución, detección de duplicados |

## Funcionalidades FUTURAS

> **Ninguna de estas funcionalidades está implementada.** Son la dirección propuesta.
> (El OCR, la extracción de valores de laboratorio y los gráficos de evolución pasaron a la Fase 6.)

### Inteligencia sobre la información
- **IA para búsqueda del historial**: preguntas en lenguaje natural ("¿cuándo fue mi último control de colesterol?"), con respuestas que citan los documentos.
- **Más tipos de datos longitudinales**: peso, presión arterial y otros signos vitales cargados en el tiempo (hoy Evolución muestra resultados de laboratorio).
- **Mapeo a LOINC / SNOMED CT**: completar los códigos del catálogo `measurement_concepts` (la estructura ya está preparada) y conversión entre unidades (mg/dL ↔ mmol/L).
- **Proveedor de OCR en la nube** como alternativa (implementando `DocumentExtractionService`), para documentos de baja calidad o manuscritos.
- **Verificación profesional de resultados**: los campos `verifiedById` / `verifiedAt` existen; falta el flujo para que un médico autorizado los valide.

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
- Cola de trabajos para el análisis de estudios (hoy corre en segundo plano en el mismo proceso con `after()`; un reinicio a mitad de un análisis se recupera con "Reintentar análisis").
- Edición de datos ya cargados en Mi salud (hoy se agregan y eliminan).
- Modificar un acceso médico activo sin revocarlo.
- Baja de cuenta autoservicio y exportación de archivos en ZIP.
- Suite end-to-end (Playwright) en CI, junto a los tests de integración existentes.
- Observabilidad: métricas, alertas sobre `LOGIN_FAILED` / `ACCESS_DENIED` y verificación diaria de la auditoría.
- Revisión legal: Ley 25.326 (Protección de Datos Personales) y Ley 26.529 (Derechos del Paciente).
