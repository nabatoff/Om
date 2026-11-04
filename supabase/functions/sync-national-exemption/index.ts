import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { codesFromRows, decreeExpiry, detectKind, extractLinks, extractRows, listZip, sha256Hex, type NrLink } from "./parse.ts";

/**
 * Автоподтягивание кодов «Нацизъятия» со страницы zakup.gov.kz/nr.
 *
 * Страница собирается из публичного API (`news/national-regime`): в HTML описания лежат ссылки на файлы
 * goszakup.gov.kz/pv2/… (списки КТРУ по каждому постановлению). Функция раз в сутки (pg_cron) скачивает
 * эти файлы, сравнивает хэш с `crm_ens_tru_nr_sources`, из новых/изменённых вытаскивает коды ЕНС ТРУ и
 * добавляет в `crm_ens_tru_national_exemption_codes` те, которых там ещё нет (существующие не трогает).
 * Если что-то добавилось или документ не разобрался — шлёт сообщение в Telegram.
 *
 * Вызов: cron (`x-cron-key` = NR_SYNC_CRON_SECRET) или JWT администратора. `?dry=1` — ничего не пишет.
 */

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
};

const NR_API = "https://zakup.gov.kz/api/core/api/public/news/national-regime/";
const FETCH_TIMEOUT_MS = 25000;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const DOC_CONCURRENCY = 3;
/** Если один документ даёт больше кодов — это не список КТРУ, а мусор/ошибка разбора: не пишем. */
const MAX_CODES_PER_DOC = 8000;
const DEFAULT_INDUSTRY = "Не указана";
const REGISTRY_FALLBACK_NAME = "Цифровой объект реестра доверенного ПО";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  // Ошибки PostgREST — обычные объекты ({ message, details, hint, code }), а не Error.
  if (e && typeof e === "object") {
    const o = e as { message?: string; details?: string; code?: string };
    return [o.code, o.message, o.details].filter(Boolean).join(" ") || JSON.stringify(e);
  }
  return String(e);
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; crm-sync)" } });
  } finally {
    clearTimeout(t);
  }
}

/** Три захода: госсайты периодически отдают 503/таймауты. */
async function fetchRetry(url: string): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetchWithTimeout(url);
      if (res.ok) return res;
      last = new Error(`HTTP ${res.status}`);
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw last;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function authorized(req: Request): Promise<boolean> {
  const cronKey = Deno.env.get("NR_SYNC_CRON_SECRET") ?? "";
  if (cronKey && (req.headers.get("x-cron-key") ?? "") === cronKey) return true;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return false;
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anon) return false;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return false;
  const { data: prof } = await userClient.from("profiles").select("role, admin_write").eq("id", user.id).maybeSingle();
  return prof?.role === "admin" && prof?.admin_write !== false;
}

type DocResult = {
  url: string;
  label: string;
  status: "ok" | "empty" | "skipped" | "expired" | "error" | "unchanged";
  found: number;
  added: number;
  error?: string;
  addedCodes?: string[];
};

async function sendTelegram(text: string): Promise<void> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => {});
}

