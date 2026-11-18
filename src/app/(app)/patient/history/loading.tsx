/** Esqueleto de carga mientras el servidor prepara la página (navegación entre secciones). */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-label="Cargando" className="animate-pulse">
      <div className="mb-8 space-y-3">
        <div className="h-3 w-24 rounded-full bg-ink/[0.06]" />
        <div className="h-7 w-64 max-w-full rounded-lg bg-ink/[0.07]" />
        <div className="h-4 w-80 max-w-full rounded-full bg-ink/[0.05]" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-40 rounded-[var(--radius-card)] border border-line bg-surface" />
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
