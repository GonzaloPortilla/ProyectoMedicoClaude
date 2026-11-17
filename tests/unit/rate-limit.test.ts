import { describe, expect, it } from "vitest";
import { RateLimiter } from "@/server/auth/rate-limit";

describe("RateLimiter", () => {
  it("bloquea al superar el límite y se reinicia al terminar la ventana", () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.consume("k", 0).allowed).toBe(true);
    expect(limiter.consume("k", 10).allowed).toBe(true);
    const blocked = limiter.consume("k", 20);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(980);
    expect(limiter.consume("k", 1001).allowed).toBe(true);
  });

  it("las claves son independientes", () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.consume("a", 0).allowed).toBe(true);
    expect(limiter.consume("b", 0).allowed).toBe(true);
    expect(limiter.consume("a", 0).allowed).toBe(false);
  });
});
