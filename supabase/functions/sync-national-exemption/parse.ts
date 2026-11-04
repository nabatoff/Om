/**
 * Разбор документов со списками кодов ЕНС ТРУ (xlsx, docx, «xls» в виде HTML) без внешних библиотек:
 * zip распаковывается через DecompressionStream, таблицы вытаскиваются регулярками из XML.
 */

export const CODE_RE = /\d{6}\.\d{3}\.\d{6}/g;

export type DocKind = "xlsx" | "docx" | "html" | "ole" | "pdf" | "unknown";

export type ParsedCode = { code: string; name: string };

const dec = new TextDecoder("utf-8");

export function detectKind(bytes: Uint8Array, zipNames?: string[]): DocKind {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    if (zipNames?.some((n) => n === "word/document.xml")) return "docx";
    if (zipNames?.some((n) => n.startsWith("xl/"))) return "xlsx";
    return "unknown";
  }
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return "ole";
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  const head = dec.decode(bytes.slice(0, 400)).toLowerCase();
  if (head.includes("<html") || head.includes("<table") || head.includes("<?xml")) return "html";
  return "unknown";
}

type ZipEntry = { name: string; method: number; compSize: number; offset: number };

export function listZip(bytes: Uint8Array): Map<string, ZipEntry> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const compSize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.slice(p + 46, p + 46 + nameLen));
    out.set(name, { name, method, compSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export async function readZipText(bytes: Uint8Array, e: ZipEntry): Promise<string> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nameLen = v.getUint16(e.offset + 26, true);
  const extraLen = v.getUint16(e.offset + 28, true);
  const start = e.offset + 30 + nameLen + extraLen;
  const data = bytes.slice(start, start + e.compSize);
  if (e.method === 0) return dec.decode(data);
  if (e.method !== 8) throw new Error(`zip method ${e.method}`);
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return dec.decode(await new Response(stream).arrayBuffer());
}

function xmlDecode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

function cleanCell(s: string): string {
  return xmlDecode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function rowsFromDocx(xml: string): string[][] {
  const rows: string[][] = [];
  for (const tr of xml.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []) {
    const cells = (tr.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) ?? []).map((tc) =>
      cleanCell((tc.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) ?? []).join(" "))
    );
    rows.push(cells);
  }
  // Коды вне таблиц (в обычных абзацах) — отдельными «строками».
  const outside = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, " ");
  for (const p of outside.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    const text = cleanCell(p);
    if (CODE_RE.test(text)) rows.push([text]);
    CODE_RE.lastIndex = 0;
  }
  return rows;
}

function rowsFromXlsx(sharedXml: string, sheets: string[]): string[][] {
  const shared = (sharedXml.match(/<si>[\s\S]*?<\/si>/g) ?? []).map((si) =>
    cleanCell((si.match(/<t[^>]*>[^<]*<\/t>/g) ?? []).join(""))
  );
  const rows: string[][] = [];
  for (const xml of sheets) {
    for (const row of xml.match(/<row[ >][\s\S]*?<\/row>/g) ?? []) {
      const cells: string[] = [];
      for (const c of row.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        const t = /\bt="([^"]*)"/.exec(c)?.[1];
        const v = /<v>([\s\S]*?)<\/v>/.exec(c)?.[1];
        if (t === "s" && v != null) cells.push(shared[Number(v)] ?? "");
        else if (t === "inlineStr") cells.push(cleanCell((c.match(/<t[^>]*>[^<]*<\/t>/g) ?? []).join("")));
        else cells.push(v != null ? cleanCell(v) : "");
      }
      rows.push(cells);
    }
  }
  return rows;
}

function rowsFromHtml(html: string): string[][] {
  const rows: string[][] = [];
  for (const tr of html.match(/<tr[ >][\s\S]*?<\/tr>/gi) ?? []) {
    rows.push((tr.match(/<t[dh][ >][\s\S]*?<\/t[dh]>/gi) ?? []).map(cleanCell));
  }
  const outside = html.replace(/<table[\s\S]*?<\/table>/gi, " ");
  for (const m of outside.match(CODE_RE) ?? []) rows.push([m]);
  return rows;
}

export async function extractRows(bytes: Uint8Array, kind: DocKind): Promise<string[][]> {
  if (kind === "html") return rowsFromHtml(dec.decode(bytes));
  const zip = listZip(bytes);
  if (kind === "docx") {
    const e = zip.get("word/document.xml");
    if (!e) throw new Error("no word/document.xml");
    return rowsFromDocx(await readZipText(bytes, e));
  }
  if (kind === "xlsx") {
    const shared = zip.get("xl/sharedStrings.xml");
    const sheets: string[] = [];
    for (const [name, e] of zip) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) sheets.push(await readZipText(bytes, e));
    }
    return rowsFromXlsx(shared ? await readZipText(bytes, shared) : "", sheets);
  }
  throw new Error(`unsupported kind ${kind}`);
}

