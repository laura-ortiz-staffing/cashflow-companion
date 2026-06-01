-- Granular permissions table (e.g. "reports" access beyond base role)
create table user_permissions (
  user_id   uuid references auth.users(id) on delete cascade,
  permission text not null,
  granted_by uuid references auth.users(id),
  granted_at timestamptz default now(),
  primary key (user_id, permission)
);

alter table user_permissions enable row level security;

-- Users can read their own permissions; super_admin can read all
create policy "read_permissions" on user_permissions
  for select using (
    auth.uid() = user_id or
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'super_admin')
  );

-- Only super_admin can grant
create policy "super_admin_insert_permissions" on user_permissions
  for insert with check (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'super_admin')
  );

-- Only super_admin can revoke
create policy "super_admin_delete_permissions" on user_permissions
  for delete using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'super_admin')
  );
