/** Парсеры HTML goszakup.gov.kz (реестр + карточка). */

export type GoszakupListRow = {
  id: string;
  contractNumber: string;
  buyNumber: string;
  contractType: string;
  status: string;
  createdAt: string;
  customer: string;
  supplier: string;
  tradeMethod: string;
};

export function parseMoney(raw: string): number | null {
  const cleaned = raw
    .replace(/&nbsp;|&#160;|&#xA0;/gi, '')
    .replace(/\s/g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function sliceAround(hay: string, needle: string, before = 0, after = 400): string {
  const i = hay.indexOf(needle);
  if (i < 0) {
    const i2 = hay.toLowerCase().indexOf(needle.toLowerCase());
    if (i2 < 0) return '';
    return hay.slice(Math.max(0, i2 - before), Math.min(hay.length, i2 + needle.length + after));
  }
  return hay.slice(Math.max(0, i - before), Math.min(hay.length, i + needle.length + after));
}

function extractTableBody(html: string): string | null {
  const idIdx = html.search(/id=["']search-result["']/i);
  if (idIdx < 0) return null;
  const from = html.indexOf('<tbody', idIdx);
  if (from < 0) return null;
  const openEnd = html.indexOf('>', from);
  if (openEnd < 0) return null;
  const close = html.indexOf('</tbody>', openEnd);
  if (close < 0) return null;
  return html.slice(openEnd + 1, close);
}

function stripCell(td: string): string {
  return td
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseListRows(html: string): GoszakupListRow[] {
  const body = extractTableBody(html);
  if (!body) return [];
  const trs = body.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  const out: GoszakupListRow[] = [];

  for (const tr of trs) {
    const tds = tr.match(/<td[\s\S]*?<\/td>/gi) ?? [];
    if (tds.length < 10) continue;
    const cells = tds.map(stripCell);
    const href = tds[1]?.match(/\/show\/(\d+)/)?.[1] ?? '';
    const id = cells[0] || href;
    if (!id) continue;
    out.push({
      id,
      contractNumber: cells[1] ?? '',
      buyNumber: cells[2] ?? '',
      contractType: cells[3] ?? '',
      status: cells[4] ?? '',
      createdAt: cells[5] ?? '',
      customer: cells[7] ?? '',
      supplier: cells[8] ?? '',
      tradeMethod: cells[9] ?? '',
    });
  }
  return out;
}

export function parseListRange(html: string): { from: number; to: number; total: number } | null {
  const chunk = sliceAround(html, 'Показано', 0, 100) || html.slice(0, 50_000);
  const m =
    chunk.match(/Показано\s+c\s+(\d+)\s+по\s+(\d+)\s+из\s+(\d+)/i) ??
    chunk.match(/Показано\s+с\s+(\d+)\s+по\s+(\d+)\s+из\s+(\d+)/i);
  if (!m) return null;
  return { from: Number(m[1]), to: Number(m[2]), total: Number(m[3]) };
}

export function parseDetailSums(html: string): { planSum: number | null; finalSum: number | null } {
  const grab = (label: string): number | null => {
    const chunk = sliceAround(html, label, 0, 400);
    if (!chunk) return null;
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m =
      chunk.match(new RegExp(`${escaped}\\s*<\\/td>\\s*<td[^>]*>\\s*([^<]+)\\s*<\\/td>`, 'i')) ??
      chunk.match(/<\/td>\s*<td[^>]*>\s*([^<]+)\s*<\/td>/i);
    return m ? parseMoney(m[1]) : null;
  };
  return {
    planSum: grab('Общая плановая сумма договора'),
    finalSum: grab('Общая итоговая сумма договора'),
  };
}

/** Пустой шаблон карточки без сумм (архив / нет публичных данных) */
export function isEmptyDetailShell(html: string): boolean {
  if (html.includes('{subject_count}')) return true;
  const hasPlan = html.includes('Общая плановая сумма договора');
  const hasFinal = html.includes('Общая итоговая сумма договора');
  return !hasPlan && !hasFinal && html.length < 28_000;
}