/** «п рограммное» → «Программное»: в некоторых docx первая буква отделена пробелом. */
function fixName(s: string): string {
  const n = s.replace(/\s+/g, " ").trim().replace(/^(\S) (\S)/, "$1$2");
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function looksLikeName(c: string): boolean {
  if (c.length < 3 || c.length > 120) return false;
  if (!/[A-Za-zА-Яа-яЁё]{3}/.test(c)) return false;
  if (/\d{6}\.\d{3}\.\d{6}/.test(c)) return false;
  // Заголовки и служебные ячейки.
  if (/^(№|п\/п|наименование|код |енс|тн вэд|кп вэд)/i.test(c)) return false;
  return true;
}

/**
 * Строки с кодами → коды с названиями. Название — первая подходящая ячейка той же строки;
 * если в строке нет «короткого» названия (реестры цифровых продуктов, где в строке длинные описания),
 * подставляется `fallbackName`.
 */
export function codesFromRows(rows: string[][], fallbackName: string): ParsedCode[] {
  const out = new Map<string, string>();
  for (const cells of rows) {
    const codes = new Set<string>();
    for (const c of cells) for (const m of c.match(CODE_RE) ?? []) codes.add(m);
    if (codes.size === 0) continue;
    const name = cells.find(looksLikeName);
    const label = name ? fixName(name) : fallbackName;
    for (const code of codes) if (!out.has(code)) out.set(code, label);
  }
  return Array.from(out, ([code, name]) => ({ code, name }));
}

export type NrDecree = { id: string; date: string; number: string };
export type NrLink = { url: string; label: string; decrees: NrDecree[] };

const MONTHS: Record<string, string> = {
  января: "01", февраля: "02", марта: "03", апреля: "04", мая: "05", июня: "06",
  июля: "07", августа: "08", сентября: "09", октября: "10", ноября: "11", декабря: "12",
};

/** «… от 4 марта 2026 года № 149» → { date: "2026-03-04", number: "149" }. */
export function parseDecreeText(text: string): { date: string; number: string } | null {
  const m = /от\s+(\d{1,2})\s+([а-яё]+)\s+(\d{4})\s*года(?:\s*№\s*(\d+))?/i.exec(text);
  if (!m) return null;
  const mm = MONTHS[m[2].toLowerCase()];
  if (!mm) return null;
  return { date: `${m[3]}-${mm}-${m[1].padStart(2, "0")}`, number: m[4] ?? "" };
}

/**
 * Ссылки на файлы goszakup.gov.kz/pv2/… из HTML-описания страницы «Национальный режим» вместе с постановлениями,
 * под которыми они лежат (ссылка на adilet.zan.kz с датой «от … года» открывает новый блок). Один и тот же файл
 * может стоять под несколькими постановлениями — тогда у него несколько `decrees`.
 */
export function extractLinks(html: string): NrLink[] {
  const out = new Map<string, NrLink>();
  let decree: NrDecree | null = null;
  for (const m of html.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = xmlDecode(m[1]).trim();
    const text = cleanCell(m[2]);
    if (/adilet\.zan\.kz\/rus\/docs\/P\d+/i.test(href)) {
      const d = parseDecreeText(text);
      if (d) decree = { id: /P\d+/i.exec(href)![0], ...d };
      continue;
    }
    const url = href.replace(/^http:\/\//i, "https://").replace(/\)$/, "");
    if (!/^https:\/\/(old\.)?goszakup\.gov\.kz\/pv2\//i.test(url)) continue;
    // Одинаковые файлы бывают под www/old: ключ — путь после /pv2/.
    const key = url.replace(/^https:\/\/(old\.)?goszakup\.gov\.kz/i, "").toLowerCase();
    const cur = out.get(key) ?? { url, label: text || url.split("/").pop() || url, decrees: [] };
    if (decree && !cur.decrees.some((d) => d.id === decree!.id)) cur.decrees.push(decree);
    out.set(key, cur);
  }
  return Array.from(out.values());
}

/** Изъятие вводится не более чем на два года с даты постановления. */
export function decreeExpiry(dateYmd: string): string {
  return `${Number(dateYmd.slice(0, 4)) + 2}${dateYmd.slice(4)}`;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
