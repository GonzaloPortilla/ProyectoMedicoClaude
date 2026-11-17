"use client";

import { useActionState, useState } from "react";
import { approveRequestAction } from "@/features/access/actions";
import { DURATION_OPTIONS, HEALTH_SECTIONS, SENSITIVE_CATEGORIES } from "@/features/access/resources";
import { initialFormState } from "@/lib/form";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";

type Category = { slug: string; name: string };

function CheckRow({ name, value, label, hint, defaultChecked, badge }: { name: string; value: string; label: string; hint?: string; defaultChecked?: boolean; badge?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-canvas/70 has-[:checked]:bg-brand-50/60">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="mt-0.5 size-4 shrink-0 accent-brand-600" />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
          {label}
          {badge ? <Badge tone="amber">{badge}</Badge> : null}
        </span>
        {hint ? <span className="block text-[13px] text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

export function ApproveForm({ requestId, categories, preselected }: { requestId: string; categories: Category[]; preselected: string[] }) {
  const [state, action] = useActionState(approveRequestAction, initialFormState);
  const [duration, setDuration] = useState("24h");
  const [allowCreate, setAllowCreate] = useState(false);
  const selected = new Set(preselected);
  const e = state.fieldErrors ?? {};
  const [tomorrow] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="requestId" value={requestId} />
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}

      <fieldset>
        <legend className="mb-1 text-[15px] font-semibold tracking-tight text-ink">¿Qué querés compartir?</legend>
        <p className="mb-3 text-[13px] text-muted">Sólo lo que marques va a ser visible. Los datos de contacto nunca se comparten.</p>
        {e.resources ? <p className="mb-2 text-[13px] text-red-600">{e.resources[0]}</p> : null}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <p className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted uppercase">Mi salud</p>
            {HEALTH_SECTIONS.map((s) => (
              <CheckRow key={s.key} name="resources" value={`HEALTH_SECTION:${s.key}`} label={s.label} hint={s.description} defaultChecked={selected.has(`HEALTH_SECTION:${s.key}`)} />
            ))}
          </div>
          <div>
            <p className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted uppercase">Estudios e historial</p>
            <div className="max-h-[420px] overflow-y-auto">
              {categories.map((c) => (
                <CheckRow
                  key={c.slug}
                  name="resources"
                  value={`RECORD_CATEGORY:${c.slug}`}
                  label={c.name}
                  badge={SENSITIVE_CATEGORIES.has(c.slug) ? "Sensible" : undefined}
                  defaultChecked={selected.has(`RECORD_CATEGORY:${c.slug}`)}
                />
              ))}
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset className="border-t border-line pt-5">
        <legend className="mb-3 text-[15px] font-semibold tracking-tight text-ink">¿Por cuánto tiempo?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DURATION_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={cn(
                "flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                duration === o.value ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-soft hover:bg-canvas",
              )}
            >
              <input type="radio" name="duration" value={o.value} checked={duration === o.value} onChange={() => setDuration(o.value)} className="sr-only" />
              {o.label}
            </label>
          ))}
        </div>
        {duration === "custom" ? (
          <div className="mt-3 max-w-xs space-y-1.5">
            <label htmlFor="customDate" className="block text-[13px] font-medium text-ink-soft">
              Vence al final del día
            </label>
            <input id="customDate" name="customDate" type="date" min={tomorrow} required className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm shadow-card focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none" />
            {e.customDate ? <p className="text-[13px] text-red-600">{e.customDate[0]}</p> : null}
          </div>
        ) : null}
        {duration === "permanent" ? <p className="mt-3 text-[13px] text-amber-700">El acceso seguirá activo hasta que lo revoques manualmente.</p> : null}
      </fieldset>

      <fieldset className="space-y-1 border-t border-line pt-5">
        <legend className="mb-2 text-[15px] font-semibold tracking-tight text-ink">¿Qué más puede hacer?</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-canvas/70">
          <input type="checkbox" name="allowCreate" checked={allowCreate} onChange={(ev) => setAllowCreate(ev.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
          <span>
            <span className="block text-sm font-medium text-ink">Crear informes en mi historial</span>
            <span className="block text-[13px] text-muted">Sólo en las categorías que marcaste. Los informes quedan firmados y no se pueden reemplazar.</span>
          </span>
        </label>
        <label className={cn("flex items-start gap-3 rounded-xl px-3 py-2.5", allowCreate ? "cursor-pointer hover:bg-canvas/70" : "opacity-50")}>
          <input type="checkbox" name="allowUpload" disabled={!allowCreate} className="mt-0.5 size-4 accent-brand-600" />
          <span>
            <span className="block text-sm font-medium text-ink">Adjuntar archivos a esos informes</span>
            <span className="block text-[13px] text-muted">PDF o imágenes.</span>
          </span>
        </label>
      </fieldset>

      <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-end">
        <SubmitButton size="lg" pendingLabel="Autorizando…" className="w-full sm:w-auto">
          Autorizar acceso
        </SubmitButton>
      </div>
    </form>
  );
}
