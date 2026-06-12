import type { UiOrder } from './crmApi';
import { orderLineAmounts } from './commission';

export type OrderRow = UiOrder & { manager: string; date: string; reportId: string };

export type GroupedCounterpartyOrder = {
  bin: string;
  entityName: string;
  date: string;
  manager: string;
  viaEntityName: string;
  viaBin: string;
  orderCount: number;
  totalAmount: number;
  amounts: number[];
  sourceOrders: OrderRow[];
};

function normalizeBin(value: string): string {
  return value.replace(/\D/g, '');
}

export function groupOrdersByCounterparty(orders: OrderRow[]): GroupedCounterpartyOrder[] {
  const map = new Map<
    string,
    {
      bin: string;
      entityName: string;
      date: string;
      managers: Set<string>;
      orderCount: number;
      totalAmount: number;
      amounts: number[];
      sourceOrders: OrderRow[];
    }
  >();

  for (const o of orders) {
    const binKey = normalizeBin(o.bin);
    const key = binKey || `name:${o.entityName.trim().toLowerCase()}`;
    const prev = map.get(key);

    if (prev) {
      prev.orderCount += Number(o.orderCount) || 0;
      prev.totalAmount += Number(o.totalAmount) || 0;
      prev.amounts.push(...orderLineAmounts(o.amounts, o.totalAmount));
      prev.sourceOrders.push(o);
      prev.managers.add(o.manager);
      if (o.date > prev.date) prev.date = o.date;
      if (!prev.entityName.trim() && o.entityName.trim()) prev.entityName = o.entityName;
    } else {
      map.set(key, {
        bin: o.bin,
        entityName: o.entityName,
        date: o.date,
        managers: new Set([o.manager]),
        orderCount: Number(o.orderCount) || 0,
        totalAmount: Number(o.totalAmount) || 0,
        amounts: [...orderLineAmounts(o.amounts, o.totalAmount)],
        sourceOrders: [o],
      });
    }
  }

  const grouped: GroupedCounterpartyOrder[] = [];
  for (const acc of map.values()) {
    grouped.push({
      bin: acc.bin,
      entityName: acc.entityName,
      date: acc.date,
      manager: acc.managers.size === 1 ? [...acc.managers][0] : 'Несколько',
      viaEntityName: '',
      viaBin: '',
      orderCount: acc.orderCount,
      totalAmount: acc.totalAmount,
      amounts: acc.amounts,
      sourceOrders: acc.sourceOrders,
    });
  }

  return grouped.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return a.entityName.localeCompare(b.entityName, 'ru');
  });
}
