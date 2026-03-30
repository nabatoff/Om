/** Mon–Fri count from ref (inclusive) through end of that calendar month (inclusive). Mirrors SQL working_days_remaining_in_month. */
export function workingDaysRemainingInMonth(isoRef: string): number {
  const [y, m, d] = isoRef.split("-").map(Number);
  const ref = new Date(y, m - 1, d);
  const last = new Date(y, m, 0);
  let n = 0;
  for (
    let cur = new Date(ref);
    cur <= last;
    cur.setDate(cur.getDate() + 1)
  ) {
    const wd = cur.getDay();
    if (wd >= 1 && wd <= 5) n++;
  }
  return n;
}

export function monthStartISO(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/** Sum calls in month of isoRef for rows strictly before isoRef (same month). */
export function sumCallsBeforeDateInMonth(
  rows: { report_date: string; calls_count: number }[],
  isoRef: string,
): number {
  const start = monthStartISO(isoRef);
  let s = 0;
  for (const r of rows) {
    if (r.report_date >= start && r.report_date < isoRef) {
      s += r.calls_count;
    }
  }
  return s;
}

const G5_BASE = 22;
const G5_BONUS = 12;

/** G5: if gep_done > 2 then daily cap 12 else 22. Combined with rolling monthly pace. */
export function todaysCallsTarget(params: {
  monthlyCallsTarget: number;
  sumCallsBeforeThisDayInMonth: number;
  workingDaysRemaining: number;
  gepDone: number;
}): number {
  const { monthlyCallsTarget, sumCallsBeforeThisDayInMonth, workingDaysRemaining, gepDone } =
    params;
  const rem = monthlyCallsTarget - sumCallsBeforeThisDayInMonth;
  const denom = Math.max(workingDaysRemaining, 1);
  const rolling = rem / denom;
  const g5 = gepDone > 2 ? G5_BONUS : G5_BASE;
  const raw = Math.min(rolling, g5);
  return Math.max(0, Math.ceil(raw));
}

export function isReadyForQualification(s: {
  nkt_member: boolean;
  kz_quality_mark: boolean;
  sku_count: number;
}): boolean {
  return s.nkt_member && s.kz_quality_mark && s.sku_count > 0;
}