const ymdToDmy = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
/** Запись в таблицу учёта документов: ошибку не глотаем. */
async function saveSource(db: ReturnType<typeof createClient>, row: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("crm_ens_tru_nr_sources").upsert(row);
  if (error) throw error;
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await authorized(req))) return json({ error: "Unauthorized" }, 401);

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const todayYmd = new Date().toISOString().slice(0, 10);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Server config" }, 500);
  const db = createClient(supabaseUrl, serviceKey);

  // 1) Список документов со страницы.
  let links: NrLink[];
  try {
    const res = await fetchRetry(NR_API);
    const data = (await res.json()) as Array<{ description?: string }>;
    links = extractLinks(data.map((d) => d.description ?? "").join("\n"));
  } catch (e) {
    // Сайт недоступен — тихо выходим, следующий запуск по расписанию повторит.
    return json({ ok: false, error: `zakup.gov.kz недоступен: ${errText(e)}` }, 502);
  }
  if (links.length === 0) {
    await sendTelegram("⚠️ Нацизъятие: на странице zakup.gov.kz/nr не найдено ни одной ссылки на файлы — возможно, изменилась вёрстка.");
    return json({ ok: false, error: "no links found" }, 502);
  }

  const { data: known } = await db.from("crm_ens_tru_nr_sources").select("url, content_hash, status");
  const knownByUrl = new Map((known ?? []).map((r: { url: string; content_hash: string | null; status: string }) => [r.url, r]));

  // 2) Каждый документ: скачать, сверить хэш, разобрать, добавить новые коды.
  const results = await mapPool(links, DOC_CONCURRENCY, async (link): Promise<DocResult> => {
    const base = { url: link.url, label: link.label, found: 0, added: 0 };
    try {
      if (/\.pdf(\?|$)/i.test(link.url)) return { ...base, status: "skipped" };
      // Документы постановлений, срок которых (дата + 2 года) уже истёк, не загружаем.
      const active = link.decrees.filter((d) => decreeExpiry(d.date) >= todayYmd);
      if (link.decrees.length > 0 && active.length === 0) {
        if (!dry) await saveSource(db, { url: link.url, label: link.label, status: "expired", processed_at: new Date().toISOString() });
        return { ...base, status: "expired" };
      }
      const latest = active.length > 0 ? active.reduce((a, b) => (a.date >= b.date ? a : b)) : null;
      const validUntil = latest ? ymdToDmy(decreeExpiry(latest.date)) : "";
      const decreeLabel = latest ? `ПП РК №${latest.number} от ${ymdToDmy(latest.date)}` : "";
      // goszakup.gov.kz/pv2/… всё равно редиректит на old.goszakup.gov.kz — идём туда сразу, без лишнего хопа.
      const res = await fetchRetry(encodeURI(decodeURI(link.url)).replace("//goszakup.gov.kz/", "//old.goszakup.gov.kz/"));
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length > MAX_FILE_BYTES) throw new Error("файл слишком большой");

      const hash = await sha256Hex(buf);
      const prev = knownByUrl.get(link.url);
      if (prev && prev.content_hash === hash && (prev.status === "ok" || prev.status === "empty" || prev.status === "skipped")) {
        return { ...base, status: "unchanged" };
      }

      const zipNames = buf[0] === 0x50 && buf[1] === 0x4b ? Array.from(listZip(buf).keys()) : undefined;
      const kind = detectKind(buf, zipNames);
      if (kind === "pdf") {
        if (!dry) await saveSource(db, { url: link.url, label: link.label, content_hash: hash, status: "skipped", processed_at: new Date().toISOString() });
        return { ...base, status: "skipped" };
      }
      if (kind === "ole" || kind === "unknown") throw new Error(`неподдерживаемый формат (${kind})`);

      const rows = await extractRows(buf, kind);
      const isRegistry = rows.some((r) => r.some((c) => /наименование цифрового объекта/i.test(c)));
      const parsed = codesFromRows(rows, isRegistry ? REGISTRY_FALLBACK_NAME : link.label);
      // В реестрах цифровых продуктов в строке лежит название продукта, а не товара — берём общее название.
      const codes = (isRegistry ? parsed.map((p) => ({ ...p, name: REGISTRY_FALLBACK_NAME })) : parsed).map((p) => ({
        ...p,
        industry: p.industry || (isRegistry ? "Программное обеспечение и электроника" : DEFAULT_INDUSTRY),
      }));

      if (codes.length === 0) {
        if (!dry) await saveSource(db, { url: link.url, label: link.label, content_hash: hash, status: "empty", codes_found: 0, codes_added: 0, processed_at: new Date().toISOString() });
        return { ...base, status: "empty" };
      }
      if (codes.length > MAX_CODES_PER_DOC) throw new Error(`подозрительно много кодов (${codes.length})`);

      let addedCodes: string[] = [];
      if (!dry) {
        const basis = `${decreeLabel ? decreeLabel + "; " : ""}${link.label} (${link.url})`.slice(0, 500);
        const payload = codes.map((c) => ({
          code: c.code,
          name: c.name,
          characteristic: "",
          industry: c.industry,
          basis,
          valid_until: validUntil,
        }));
        for (let i = 0; i < payload.length; i += 500) {
          const { data, error } = await db
            .from("crm_ens_tru_national_exemption_codes")
            .upsert(payload.slice(i, i + 500), { onConflict: "code", ignoreDuplicates: true })
            .select("code");
          if (error) throw error;
          addedCodes = addedCodes.concat((data ?? []).map((r: { code: string }) => r.code));
        }
        await saveSource(db, {
          url: link.url,
          label: link.label,
          content_hash: hash,
          status: "ok",
          codes_found: codes.length,
          codes_added: addedCodes.length,
          error: null,
          processed_at: new Date().toISOString(),
        });
      } else {
        const have = new Set<string>();
        for (let i = 0; i < codes.length; i += 200) {
          const { data } = await db
            .from("crm_ens_tru_national_exemption_codes")
            .select("code")
            .in("code", codes.slice(i, i + 200).map((c) => c.code));
          for (const r of data ?? []) have.add((r as { code: string }).code);
        }
        addedCodes = codes.map((c) => c.code).filter((c) => !have.has(c));
      }
      return { ...base, status: "ok", found: codes.length, added: addedCodes.length, addedCodes };
    } catch (e) {
      const msg = errText(e);
      if (!dry) {
        await saveSource(db, { url: link.url, label: link.label, status: "error", error: msg.slice(0, 500), processed_at: new Date().toISOString() }).catch(() => {});
      }
      return { ...base, status: "error", error: msg };
    }
  });

  const totalAdded = results.reduce((s, r) => s + r.added, 0);
  const errors = results.filter((r) => r.status === "error");
  // Ошибки, о которых уже сообщали раньше (документ и в прошлый раз был в статусе error), повторно не шлём.
  const newErrors = errors.filter((r) => knownByUrl.get(r.url)?.status !== "error");

  if (!dry && (totalAdded > 0 || newErrors.length > 0)) {
    const lines: string[] = ["<b>Нацизъятие: обновление справочника</b>"];
    if (totalAdded > 0) {
      lines.push(`Добавлено новых кодов: <b>${totalAdded}</b>`);
      for (const r of results.filter((x) => x.added > 0)) lines.push(`• ${escHtml(r.label)}: +${r.added}`);
    }
    if (newErrors.length > 0) {
      lines.push(`Не удалось разобрать документов: ${newErrors.length} (нужна ручная загрузка)`);
      for (const r of newErrors.slice(0, 5)) lines.push(`• ${escHtml(r.label)} — ${escHtml((r.error ?? "").slice(0, 120))}`);
    }
    await sendTelegram(lines.join("\n"));
  }

  return json({
    ok: true,
    dry,
    documents: results.length,
    added: totalAdded,
    summary: results.map((r) => ({
      label: r.label,
      url: r.url,
      status: r.status,
      found: r.found,
      added: r.added,
      error: r.error,
      addedCodes: dry ? r.addedCodes : undefined,
    })),
  });
});
