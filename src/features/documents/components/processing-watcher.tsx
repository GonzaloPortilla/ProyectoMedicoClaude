"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Mientras el análisis corre en segundo plano, refresca la página cada 2 s (hasta ~2 min). */
export function ProcessingWatcher() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    let ticks = 0;
    const id = setInterval(() => {
      ticks++;
      if (ticks > 60) {
        clearInterval(id);
        setTimedOut(true);
        return;
      }
      router.refresh();
    }, 2000);
    return () => clearInterval(id);
  }, [router]);
  return timedOut ? (
    <p className="text-[13px] text-muted" role="status">
      Está tardando más de lo habitual. Podés volver más tarde: el estudio ya está guardado.
    </p>
  ) : null;
}
