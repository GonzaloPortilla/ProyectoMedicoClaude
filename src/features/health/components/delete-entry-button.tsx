"use client";

import { Trash2 } from "lucide-react";
import { deleteHealthEntryAction } from "@/features/health/actions";
import type { HealthKind } from "@/features/health/config";

export function DeleteEntryButton({ kind, id, label }: { kind: HealthKind; id: string; label: string }) {
  return (
    <form
      action={deleteHealthEntryAction}
      onSubmit={(e) => {
        if (!confirm(`¿Eliminar "${label}"?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label={`Eliminar ${label}`}
        className="flex size-8 items-center justify-center rounded-lg text-muted opacity-70 transition hover:bg-red-50 hover:text-red-600 hover:opacity-100 focus-visible:opacity-100"
      >
        <Trash2 className="size-4" />
      </button>
    </form>
  );
}
