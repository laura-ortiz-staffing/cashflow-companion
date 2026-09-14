import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "super_admin" | "admin" | "viewer";
export type AppName = "petty_cash" | "stack_management";
export type SmRole  = "super_admin" | "viewer";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  smRole: SmRole | null;
  permissions: string[];
  appAccess: AppName[];
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [smRole, setSmRole] = useState<SmRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [appAccess, setAppAccess] = useState<AppName[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRole = async (uid: string) => {
    const [{ data: roleData }, { data: permData }, { data: appData }, { data: smRoleData }] =
      await Promise.all([
        supabase.rpc("get_user_role", { _user_id: uid }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from as any)("user_permissions").select("permission").eq("user_id", uid),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.rpc as any)("get_user_app_access", { _user_id: uid }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.rpc as any)("get_sm_role", { _user_id: uid }),
      ]);
    setRole((roleData as AppRole) ?? "viewer");
    setPermissions(((permData ?? []) as { permission: string }[]).map((r) => r.permission));
    setAppAccess(((appData ?? []) as string[]) as AppName[]);
    setSmRole((smRoleData as SmRole | null) ?? null);
  };

  useEffect(() => {
    // Single source of truth: onAuthStateChange covers INITIAL_SESSION, SIGNED_IN,
    // TOKEN_REFRESHED, SIGNED_OUT, etc. We avoid calling fetchRole on token refresh
    // (happens every hour) because roles don't change that frequently.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED") {
          // setTimeout avoids a Supabase client deadlock when calling RPCs
          // inside the auth state change callback.
          setTimeout(() => {
            fetchRole(s.user.id).finally(() => setLoading(false));
          }, 0);
        } else {
          // TOKEN_REFRESHED etc. — session/user already updated above, don't re-fetch role.
          setLoading(false);
        }
      } else {
        setRole(null);
        setSmRole(null);
        setAppAccess([]);
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
    setSmRole(null);
    setPermissions([]);
    setAppAccess([]);
    sessionStorage.removeItem("app_entry");
  };

  const refreshRole = async () => {
    if (user) await fetchRole(user.id);
  };

  return (
    <Ctx.Provider value={{ user, session, role, smRole, permissions, appAccess, loading, signOut, refreshRole }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
