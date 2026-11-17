import "server-only";

export type MailMessage = { to: string; subject: string; text: string };

/**
 * Abstracción de envío de emails.
 * En esta fase no hay proveedor configurado. Con MAIL_TRANSPORT=console (valor por
 * defecto fuera de producción) el mensaje se imprime en la consola del servidor.
 * Para producción, implementar un proveedor real (SMTP, Resend, SES, etc.)
 * detrás de esta misma función.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  const transport = process.env.MAIL_TRANSPORT ?? (process.env.NODE_ENV === "production" ? "disabled" : "console");
  if (transport !== "console") {
    console.warn(`[mail] Sin proveedor de email configurado. Mensaje para ${maskEmail(message.to)} no enviado.`);
    return;
  }
  console.info(
    ["", "──────── [mail:dev] ────────", `Para: ${message.to}`, `Asunto: ${message.subject}`, "", message.text, "────────────────────────────", ""].join("\n"),
  );
}

function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  return `${user?.slice(0, 2)}***@${domain}`;
}
