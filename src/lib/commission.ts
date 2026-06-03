export type CommissionThresholds = {
  mrp: number;
  tier1NonKtpMax: number;
  tier1KtpMax: number;
  fixedCommission: number;
  maxOrderAmount: number;
};

export function getCommissionThresholds(mrp: number): CommissionThresholds {
  const m = Math.max(1, Math.floor(Number(mrp) || 0));
  const tier1NonKtpMax = 800 * m;
  return {
    mrp: m,
    tier1NonKtpMax,
    tier1KtpMax: Math.round((tier1NonKtpMax * 5) / 3),
    fixedCommission: 40 * m,
    maxOrderAmount: 4000 * m,
  };
}

export function calculateCommission(amount: number, isKtp: boolean, mrp: number): number {
  const total = Math.max(0, Number(amount) || 0);
  const t = getCommissionThresholds(mrp);
  if (isKtp) {
    if (total <= t.tier1KtpMax) return Math.round(total * 0.03);
    return t.fixedCommission;
  }
  if (total <= t.tier1NonKtpMax) return Math.round(total * 0.05);
  return t.fixedCommission;
}

export type OrderAmountValidation =
  | { ok: true }
  | { ok: false; message: string };

export function validateOrderAmount(amount: number, mrp: number): OrderAmountValidation {
  const total = Math.max(0, Number(amount) || 0);
  const t = getCommissionThresholds(mrp);
  if (total > t.maxOrderAmount) {
    return {
      ok: false,
      message: `Сумма заказа не может превышать ${t.maxOrderAmount.toLocaleString('ru-RU')} ₸ (4000 МРП)`,
    };
  }
  return { ok: true };
}

export function formatMoneyKzt(n: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n));
}

/** Суммы по каждой строке заказа (amounts); если пусто — одна строка = totalAmount. */
export function orderLineAmounts(amounts: number[], totalAmount: number): number[] {
  const lines = amounts.map((a) => Math.max(0, Number(a) || 0)).filter((a) => a > 0);
  if (lines.length > 0) return lines;
  const total = Math.max(0, Number(totalAmount) || 0);
  return total > 0 ? [total] : [];
}

export function calculateOrderLinesCommission(
  amounts: number[],
  totalAmount: number,
  isKtp: boolean,
  mrp: number,
): { lines: number[]; total: number } {
  const items = orderLineAmounts(amounts, totalAmount);
  const lines = items.map((amt) => calculateCommission(amt, isKtp, mrp));
  return { lines, total: lines.reduce((s, n) => s + n, 0) };
}

export function calculateOrderCommission(
  order: OrderCommissionFields,
  mrp: number,
  clientKtpByBin?: ReadonlyMap<string, boolean>,
): { lines: number[]; total: number } {
  const isKtp = isKtpForOrderCommission(order, clientKtpByBin);
  return calculateOrderLinesCommission(order.amounts, order.totalAmount, isKtp, mrp);
}

export type OrderCommissionFields = {
  amounts: number[];
  totalAmount: number;
  bin?: string;
  viaBin?: string;
  isKtpApplied?: boolean | null;
  mrpKztApplied?: number | null;
  commissionAmount?: number | null;
};

/** БИН, по которому берётся КТП: via_bin (12 цифр), иначе контрагент. */
export function commissionKtpBin(bin: string, viaBin?: string): string {
  const via = String(viaBin ?? '').replace(/\D/g, '');
  if (via.length === 12) return via;
  return String(bin ?? '').replace(/\D/g, '');
}

export function buildClientKtpMap(
  clients: ReadonlyArray<{ bin: string; isKtp?: boolean }>,
): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const c of clients) {
    const b = c.bin.trim();
    if (b) m.set(b, Boolean(c.isKtp));
  }
  return m;
}

/** КТП для расчёта комиссии: снимок при сохранении или справочник по via/контрагенту. */
export function isKtpForOrderCommission(
  order: OrderCommissionFields,
  clientKtpByBin?: ReadonlyMap<string, boolean>,
): boolean {
  if (
    order.isKtpApplied != null &&
    (order.commissionAmount != null || order.mrpKztApplied != null)
  ) {
    return Boolean(order.isKtpApplied);
  }
  const key = commissionKtpBin(order.bin ?? '', order.viaBin);
  if (key.length === 12 && clientKtpByBin) return clientKtpByBin.get(key) ?? false;
  return Boolean(order.isKtpApplied);
}

/** Итоговая комиссия по записи: сначала снимок из БД, иначе расчёт по строкам amounts[]. */
export function resolveOrderCommissionTotal(
  order: OrderCommissionFields,
  clientKtpByBin?: ReadonlyMap<string, boolean>,
): number | null {
  const stored = order.commissionAmount;
  if (stored != null && !Number.isNaN(Number(stored))) return Number(stored);

  const mrp = order.mrpKztApplied;
  if (mrp == null || Number.isNaN(Number(mrp))) return null;
  if (orderLineAmounts(order.amounts, order.totalAmount).length === 0) return null;

  return calculateOrderCommission(order, Number(mrp), clientKtpByBin).total;
}

/** Сколько отдельных заказов (№1, №2…) без комиссии в одной записи таблицы. */
export function countOrderLinesWithoutCommission(
  order: OrderCommissionFields,
  clientKtpByBin?: ReadonlyMap<string, boolean>,
): number {
  if (resolveOrderCommissionTotal(order, clientKtpByBin) != null) return 0;
  return orderLineAmounts(order.amounts, order.totalAmount).length;
}

/** Комиссия для модалки: построчно при снимке MRP + итог. */
export function resolveOrderCommissionDisplay(
  order: OrderCommissionFields,
  clientKtpByBin?: ReadonlyMap<string, boolean>,
): { lines: number[]; total: number | null } {
  const total = resolveOrderCommissionTotal(order, clientKtpByBin);
  const mrp = order.mrpKztApplied;
  const items = orderLineAmounts(order.amounts, order.totalAmount);

  if (mrp != null && !Number.isNaN(Number(mrp)) && items.length > 0) {
    const { lines } = calculateOrderCommission(order, Number(mrp), clientKtpByBin);
    return { lines, total };
  }

  return { lines: [], total };
}

export function validateOrderLinesAmount(
  amounts: number[],
  totalAmount: number,
  mrp: number,
): OrderAmountValidation {
  const items = orderLineAmounts(amounts, totalAmount);
  for (let i = 0; i < items.length; i++) {
    const v = validateOrderAmount(items[i], mrp);
    if (!v.ok) {
      return {
        ok: false,
        message: `Заказ №${i + 1}: ${v.message}`,
      };
    }
  }
  return { ok: true };
}
