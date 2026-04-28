import { supabase } from "@/integrations/supabase/client";

export async function logAction(params: {
  action: string;
  entity_type?: string;
  entity_id?: string;
  previous_state?: unknown;
  new_state?: unknown;
  metadata?: Record<string, unknown>;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("audit_logs").insert({
    user_id: user.id,
    user_email: user.email,
    action: params.action,
    entity_type: params.entity_type ?? null,
    entity_id: params.entity_id ?? null,
    previous_state: (params.previous_state ?? null) as never,
    new_state: (params.new_state ?? null) as never,
    metadata: (params.metadata ?? null) as never,
  });
}
