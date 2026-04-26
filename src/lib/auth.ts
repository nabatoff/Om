import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
export type ProfileRow = Tables<"profiles">;

export async function getSessionUser() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getProfile(): Promise<ProfileRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (data) return data;

  // Self-heal missing profile to avoid login/dashboard redirect loops.
  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : null;
  const { error: insertError } = await supabase.from("profiles").insert({
    id: user.id,
    full_name: fullName,
    role: "manager",
  });
  if (insertError) return null;

  const { data: created } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return created ?? null;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireProfile() {
  const user = await requireUser();
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return { user, profile };
}

export async function requireAdmin() {
  const { user, profile } = await requireProfile();
  if (profile.role !== "admin") {
    redirect("/dashboard");
  }
  return { user, profile };
}
