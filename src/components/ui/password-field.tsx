"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function PasswordField({
  label,
  name,
  error,
  hint,
  className,
  ...props
}: { label: string; name: string; error?: string[]; hint?: string; className?: string } & Omit<ComponentProps<"input">, "name" | "type">) {
  const [visible, setVisible] = useState(false);
  const invalid = !!error?.length;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={name} className="block text-[13px] font-medium text-ink-soft">
        {label}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${name}-error` : hint ? `${name}-hint` : undefined}
          className={cn(
            "block h-11 w-full rounded-xl border bg-surface pr-11 pl-3.5 text-[15px] text-ink shadow-card transition-[border-color,box-shadow] duration-150 placeholder:text-muted/70 focus:ring-4 focus:outline-none sm:text-sm",
            invalid ? "border-red-300 focus:border-red-400 focus:ring-red-500/15" : "border-line-strong focus:border-brand-500 focus:ring-brand-500/15",
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-ink/[0.05] hover:text-ink"
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {invalid ? (
        <p id={`${name}-error`} className="text-[13px] text-red-600">
          {error![0]}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
