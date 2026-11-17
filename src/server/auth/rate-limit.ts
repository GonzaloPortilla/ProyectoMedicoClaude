import "server-only";

/**
 * Limitador de intentos en memoria (ventana fija).
 * Suficiente para un único proceso; con varias instancias reemplazar por Redis u otro
 * almacenamiento compartido manteniendo esta misma interfaz.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Registra un intento. Devuelve `false` si se superó el límite. */
  consume(key: string, now: number = Date.now()): { allowed: boolean; retryAfterMs: number } {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      this.prune(now);
      return { allowed: true, retryAfterMs: 0 };
    }
    entry.count += 1;
    if (entry.count > this.limit) {
      return { allowed: false, retryAfterMs: entry.resetAt - now };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private prune(now: number) {
    if (this.hits.size < 10_000) return;
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}

const globalLimiters = globalThis as unknown as { __limiters?: Record<string, RateLimiter> };
globalLimiters.__limiters ??= {
  login: new RateLimiter(10, 15 * 60 * 1000),
  register: new RateLimiter(10, 60 * 60 * 1000),
  passwordReset: new RateLimiter(5, 60 * 60 * 1000),
};

// Intentos de código de vinculación por médico: evita adivinar códigos por fuerza bruta.
globalLimiters.__limiters.linkCode ??= new RateLimiter(10, 15 * 60 * 1000);

export const limiters = globalLimiters.__limiters as Record<"login" | "register" | "passwordReset" | "linkCode", RateLimiter>;
