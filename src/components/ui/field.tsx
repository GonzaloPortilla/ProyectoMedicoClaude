import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const control =
  "block w-full rounded-xl border bg-surface px-3.5 text-[15px] text-ink shadow-card placeholder:text-muted/70 transition-[border-color,box-shadow] duration-150 focus:outline-none focus:ring-4 disabled:bg-canvas disabled:text-muted sm:text-sm";
const okState = "border-line-strong focus:border-brand-500 focus:ring-brand-500/15";
const errorState = "border-red-300 focus:border-red-400 focus:ring-red-500/15";

type FieldProps = {
  label: string;
  name: string;
  error?: string[];
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  /** id del control; por defecto, el name (hace falta si el mismo campo aparece varias veces). */
  id?: string;
};

function FieldShell({ label, name: fieldName, id, error, hint, optional, className, children }: FieldProps & { children: ReactNode }) {
  const name = id ?? fieldName;
  const describedBy = error?.length ? `${name}-error` : hint ? `${name}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", className)} data-described-by={describedBy}>
      <label htmlFor={name} className="flex items-baseline justify-between text-[13px] font-medium text-ink-soft">
        <span>{label}</span>
        {optional ? <span className="text-xs font-normal text-muted">Opcional</span> : null}
      </label>
      {children}
      {error?.length ? (
        <p id={`${name}-error`} className="text-[13px] text-red-600">
          {error[0]}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({ label, name, error, hint, optional, className, ...props }: FieldProps & Omit<ComponentProps<"input">, "name">) {
  return (
    <FieldShell label={label} name={name} id={props.id} error={error} hint={hint} optional={optional} className={className}>
      <input
        id={props.id ?? name}
        name={name}
        aria-invalid={error?.length ? true : undefined}
        aria-describedby={error?.length ? `${props.id ?? name}-error` : hint ? `${props.id ?? name}-hint` : undefined}
        className={cn(control, "h-11", error?.length ? errorState : okState)}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  name,
  error,
  hint,
  optional,
  className,
  children,
  ...props
}: FieldProps & Omit<ComponentProps<"select">, "name">) {
  return (
    <FieldShell label={label} name={name} id={props.id} error={error} hint={hint} optional={optional} className={className}>
      <div className="relative">
        <select
          id={props.id ?? name}
          name={name}
          aria-invalid={error?.length ? true : undefined}
          aria-describedby={error?.length ? `${props.id ?? name}-error` : hint ? `${props.id ?? name}-hint` : undefined}
          className={cn(control, "h-11 appearance-none pr-10", error?.length ? errorState : okState)}
          {...props}
        >
          {children}
        </select>
        <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted">
          <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </FieldShell>
  );
}

export function TextAreaField({ label, name, error, hint, optional, className, ...props }: FieldProps & Omit<ComponentProps<"textarea">, "name">) {
  return (
    <FieldShell label={label} name={name} id={props.id} error={error} hint={hint} optional={optional} className={className}>
      <textarea
        id={props.id ?? name}
        name={name}
        aria-invalid={error?.length ? true : undefined}
        className={cn(control, "min-h-20 py-2.5", error?.length ? errorState : okState)}
        {...props}
      />
    </FieldShell>
  );
}
