import "server-only";

/**
 * Punto de extensión para escaneo antivirus de archivos subidos.
 *
 * Hoy los archivos ya están contenidos: sólo PDF/JPG/PNG validados por su firma, guardados
 * con nombre aleatorio fuera de la carpeta pública, nunca ejecutados por el servidor y
 * servidos con `nosniff` y CSP restrictiva. Para producción se recomienda conectar acá un
 * motor real (por ejemplo ClamAV vía clamd, o el escaneo del proveedor de object storage).
 */
export type ScanResult = { clean: true } | { clean: false; reason: string };

export async function scanFile(bytes: Buffer, mime: string): Promise<ScanResult> {
  void bytes;
  void mime;
  return { clean: true };
}
