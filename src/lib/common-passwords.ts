/**
 * Contraseñas muy comunes (y variantes en español) que se rechazan aunque cumplan las reglas.
 * Recomendación NIST SP 800-63B: bloquear contraseñas conocidas/filtradas.
 * Para producción conviene complementar con la API de Have I Been Pwned (k-anonymity).
 */
export const COMMON_PASSWORDS = new Set(
  [
    "password1", "password12", "password123", "passw0rd", "qwerty123", "qwerty1234", "abc12345", "abcd1234",
    "12345678a", "123456789a", "a12345678", "iloveyou1", "welcome1", "welcome123", "admin123", "admin1234",
    "letmein1", "monkey123", "dragon123", "football1", "baseball1", "sunshine1", "princess1", "trustno1",
    "contraseña1", "contrasena1", "contraseña123", "contrasena123", "clave1234", "clave12345", "hola1234",
    "hola12345", "argentina1", "argentina123", "boca1234", "river1234", "teamo123", "tequiero1", "maradona10",
    "messi1010", "messi10", "123qweasd", "1q2w3e4r", "1q2w3e4r5t", "zaq12wsx", "asdf1234", "asdfgh123",
    "salud1234", "medico123", "doctor123", "paciente1", "vitalia1", "vitalia123",
  ].map((p) => p.toLowerCase()),
);
