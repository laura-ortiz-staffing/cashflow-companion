import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ProjectSelect({
  value,
  onChange,
  label = "Project (optional)",
  hint = "Its cost will count toward this project.",
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  hint?: string;
}) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("sm_projects")
      .select("id, name")
      .neq("status", "finished")
      .order("name")
      .then(({ data }: { data: { id: string; name: string }[] | null }) => setProjects(data ?? []));
  }, []);

  if (projects.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No project</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
