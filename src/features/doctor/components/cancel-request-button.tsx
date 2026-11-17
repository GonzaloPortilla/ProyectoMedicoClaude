"use client";

import { cancelRequestAction } from "@/features/access/actions";

export function CancelRequestButton({ requestId }: { requestId: string }) {
  return (
    <form action={cancelRequestAction}>
      <input type="hidden" name="requestId" value={requestId} />
      <button type="submit" className="text-[13px] font-medium text-muted hover:text-red-600">
        Cancelar
      </button>
    </form>
  );
}
