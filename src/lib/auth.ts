import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
export type ProfileRow = Tables<"profiles">;

export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getProfile(): Promise<ProfileRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return data;
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
