/**
 * Contrato de almacenamiento de archivos privados.
 * Las implementaciones NUNCA exponen URLs públicas: los bytes se leen desde el servidor
 * y se entregan sólo después de validar sesión, propiedad y permisos.
 */
export interface StorageDriver {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
