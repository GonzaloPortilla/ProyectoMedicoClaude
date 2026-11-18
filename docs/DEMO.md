# Guion de demostración (≈ 10 minutos)

Antes de empezar, dejá la demo en su estado inicial y levantá la app:

```bash
npm run demo:reset
```

```bash
npm run dev
```

Usá **dos ventanas**: una normal (paciente) y otra de incógnito (médico). La contraseña de todas las cuentas es `Demo1234!`.

---

## 1. El paciente y su información — Martín Demo

1. Ingresá con `martin@demo.local`.
2. **Inicio**: mostrá "Tu salud de un vistazo" (grupo sanguíneo 0+, alergia grave a la penicilina, enalapril y atorvastatina, hipertensión y dislipemia), los últimos estudios y que **ningún médico tiene acceso**.
3. **Mi salud**: antecedentes personales y familiares, cirugías, internaciones, vacunas y contactos de emergencia. Todo se agrega en tarjetas simples.
4. **Estudios** → **Subir estudio**: elegí un PDF, la fecha de hoy, tipo *Laboratorio* y una descripción. En *Más detalles* poné el título "Perfil lipídico de control" y guardá.
5. **Historial**: la línea de tiempo por año, con los filtros.

## 2. El médico pide acceso — Dr. Juan Pérez

6. Martín → **Mis médicos** → **Generar código**. Remarcá que es de un solo uso y que vence en 60 minutos.
7. En la ventana de incógnito, ingresá con `juan.perez@demo.local` (Cardiología, verificado).
8. En **Solicitar acceso**, ingresá el código, el motivo "Control cardiológico" y, en *¿Qué necesitás ver?*, marcá Laboratorio, Cardiología y Medicación. Enviá.

## 3. El paciente decide

9. Martín → **Inicio**: aparece "Dr/a. Juan Pérez quiere ver tu información" → **Revisar solicitud**.
10. Dejá marcados sólo **Laboratorio, Cardiología y Medicación**. Remarcá que las categorías sensibles nunca vienen marcadas.
11. Duración: **7 días**. Marcá **Crear informes en mi historial** → **Autorizar acceso**.

## 4. El médico accede sólo a lo autorizado

12. Dr. Pérez → **Pacientes** → **Martín Demo**: ve la medicación y los estudios de Laboratorio y Cardiología. La pantalla indica "No compartido: Datos generales, Alergias…" y la radiografía, la receta o la consulta clínica **no se reciben** del servidor.
13. Abrí **Análisis de sangre completo** → **Ver**: el PDF se abre con un enlace temporal y privado.
14. Volvé al paciente → **Crear informe** en Cardiología → guardá. Queda firmado con nombre y matrícula; si se corrige, se conserva la versión anterior.

## 5. Transparencia y control

15. Martín → **Actividad** (o *Configuración → Actividad*), filtro **Accesos de médicos**: "Dr/a. Juan Pérez visualizó «Análisis de sangre completo — 12 de oct de 2026»", "abrió el archivo…", "creó el informe…".
16. **Mis médicos** → **Revocar acceso** → confirmá en el diálogo.

## 6. Bloqueo inmediato

17. Dr. Pérez: recargá la página de Martín → **"No tenés un acceso vigente"**. Su enlace al archivo también deja de funcionar.
18. Martín → Actividad: "Revocaste el acceso…" y "Dr/a. Juan Pérez intentó acceder a tu información sin una autorización vigente. No se le mostró ningún dato."

---

## Extras (si hay tiempo)

- **Administración**: `admin@demo.local` → *Médicos* → aprobá o rechazá a la Dra. Laura Gómez (el rechazo exige un motivo). El administrador **no** puede ver información médica.
- **Seguridad**: *Configuración → Seguridad* → activá la verificación en dos pasos con una app de autenticación; cerrá sesiones en otros dispositivos.
- **Privacidad**: *Configuración → Privacidad* → **Descargar mis datos** (JSON).
- **Celular**: abrí la app en el teléfono (misma red, `http://IP-de-tu-PC:3000`) o en el modo responsive del navegador: barra inferior, filtros plegables, carga de estudios con la cámara.
- **Vencimiento**: al autorizar podés elegir *1 hora*; al vencer, el acceso se bloquea solo y queda en la actividad como "Venció el acceso de…".
