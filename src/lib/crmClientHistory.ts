import type { FullReport, UiConducted, UiOrder } from './crmApi';

export type ClientConductedRow = UiConducted & { reportDate: string; manager: string };
export type ClientOrderRow = UiOrder & { reportDate: string; manager: string };

export function buildClientCrmHistory(
  clientBin: string,
  reports: FullReport[],
): { conducted: ClientConductedRow[]; orders: ClientOrderRow[] } {
  const bin = String(clientBin).trim();
  const conducted: ClientConductedRow[] = [];
  const orders: ClientOrderRow[] = [];
  for (const r of reports) {
    for (const m of r.conductedMeetings) {
      if (String(m.bin).trim() === bin) {
        conducted.push({ ...m, reportDate: r.date, manager: r.manager });
      }
    }
    for (const o of r.confirmedOrders) {
      if (String(o.bin).trim() === bin) {
        orders.push({ ...o, reportDate: r.date, manager: r.manager });
      }
    }
  }
  const byReportDate = (a: { reportDate: string }, b: { reportDate: string }) => b.reportDate.localeCompare(a.reportDate);
  conducted.sort(byReportDate);
  orders.sort(byReportDate);
  return { conducted, orders };
}
