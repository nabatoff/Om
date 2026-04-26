import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import {
  getSupabasePublicEnv,
  isSupabaseConfigured,
} from "@/lib/supabase/env";

export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }
  const { url, anonKey } = getSupabasePublicEnv();
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Fail-safe for Vercel Edge: do not let auth refresh block the whole request.
  // If Supabase is slow/unreachable, continue without hard failing middleware.
  try {
    await Promise.race([
      supabase.auth.getUser(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("supabase_auth_timeout")), 2500),
      ),
    ]);
  } catch {
    return supabaseResponse;
  }

  return supabaseResponse;
}
