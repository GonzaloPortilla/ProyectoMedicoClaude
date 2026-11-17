import { BadgeCheck } from "lucide-react";
import { Avatar } from "@/components/shell/user-card";
import { jurisdictionName } from "@/lib/jurisdictions";

type Doctor = {
  firstName: string;
  lastName: string;
  doctorProfile: { specialty: string; licenseNumber: string; jurisdiction: string; verificationStatus: string } | null;
};

/** Identidad del profesional tal como la ve el paciente. */
export function DoctorIdentity({ doctor, size = "md" }: { doctor: Doctor; size?: "md" | "lg" }) {
  const p = doctor.doctorProfile;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar user={doctor} className={size === "lg" ? "size-12 text-base" : "size-10 text-sm"} />
      <div className="min-w-0">
        <p className={`flex items-center gap-1.5 font-semibold tracking-tight text-ink ${size === "lg" ? "text-lg" : ""}`}>
          <span className="truncate">
            Dr/a. {doctor.firstName} {doctor.lastName}
          </span>
          {p?.verificationStatus === "VERIFIED" ? <BadgeCheck aria-label="Profesional verificado" className="size-4 shrink-0 text-brand-600" /> : null}
        </p>
        {p ? (
          <p className="truncate text-[13px] text-muted">
            {p.specialty} · Mat. {p.licenseNumber} · {jurisdictionName(p.jurisdiction)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
