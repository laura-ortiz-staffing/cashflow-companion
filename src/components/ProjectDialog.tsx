import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import type { Project, ProjectKind, ProjectStatus } from "@/lib/sm-costs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const KINDS: { value: ProjectKind; label: string }[] = [
  { value: "client", label: "Client project" },
  { value: "internal", label: "Internal initiative" },
];
const STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "finished", label: "Finished" },
];

export function ProjectDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  project?: Project | null;
  onSaved: (id: string) => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<ProjectKind>("client");
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setKind(project?.kind ?? "client");
    setCompany(project?.client_company ?? "");
    setContact(project?.client_contact_name ?? "");
    setEmail(project?.client_contact_email ?? "");
    setStatus(project?.status ?? "active");
  }, [open, project]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      toast.error("Project name is required.");
      return;
    }
    setBusy(true);
    const isClient = kind === "client";
    const row = {
      name: name.trim(),
      description: description.trim() || null,
      kind,
      client_company: isClient ? company.trim() || null : null,
      client_contact_name: isClient ? contact.trim() || null : null,
      client_contact_email: isClient ? email.trim() || null : null,
      status,
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      let id = project?.id ?? "";
      if (project) {
        const { error } = await db.from("sm_projects").update(row).eq("id", project.id);
        if (error) throw error;
      } else {
        const { data, error } = await db
          .from("sm_projects")
          .insert({ ...row, created_by: user.id })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      }
      await logAction({
        action: project ? "sm_project.updated" : "sm_project.created",
        entity_type: "sm_project",
        entity_id: id,
      });
      toast.success(project ? "Project updated" : "Project created");
      onSaved(id);
    } catch (err) {
      const e2 = err as { code?: string; message?: string };
      toast.error(
        e2.code === "23505"
          ? "A project with that name already exists."
          : (e2.message ?? "Failed to save"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="pj-name">Name *</Label>
            <Input
              id="pj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="e.g. Supply Sync"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pj-desc">Description</Label>
            <Textarea
              id="pj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              placeholder="What is this project about?"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as ProjectKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {kind === "client" && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Client details
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pj-company">Company</Label>
                <Input
                  id="pj-company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pj-contact">Contact name</Label>
                  <Input
                    id="pj-contact"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pj-email">Contact email</Label>
                  <Input
                    id="pj-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={160}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy}
              style={{ background: "var(--sm-primary)", color: "var(--sm-primary-fg)" }}
            >
              {busy ? "Saving…" : project ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
