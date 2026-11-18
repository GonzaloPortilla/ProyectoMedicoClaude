/**
 * Minimización de datos de red: la IP se guarda anonimizada (como hace Google Analytics):
 * IPv4 sin el último octeto, IPv6 sólo con los primeros 48 bits. Alcanza para detectar
 * patrones (país/proveedor, ataques desde un mismo rango) sin identificar a una persona.
 */
export function anonymizeIp(ip: string | null | undefined): string | null {
  if (!ip || ip === "unknown") return null;
  const clean = ip.trim().replace(/^::ffff:/, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(clean)) {
    const p = clean.split(".");
    return `${p[0]}.${p[1]}.${p[2]}.0`;
  }
  if (clean.includes(":")) {
    const groups = clean.split("::")[0]!.split(":").filter(Boolean);
    return `${groups.slice(0, 3).join(":")}::`;
  }
  return null;
}

/** "Chrome en Windows" a partir del User-Agent (sólo para mostrar; se guarda truncado). */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Dispositivo desconocido";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "otro sistema";
  return `${browser} en ${os}`;
}
