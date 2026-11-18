/**
 * Documentos de DEMOSTRACIÓN generados por código (sin datos reales). Los usan el seed,
 * los tests y `npm run demo:samples` (archivos de ejemplo para probar la carga inteligente).
 */

export type LabRow = [name: string, value: string, reference: string];

export /** PDF de una página con encabezado, datos del paciente y una tabla de resultados. */
function makePdf(title: string, subtitle: string, rows: LabRow[], footer: string, header = "Laboratorio / Centro de diagnostico - DEMO", patient = "Paciente: Martin Demo  -  DNI 00.000.000 (dato ficticio)"): Buffer {
  const esc = (s: string) => s.replace(/[()\\]/g, "");
  const ops: string[] = [];
  const text = (x: number, y: number, size: number, font: "F1" | "F2", s: string) => ops.push(`BT /${font} ${size} Tf ${x} ${y} Td (${esc(s)}) Tj ET`);
  ops.push("0.05 0.5 0.44 rg 0 792 595 50 re f"); // franja superior
  text(50, 810, 16, "F2", header);
  text(50, 760, 18, "F2", title);
  text(50, 740, 10, "F1", subtitle);
  text(50, 724, 10, "F1", patient);
  ops.push("0.85 0.87 0.9 RG 50 712 m 545 712 l S");
  text(50, 692, 10, "F2", "Determinacion");
  text(300, 692, 10, "F2", "Resultado");
  text(420, 692, 10, "F2", "Valor de referencia");
  rows.forEach(([name, value, ref], i) => {
    const y = 670 - i * 20;
    text(50, y, 10, "F1", name);
    text(300, y, 10, "F2", value);
    text(420, y, 10, "F1", ref);
  });
  text(50, 670 - rows.length * 20 - 24, 9, "F1", footer);
  text(50, 60, 8, "F1", "Documento de demostracion generado automaticamente. No contiene informacion medica real.");
  const content = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}


/** PDF "escaneado": una página que sólo contiene una imagen (sin texto extraíble). */
export function makeScannedPdf(jpeg: Buffer, width: number, height: number): Buffer {
  const pageW = 595;
  const pageH = Math.round((height / width) * pageW);
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im1 Do Q`;
  const parts: (string | Buffer)[] = [];
  const objects: (string | Buffer[])[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`,
    [Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, "latin1"), jpeg, Buffer.from("\nendstream", "latin1")],
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let length = 0;
  const push = (b: string | Buffer) => {
    parts.push(b);
    length += typeof b === "string" ? Buffer.byteLength(b, "latin1") : b.length;
  };
  push("%PDF-1.4\n");
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(length);
    push(`${i + 1} 0 obj\n`);
    if (typeof o === "string") push(o);
    else o.forEach(push);
    push("\nendobj\n");
  });
  const xref = length;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(parts.map((b) => (typeof b === "string" ? Buffer.from(b, "latin1") : b)));
}

/**
 * "Foto" de un informe de laboratorio (imagen con texto) para probar el OCR.
 * Usa @napi-rs/canvas; requiere alguna fuente instalada en el sistema.
 */
export async function makeLabPhoto(lines: string[], format: "png" | "jpeg" = "png"): Promise<{ body: Buffer; width: number; height: number }> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const width = 1240;
  const height = 120 + lines.length * 56;
  const canvas = createCanvas(width, height);
  const g = canvas.getContext("2d");
  g.fillStyle = "#fbfaf7";
  g.fillRect(0, 0, width, height);
  g.fillStyle = "#1a1a1a";
  lines.forEach((line, i) => {
    g.font = i === 0 ? "bold 34px sans-serif" : "28px sans-serif";
    g.fillText(line, 60, 80 + i * 56);
  });
  const body = format === "png" ? canvas.toBuffer("image/png") : canvas.toBuffer("image/jpeg", 92);
  return { body, width, height };
}
