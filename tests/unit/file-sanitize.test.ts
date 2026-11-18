import { describe, expect, it } from "vitest";
import { crc32 } from "node:zlib";
import { stripJpegMetadata, stripPngMetadata } from "@/server/files/sanitize";

/** JPEG mínimo con EXIF (orientación 6 + un puntero GPS) y un comentario. */
function jpegWithExif(): Buffer {
  const tiff = Buffer.alloc(8 + 2 + 2 * 12 + 4);
  tiff.write("II", 0, "latin1");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8);
  // Orientation = 6
  tiff.writeUInt16LE(0x0112, 10); tiff.writeUInt16LE(3, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt16LE(6, 18);
  // GPS IFD pointer (0x8825)
  tiff.writeUInt16LE(0x8825, 22); tiff.writeUInt16LE(4, 24); tiff.writeUInt32LE(1, 26); tiff.writeUInt32LE(999, 30);
  const exifBody = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff, Buffer.from("GPSLatitude-34.6", "latin1")]);
  const seg = (marker: number, body: Buffer) => {
    const h = Buffer.from([0xff, marker, 0, 0]);
    h.writeUInt16BE(body.length + 2, 2);
    return Buffer.concat([h, body]);
  };
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")),
    seg(0xe1, exifBody),
    seg(0xfe, Buffer.from("Casa de Martin, Palermo", "latin1")),
    seg(0xdb, Buffer.alloc(67, 1)),
    Buffer.from([0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0]),
    Buffer.from([0x12, 0x34, 0x56, 0xff, 0xd9]),
  ]);
}

describe("limpieza de metadatos de imágenes (privacidad)", () => {
  it("JPEG: elimina EXIF/GPS y comentarios, conserva la orientación y los datos de imagen", () => {
    const input = jpegWithExif();
    const out = stripJpegMetadata(input);
    const text = out.toString("latin1");
    expect(text).not.toContain("GPSLatitude");
    expect(text).not.toContain("Casa de Martin");
    expect(text).toContain("JFIF");
    // EXIF nuevo con sólo la orientación (valor 6)
    const idx = out.indexOf(Buffer.from("Exif\0\0", "latin1"));
    expect(idx).toBeGreaterThan(0);
    const tiff = out.subarray(idx + 6);
    expect(tiff.toString("latin1", 0, 2)).toBe("MM");
    expect(tiff.readUInt16BE(8)).toBe(1); // una sola entrada
    expect(tiff.readUInt16BE(10)).toBe(0x0112);
    expect(tiff.readUInt16BE(18)).toBe(6);
    expect(out.subarray(-5).equals(Buffer.from([0x12, 0x34, 0x56, 0xff, 0xd9]))).toBe(true);
  });

  it("JPEG malformado: se deja intacto", () => {
    const bad = Buffer.from([0xff, 0xd8, 0x00, 0x11]);
    expect(stripJpegMetadata(bad).equals(bad)).toBe(true);
  });

  it("PNG: elimina chunks de texto/EXIF/fecha y conserva la imagen", () => {
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(td) >>> 0);
      return Buffer.concat([len, td, crc]);
    };
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = chunk("IHDR", Buffer.alloc(13, 1));
    const idat = chunk("IDAT", Buffer.from("pixels"));
    const input = Buffer.concat([sig, ihdr, chunk("tEXt", Buffer.from("Location\0Palermo")), chunk("eXIf", Buffer.from("gps")), idat, chunk("IEND", Buffer.alloc(0))]);
    const out = stripPngMetadata(input);
    expect(out.toString("latin1")).not.toContain("Palermo");
    expect(out.toString("latin1")).not.toContain("eXIf");
    expect(out.equals(Buffer.concat([sig, ihdr, idat, chunk("IEND", Buffer.alloc(0))]))).toBe(true);
  });

  it("PNG truncado: se deja intacto (nunca se recorta)", () => {
    const truncated = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48]);
    expect(stripPngMetadata(truncated).equals(truncated)).toBe(true);
  });
});
