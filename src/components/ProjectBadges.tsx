import type { Project, ProjectStatus } from "@/lib/sm-costs";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<ProjectStatus, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  finished: "bg-muted text-muted-foreground",
};

export function KindBadge({ kind }: { kind: Project["kind"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold",
        kind === "client"
          ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
          : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
      )}
    >
      {kind === "client" ? "CLIENT" : "INTERNAL"}
    </span>
  );
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase",
        STATUS_STYLE[status],
      )}
    >
      {status}
    </span>
  );
}
