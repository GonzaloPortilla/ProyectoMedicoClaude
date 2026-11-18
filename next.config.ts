import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Cabeceras de seguridad aplicadas a todas las respuestas.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Paquetes nativos o con workers (hash, OCR, render de PDF): se cargan desde node_modules.
  serverExternalPackages: ["@node-rs/argon2", "tesseract.js", "@napi-rs/canvas", "unpdf"],
  experimental: {
    // Subida de estudios médicos: hasta 15 MB por archivo (+ margen del formulario).
    serverActions: { bodySizeLimit: "16mb" },
    proxyClientMaxBodySize: "16mb",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
