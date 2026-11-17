"use client";

import { ChevronDown, Send } from "lucide-react";
import { useActionState, useState } from "react";
import { requestAccessAction } from "@/features/access/actions";
import { HEALTH_SECTIONS } from "@/features/access/resources";
import { initialFormState } from "@/lib/form";
import { Alert } from "@/components/ui/alert";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function RequestAccessForm({ categories }: { categories: { slug: string; name: string }[] }) {
  const [state, action] = useActionState(requestAccessAction, initialFormState);
  const [open, setOpen] = useState(false);
  const e = state.fieldErrors ?? {};
  const v = state.status === "error" ? (state.values ?? {}) : {};

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message ? <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert> : null}
      <TextField
        label="Código del paciente"
        name="code"
        placeholder="ABCD-2345"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={12}
        defaultValue={v.code}
        error={e.code}
        hint="El paciente lo genera en “Mis médicos”. Es de un solo uso."
        className="[&_input]:font-mono [&_input]:tracking-widest [&_input]:uppercase"
      />
      <TextField label="Motivo" name="message" maxLength={300} placeholder="Ej.: Control cardiológico" defaultValue={v.message} error={e.message} optional />
      <div className="rounded-xl ring-1 ring-line ring-inset">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between px-3.5 py-2.5 text-[13px] font-medium text-ink-soft hover:text-ink">
          ¿Qué necesitás ver? (sugerencia para el paciente)
          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <div className={open ? "grid grid-cols-1 gap-x-4 border-t border-line px-3.5 py-3 sm:grid-cols-2" : "hidden"}>
          {HEALTH_SECTIONS.map((s) => (
            <label key={s.key} className="flex items-center gap-2 py-1 text-[13px] text-ink">
              <input type="checkbox" name="requested" value={`HEALTH_SECTION:${s.key}`} className="size-4 accent-brand-600" /> {s.label}
            </label>
          ))}
          {categories.map((c) => (
            <label key={c.slug} className="flex items-center gap-2 py-1 text-[13px] text-ink">
              <input type="checkbox" name="requested" value={`RECORD_CATEGORY:${c.slug}`} className="size-4 accent-brand-600" /> {c.name}
            </label>
          ))}
        </div>
      </div>
      <SubmitButton pendingLabel="Enviando…" className="w-full">
        <Send className="size-4" /> Solicitar acceso
      </SubmitButton>
    </form>
  );
}
