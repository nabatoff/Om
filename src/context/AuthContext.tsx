import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase, getSupabaseOptional, isSupabaseConfigured } from '../lib/supabase';

export type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
  is_active: boolean | null;
  login_code: string | null;
};

type AuthCtx = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  ready: boolean;
  /** Соответствует `profiles.role = 'admin'` (см. `is_admin()` в БД) */
  isAdmin: boolean;
  managerName: string;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

const UNCONFIG: AuthCtx = {
  session: null,
  user: null,
  profile: null,
  ready: true,
  isAdmin: false,
  managerName: '',
  signIn: async () => ({ error: new Error('Supabase не настроен') }),
  signOut: async () => {},
};

function AuthProviderUnconfigured({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={UNCONFIG}>{children}</Ctx.Provider>;
}

function AuthProviderInner({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  const loadProfile = useCallback(async (uid: string) => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('profiles')
      .select('id, full_name, role, is_active, login_code')
      .eq('id', uid)
      .maybeSingle();
    if (error) {
      console.error(error);
      setProfile(null);
      return;
    }
    if (data) {
      setProfile(data as Profile);
      return;
    }
    const s = (await sb.auth.getUser()).data.user;
    if (!s) return;
    const name = (s.user_metadata as { full_name?: string } | null)?.full_name || s.email || '';
    const { error: insErr } = await sb.from('profiles').insert({
      id: uid,
      full_name: name,
      is_active: true,
      login_code: null,
    });
    if (insErr) {
      console.error(insErr);
      setProfile({ id: uid, full_name: s.email ?? null, role: null, is_active: true, login_code: null });
      return;
    }
    setProfile({ id: uid, full_name: name, role: null, is_active: true, login_code: null });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getSupabaseOptional()) {
        setReady(true);
        return;
      }
      const { data: { session: s } } = await getSupabase().auth.getSession();
      if (cancelled) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) await loadProfile(s.user.id);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProfile]);

  useEffect(() => {
    if (!getSupabaseOptional()) return;
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) await loadProfile(s.user.id);
        else setProfile(null);
        setReady(true);
      },
    );
    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  }, []);

  const managerName = useMemo(() => {
    const n = profile?.full_name?.trim();
    if (n) return n;
    return user?.email?.split('@')[0] || 'Пользователь';
  }, [profile, user]);

  const isAdmin = useMemo(() => profile?.role === 'admin', [profile?.role]);

  const value: AuthCtx = {
    session,
    user,
    profile,
    ready,
    isAdmin,
    managerName,
    signIn,
    signOut,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) {
    return <AuthProviderUnconfigured>{children}</AuthProviderUnconfigured>;
  }
  return <AuthProviderInner>{children}</AuthProviderInner>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth: AuthProvider required');
  return c;
}
