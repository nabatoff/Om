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
