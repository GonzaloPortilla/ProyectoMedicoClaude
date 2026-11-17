export function TermsCheckbox({ error, defaultChecked }: { error?: string[]; defaultChecked?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-start gap-3 text-sm text-ink-soft">
        <input
          type="checkbox"
          name="acceptTerms"
          defaultChecked={defaultChecked}
          className="mt-0.5 size-4 shrink-0 rounded border-line-strong accent-brand-600"
          aria-invalid={error?.length ? true : undefined}
        />
        <span>Acepto los términos de uso y la política de privacidad, y entiendo que mis datos de salud son tratados como información sensible.</span>
      </label>
      {error?.length ? <p className="pl-7 text-[13px] text-red-600">{error[0]}</p> : null}
    </div>
  );
}
