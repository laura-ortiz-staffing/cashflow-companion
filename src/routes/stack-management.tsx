import { Outlet, createFileRoute } from "@tanstack/react-router";
import { StackManagementShell } from "@/components/StackManagementShell";

export const Route = createFileRoute("/stack-management")({
  component: () => (
    <StackManagementShell>
      <Outlet />
    </StackManagementShell>
  ),
});
