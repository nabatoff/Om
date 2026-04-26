import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function norm(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anon || !service) {
    return new Response(JSON.stringify({ error: "Server config" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const { data: prof } = await userClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Только администратор" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
  }

  let body: { login_code?: string; password?: string; full_name?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const code = norm(body.login_code || "");
  const password = body.password || "";
  const full_name = (body.full_name || "").trim();
  const role = body.role === "admin" ? "admin" : "manager";

  if (code.length < 2 || code.length > 32) {
    return new Response(JSON.stringify({ error: "Код: 2–32 символа (a–z, 0–9, _)" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
  if (password.length < 6) {
    return new Response(JSON.stringify({ error: "Пароль минимум 6 символов" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
  if (full_name.length < 2) {
    return new Response(JSON.stringify({ error: "Укажите ФИО" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const domain = Deno.env.get("STAFF_EMAIL_DOMAIN") || "om.staff";
  const email = `${code}@${domain}`;

  const admin = createClient(supabaseUrl, service, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: newUser, error: cuErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (cuErr) {
    return new Response(JSON.stringify({ error: cuErr.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const id = newUser.user.id;
  const { error: pErr } = await admin.from("profiles").insert({ id, full_name, role, is_active: true, login_code: code });
  if (pErr) {
    try {
      await admin.auth.admin.deleteUser(id);
    } catch { /* */ }
    return new Response(JSON.stringify({ error: pErr.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ ok: true, id }), { headers: { ...cors, "Content-Type": "application/json" } });
});
