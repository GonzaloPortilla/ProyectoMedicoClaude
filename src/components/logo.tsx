import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-brand-500 to-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(11,18,32,0.2)]",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[18px] text-white" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12h4l2.5-6 5 12L17 12h4" />
      </svg>
    </span>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 rounded-lg", className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight text-ink">Vitalia</span>
    </Link>
  );
}
