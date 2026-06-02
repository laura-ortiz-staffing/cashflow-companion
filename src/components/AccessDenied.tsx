import type { ComponentType } from "react";

export function AccessDenied({ icon: Icon }: { icon: ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/40" />
      <p className="font-display text-lg">Access restricted</p>
      <p className="text-sm text-muted-foreground">Ask your Super Admin to grant you access to this section.</p>
    </div>
  );
}
