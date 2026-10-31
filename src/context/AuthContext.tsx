import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase, isDemo } from "../lib/supabaseClient";
import { demoProfile } from "../lib/demo";
import type { Profile } from "../lib/types";

export type DemoRole = "guest" | "member" | "admin" | "front_desk";

const DEMO_ADMIN: Profile = demoProfile;
const DEMO_MEMBER: Profile = {
  id: "demo-member",
  email: "member001@example.com",
  full_name: "Demo member 001",
  phone: null,
  role: "member",
  balance: 240,
  locale: "zh",
  created_at: new Date().toISOString(),
};
const DEMO_FRONT: Profile = {
  ...demoProfile,
  id: "demo-front",
  email: "staff001@example.com",
  full_name: "Demo staff",
  role: "front_desk",
};

function demoProfileFor(role: DemoRole): Profile | null {
  if (role === "admin") return DEMO_ADMIN;
  if (role === "front_desk") return DEMO_FRONT;
  if (role === "member") return DEMO_MEMBER;
  return null;
}

interface AuthCtx {
  user: { id: string; email?: string } | null;
  profile: Profile | null;
  loading: boolean;
  demoRole: DemoRole;
  setDemoRole: (r: DemoRole) => void;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoRole, setDemoRoleState] = useState<DemoRole>("guest");

  function applyDemoRole(role: DemoRole) {
    setDemoRoleState(role);
    const p = demoProfileFor(role);
    if (p) {
      setUser({ id: p.id, email: p.email ?? undefined });
      setProfile(p);
    } else {
      setUser(null);
      setProfile(null);
    }
  }

  async function loadProfile(uid: string) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .single();
    setProfile(data as Profile | null);
  }

  useEffect(() => {
    if (isDemo()) {
      applyDemoRole("guest");
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u ? { id: u.id, email: u.email } : null);
      if (u) loadProfile(u.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user ?? null;
      setUser(u ? { id: u.id, email: u.email } : null);
      if (u) loadProfile(u.id);
      else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (isDemo()) {
      applyDemoRole("member");
      return {};
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    if (isDemo()) {
      applyDemoRole("member");
      return {};
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return error ? { error: error.message } : {};
  };

  const signOut = async () => {
    if (isDemo()) {
      applyDemoRole("guest");
      return;
    }
    await supabase.auth.signOut();
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (isDemo()) return;
    if (user) await loadProfile(user.id);
  };

  return (
    <Ctx.Provider
      value={{
        user,
        profile,
        loading,
        demoRole,
        setDemoRole: applyDemoRole,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
