-- ============================================================================
-- Microsoft Graph (SharePoint Excel) two-way sync
-- ----------------------------------------------------------------------------
-- Adds:
--   * synced_at / external_row_id columns on the three synced tables
--   * graph_sync_state singleton (drive/item ids, subscription, status, errors)
--   * notify_graph_push() trigger function that POSTs to the graph-push edge fn
--   * AFTER INSERT/UPDATE/DELETE triggers on invoices, petty_cash_balance, requests
--
-- Requires the pg_net extension (already enabled by default in Supabase) and a
-- Vault entry for the service-role key (key name: 'graph_service_role_key').
-- Set up the Vault entry once in the SQL editor:
--   select vault.create_secret('<service_role_jwt>', 'graph_service_role_key');
-- ============================================================================

create extension if not exists pg_net;

-- ---------- sync columns -----------------------------------------------------
alter table public.invoices
  add column if not exists external_row_id text,
  add column if not exists synced_at timestamptz;

alter table public.petty_cash_balance
  add column if not exists external_row_id text,
  add column if not exists synced_at timestamptz;

alter table public.requests
  add column if not exists external_row_id text,
  add column if not exists synced_at timestamptz;

-- ---------- graph_sync_state -------------------------------------------------
create table if not exists public.graph_sync_state (
  id boolean primary key default true check (id),
  workbook_url text,
  drive_id text,
  item_id text,
  subscription_id text,
  subscription_expires_at timestamptz,
  client_state text,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'connecting', 'connected', 'error')),
  last_error text,
  last_push_at timestamptz,
  last_pull_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.graph_sync_state enable row level security;

create policy "All authenticated read graph state"
  on public.graph_sync_state for select to authenticated using (true);

create policy "Super admins manage graph state"
  on public.graph_sync_state for all to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

insert into public.graph_sync_state (id) values (true)
  on conflict (id) do nothing;

-- ---------- notify_graph_push ------------------------------------------------
-- Called from AFTER triggers on the three synced tables. Skips the call when
-- graph_sync_state.status != 'connected' so a disabled integration costs nothing.
create or replace function public.notify_graph_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  state record;
  payload jsonb;
  fn_url text;
  service_key text;
begin
  select * into state from public.graph_sync_state where id = true;
  if not found or state.status <> 'connected' then
    return coalesce(new, old);
  end if;

  -- Avoid recursion: if the change came from graph-pull (which sets synced_at
  -- in the same statement), skip the outbound push.
  if (tg_op = 'UPDATE') and (new.synced_at is distinct from old.synced_at)
     and (new.* is not distinct from old.* or
          (new.* is distinct from old.* and new.synced_at > coalesce(old.synced_at, 'epoch'::timestamptz)))
  then
    -- still allow real edits, only skip when ONLY synced_at moved
    if to_jsonb(new) - 'synced_at' = to_jsonb(old) - 'synced_at' then
      return new;
    end if;
  end if;

  payload := jsonb_build_object(
    'table', tg_table_name,
    'op', tg_op,
    'record', case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end,
    'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
  );

  fn_url := current_setting('app.settings.graph_push_url', true);
  if fn_url is null or fn_url = '' then
    -- soft-fail: leave a breadcrumb instead of breaking the user's transaction
    update public.graph_sync_state
       set last_error = 'app.settings.graph_push_url not configured',
           updated_at = now()
     where id = true;
    return coalesce(new, old);
  end if;

  begin
    select decrypted_secret into service_key
      from vault.decrypted_secrets
      where name = 'graph_service_role_key'
      limit 1;
  exception when others then
    service_key := null;
  end;

  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(service_key, '')
    ),
    body := payload,
    timeout_milliseconds := 5000
  );

  return coalesce(new, old);
end;
$$;

-- ---------- triggers ---------------------------------------------------------
drop trigger if exists trg_invoices_graph_push on public.invoices;
create trigger trg_invoices_graph_push
  after insert or update or delete on public.invoices
  for each row execute function public.notify_graph_push();

drop trigger if exists trg_petty_cash_balance_graph_push on public.petty_cash_balance;
create trigger trg_petty_cash_balance_graph_push
  after insert or update or delete on public.petty_cash_balance
  for each row execute function public.notify_graph_push();

drop trigger if exists trg_requests_graph_push on public.requests;
create trigger trg_requests_graph_push
  after insert or update or delete on public.requests
  for each row execute function public.notify_graph_push();

-- ---------- helper: bulk mark synced (used by graph-pull) --------------------
create or replace function public.graph_mark_synced(
  _table text,
  _id uuid,
  _external_row_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _table = 'invoices' then
    update public.invoices
       set external_row_id = _external_row_id, synced_at = now()
     where id = _id;
  elsif _table = 'petty_cash_balance' then
    update public.petty_cash_balance
       set external_row_id = _external_row_id, synced_at = now()
     where id = _id;
  elsif _table = 'requests' then
    update public.requests
       set external_row_id = _external_row_id, synced_at = now()
     where id = _id;
  end if;
end;
$$;
