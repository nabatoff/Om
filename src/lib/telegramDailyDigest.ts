import type { FullReport } from './crmApi';

function formatDigestDateHeader(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((ymd || '').trim());
  if (!m) return ymd;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function moneyKzt(n: number): string {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return `${new Intl.NumberFormat('ru-RU').format(v)} ₸`;
}

function reportStrength(r: FullReport): number {
  return (
    r.stats.processedTotal +
    r.stats.newInWork +
    r.stats.callsTotal +
    r.stats.validatedTotal +
    r.assignedMeetings.length +
    r.conductedMeetings.length +
    r.confirmedOrders.length
  );
}

export function pickBestReportsPerManagerOnDate(allReports: FullReport[], reportDate: string): FullReport[] {
  const byKey = new Map<string, FullReport>();
  for (const r of allReports) {
    if (r.date !== reportDate) continue;
    const key = (r.manager || '').trim() || '—';
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, r);
      continue;
    }
    const prevScore = reportStrength(prev);
    const curScore = reportStrength(r);
    if (curScore > prevScore) byKey.set(key, r);
    else if (curScore === prevScore && r.id > prev.id) byKey.set(key, r);
  }
  return Array.from(byKey.values()).sort((a, b) => a.manager.localeCompare(b.manager, 'ru'));
}

function normalizeKpiMeetingType(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

function isNewMeetingType(type: string): boolean {
  return normalizeKpiMeetingType(type).startsWith('нов');
}

function normalizeKpiText(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

function normalizeKpiBin(value: string): string {
  return value.replace(/\D/g, '');
}

function countConductedNewMeetings(report: FullReport, allReports: FullReport[]): number {
  const managerNorm = normalizeKpiText(report.manager);
  const targetReports = allReports.filter((r) => normalizeKpiText(r.manager) === managerNorm && r.date >= report.date);
  if (targetReports.length === 0) return 0;
  let count = 0;
  for (const assigned of report.assignedMeetings) {
    if (!isNewMeetingType(assigned.type)) continue;
    const plannedName = normalizeKpiText(assigned.entityName);
    const plannedBin = normalizeKpiBin(assigned.bin);
    const plannedType = normalizeKpiMeetingType(assigned.type);
    const hasEvidence = targetReports.some((lr) =>
      lr.conductedMeetings.some(
        (cm) =>
          normalizeKpiBin(cm.bin) === plannedBin &&
          normalizeKpiText(cm.entityName) === plannedName &&
          normalizeKpiMeetingType(cm.type) === plannedType &&
          cm.date >= assigned.date,
      ),
    );
    if (hasEvidence) count += 1;
  }
  return count;
}

function aggregateConfirmedOrdersByClient(report: FullReport): { displayName: string; total: number }[] {
  const map = new Map<string, { displayName: string; total: number }>();
  for (const o of report.confirmedOrders) {
    const bin = normalizeKpiBin(o.bin);
    const rawName = (o.entityName || '').trim();
    const displayName = rawName || `БИН ${(o.bin || '').trim() || '—'}`;
    const key = `${bin}|${normalizeKpiText(displayName)}`;
    const add = Number(o.totalAmount) || 0;
    const prev = map.get(key);
    if (prev) prev.total += add;
    else map.set(key, { displayName, total: add });
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

/**
 * Текст сводки за день по всем менеджерам (для Telegram / webhook).
 * Подписи: назначено встреч, факт проведено, проведено новых, сумма подтверждённых заказов + разбивка по контрагентам.
 */
export function buildTelegramDailyDigestText(allReports: FullReport[], reportDate: string): string {
  const header = `Сводка за ${formatDigestDateHeader(reportDate)}`;
  const rows = pickBestReportsPerManagerOnDate(allReports, reportDate);
  if (rows.length === 0) {
    return `${header}\n\nНет сохранённых отчётов за эту дату.`;
  }

  const blocks: string[] = [header, ''];
  for (const r of rows) {
    const mgr = (r.manager || '').trim() || '—';
    const assigned = r.assignedMeetings.length;
    const conductedFact = r.conductedMeetings.length;
    const conductedNew = countConductedNewMeetings(r, allReports);
    const ordersSum = r.confirmedOrders.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
    const clients = aggregateConfirmedOrdersByClient(r);

    blocks.push(mgr);
    blocks.push(`• Назначено встреч: ${assigned}`);
    blocks.push(`• Факт проведено: ${conductedFact}`);
    blocks.push(`• Проведено новых: ${conductedNew}`);
    blocks.push(`• Сумма подтверждённых заказов: ${moneyKzt(ordersSum)}`);
    if (clients.length > 0) {
      blocks.push('Подтверждённые заказы по контрагентам:');
      for (const c of clients) {
        blocks.push(`  — ${c.displayName}: ${moneyKzt(c.total)}`);
      }
    } else {
      blocks.push('Подтверждённые заказы по контрагентам: нет');
    }
    blocks.push('');
  }
  return blocks.join('\n').trimEnd();
}

/** POST JSON `{ text }` на URL из VITE_TELEGRAM_REPORT_WEBHOOK_URL (например Make/n8n → Telegram). */
export async function postTelegramDailyDigestIfConfigured(allReports: FullReport[], reportDate: string): Promise<void> {
  const url = (import.meta.env.VITE_TELEGRAM_REPORT_WEBHOOK_URL ?? '').trim();
  if (!url) return;
  const text = buildTelegramDailyDigestText(allReports, reportDate);
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}
