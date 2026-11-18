"use client";

import { useActionState } from "react";
import { verifyEmailAction } from "@/features/auth/actions";
import { initialFormState } from "@/lib/form";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, action] = useActionState(verifyEmailAction, initialFormState);
  return (
    <form action={action} className="space-y-5">
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <SubmitButton size="lg" className="w-full" pendingLabel="Activando…">
        Activar mi cuenta
      </SubmitButton>
    </form>
  );
}
