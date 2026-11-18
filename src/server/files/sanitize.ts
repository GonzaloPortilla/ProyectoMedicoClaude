import "server-only";

/**
 * Privacidad por diseño: las fotos de un celular suelen traer metadatos EXIF/XMP con la
 * ubicación GPS, el modelo del teléfono y la fecha exacta. Se eliminan al subir el archivo.
 *
 * - JPEG: se quitan los segmentos APP1–APP15 y comentarios. Se conserva sólo la ORIENTACIÓN
 *   (en un EXIF mínimo nuevo) para que la foto no se vea rotada.
 * - PNG: se quitan los chunks de texto, EXIF y fecha (tEXt, zTXt, iTXt, eXIf, tIME).
 * - PDF: se guarda tal cual (sus metadatos no incluyen ubicación; ver SECURITY.md).
 */

function readOrientation(app1: Buffer): number | null {
  // app1 = contenido del segmento (sin marcador ni largo): "Exif\0\0" + TIFF
  if (app1.length < 14 || app1.toString("latin1", 0, 6) !== "Exif\0\0") return null;
  const tiff = app1.subarray(6);
  const le = tiff.toString("latin1", 0, 2) === "II";
  if (!le && tiff.toString("latin1", 0, 2) !== "MM") return null;
  const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  try {
    const ifd0 = u32(4);
    const entries = u16(ifd0);
    for (let i = 0; i < entries; i++) {
      const off = ifd0 + 2 + i * 12;
      if (u16(off) === 0x0112) {
        const value = u16(off + 8);
        return value >= 1 && value <= 8 ? value : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Segmento APP1 con un EXIF mínimo que sólo contiene la orientación. */
function orientationSegment(orientation: number): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write("MM", 0, "latin1");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4); // offset IFD0
  tiff.writeUInt16BE(1, 8); // 1 entrada
  tiff.writeUInt16BE(0x0112, 10); // Orientation
  tiff.writeUInt16BE(3, 12); // SHORT
  tiff.writeUInt32BE(1, 14); // count
  tiff.writeUInt16BE(orientation, 18);
  tiff.writeUInt32BE(0, 22); // sin IFD siguiente
  const body = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([header, body]);
}

export function stripJpegMetadata(input: Buffer): Buffer {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return input;
  const parts: Buffer[] = [input.subarray(0, 2)];
  let orientation: number | null = null;
  let i = 2;
  while (i + 4 <= input.length) {
    if (input[i] !== 0xff) return input; // estructura inesperada: no tocar
    const marker = input[i + 1]!;
    if (marker === 0xda) {
      // Start of Scan: el resto son los datos de la imagen.
      if (orientation && orientation !== 1) parts.splice(1, 0, orientationSegment(orientation));
      parts.push(input.subarray(i));
      return Buffer.concat(parts);
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(input.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = input.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > input.length) return input;
    const segment = input.subarray(i, i + 2 + len);
    const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (marker === 0xe1 && orientation === null) orientation = readOrientation(segment.subarray(4));
    if (!isMetadata) parts.push(segment);
    i += 2 + len;
  }
  return input;
}

const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

export function stripPngMetadata(input: Buffer): Buffer {
  if (input.length < 8 || input.readUInt32BE(0) !== 0x89504e47) return input;
  const parts: Buffer[] = [input.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= input.length) {
    const len = input.readUInt32BE(i);
    const type = input.toString("latin1", i + 4, i + 8);
    const end = i + 12 + len;
    if (end > input.length) return input; // estructura inesperada: no tocar
    if (!PNG_DROP.has(type)) parts.push(input.subarray(i, end));
    i = end;
    if (type === "IEND") return Buffer.concat(parts);
  }
  // Sin IEND (archivo truncado o malformado): se guarda tal cual, nunca recortado.
  return input;
}

export function stripMetadata(mime: string, input: Buffer): Buffer {
  if (mime === "image/jpeg") return stripJpegMetadata(input);
  if (mime === "image/png") return stripPngMetadata(input);
  return input;
}
