import { FilePlus2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function PermissionChips({ summary }: { summary: { sections: string[]; categories: string[]; canCreate: boolean; canUpload: boolean } }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {summary.sections.map((s) => (
        <Badge key={`s-${s}`} tone="blue">
          {s}
        </Badge>
      ))}
      {summary.categories.map((c) => (
        <Badge key={`c-${c}`} tone="brand">
          {c}
        </Badge>
      ))}
      {summary.canCreate ? (
        <Badge tone="violet">
          <FilePlus2 className="size-3" /> Puede crear informes
        </Badge>
      ) : null}
      {summary.canUpload ? (
        <Badge tone="violet">
          <Upload className="size-3" /> Puede adjuntar archivos
        </Badge>
      ) : null}
    </div>
  );
}
