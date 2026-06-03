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

/** Комиссия для отображения: по строкам amounts[] при наличии снимка MRP. */
export function resolveOrderCommissionDisplay(order: {
  amounts: number[];
  totalAmount: number;
  isKtpApplied?: boolean | null;
  mrpKztApplied?: number | null;
  commissionAmount?: number | null;
}): { lines: number[]; total: number | null } {
  const mrp = order.mrpKztApplied;
  if (mrp == null || Number.isNaN(Number(mrp))) {
    if (order.commissionAmount == null) return { lines: [], total: null };
    return { lines: [], total: order.commissionAmount };
  }
  const isKtp = Boolean(order.isKtpApplied);
  const items = orderLineAmounts(order.amounts, order.totalAmount);
  const { lines, total } = calculateOrderLinesCommission(order.amounts, order.totalAmount, isKtp, mrp);
  if (items.length === 0) return { lines: [], total: order.commissionAmount ?? null };
  return { lines, total };
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
