/**
 * Genera archivos de ejemplo (ficticios) para probar la carga inteligente de estudios:
 *   docs/samples/laboratorio_noviembre.pdf   PDF con texto
 *   docs/samples/laboratorio_foto.jpg        foto de un informe (usa OCR)
 *   docs/samples/laboratorio_escaneado.pdf   PDF escaneado, sin texto (usa OCR)
 * Uso: npm run demo:samples
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeLabPhoto, makePdf, makeScannedPdf } from "../prisma/demo-documents";

const out = path.resolve("docs/samples");

async function main() {
  await mkdir(out, { recursive: true });
  const pdf = makePdf(
    "Analisis de sangre completo",
    "Fecha de extraccion: 05/11/2026  -  Protocolo N 0420-DEMO",
    [
      ["Glucemia", "97 mg/dL", "70 - 100 mg/dL"],
      ["Colesterol total", "176 mg/dL", "< 200 mg/dL"],
      ["Colesterol HDL", "57 mg/dL", "> 40 mg/dL"],
      ["Colesterol LDL", "101 mg/dL", "< 130 mg/dL"],
      ["Trigliceridos", "92 mg/dL", "< 150 mg/dL"],
      ["Hemoglobina", "14,7 g/dL", "13,5 - 17,5 g/dL"],
      ["Creatinina", "0,95 mg/dL", "0,7 - 1,3 mg/dL"],
      ["Vitamina D", "24 ng/mL", "30 - 100 ng/mL"],
    ],
    "Medico solicitante: Dra. Sofia Ramos. Valores ficticios para demostracion.",
    "Laboratorio Demo",
  );
  await writeFile(path.join(out, "laboratorio_noviembre.pdf"), pdf);

  const lines = [
    "Laboratorio Demo",
    "Analisis de laboratorio",
    "Fecha: 18/11/2026",
    "Glucemia 99 mg/dL 70 - 100",
    "Colesterol total 181 mg/dL < 200",
    "HDL 54 mg/dL > 40",
    "LDL 108 mg/dL < 130",
    "Documento de demostracion. Valores ficticios.",
  ];
  const photo = await makeLabPhoto(lines, "jpeg");
  await writeFile(path.join(out, "laboratorio_foto.jpg"), photo.body);

  const scan = await makeLabPhoto(lines.map((l) => l.replace("18/11/2026", "17/11/2026")), "jpeg");
  await writeFile(path.join(out, "laboratorio_escaneado.pdf"), makeScannedPdf(scan.body, scan.width, scan.height));
  console.info(`Archivos de ejemplo generados en ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
