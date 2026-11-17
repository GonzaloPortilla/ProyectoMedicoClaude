export function AuthHeading({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: React.ReactNode }) {
  return (
    <div className="mb-8">
      {eyebrow ? <p className="mb-3 text-[13px] font-medium text-brand-600">{eyebrow}</p> : null}
      <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
      {description ? <p className="mt-2 text-[15px] text-muted">{description}</p> : null}
    </div>
  );
}
