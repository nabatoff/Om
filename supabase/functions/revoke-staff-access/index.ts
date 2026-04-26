import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    return new Response(JSON.stringify({ error: "Server config" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: me } = await userClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Только администратор" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: { user_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const userId = (body.user_id || "").trim();
  if (!userId) {
    return new Response(JSON.stringify({ error: "user_id" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
  if (userId === user.id) {
    return new Response(JSON.stringify({ error: "Нельзя отозвать доступ у самого себя" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, service, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: target, error: tErr } = await admin
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (tErr || !target) {
    return new Response(JSON.stringify({ error: "Сотрудник не найден" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (target.is_active === false) {
    return new Response(JSON.stringify({ error: "Доступ уже отозван" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (target.role === "admin") {
    const { count, error: cErr } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .or("is_active.is.null,is_active.eq.true");
    if (cErr) {
      return new Response(JSON.stringify({ error: cErr.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if ((count ?? 0) < 2) {
      return new Response(JSON.stringify({ error: "Нельзя отозвать единственного администратора" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  }

  // ФИО и роль остаются: имя в старых отчётах (поле manager) и карточка сотрудника сохраняются
  const { error: pErr } = await admin
    .from("profiles")
    .update({ is_active: false, login_code: null })
    .eq("id", userId);
  if (pErr) {
    return new Response(JSON.stringify({ error: pErr.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { error: banErr } = await admin.auth.admin.updateUserById(userId, { ban_duration: "240000h" });
  if (banErr) {
    return new Response(JSON.stringify({ error: banErr.message }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, full_name: target.full_name }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
