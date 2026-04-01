"use client";

import { useState } from "react";
import { toast } from "sonner";
import { upsertClientMonthMetric } from "@/app/actions/suppliers";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Tables } from "@/types/database";

type Client = Tables<"clients">;
type ClientMonthMetric = Tables<"client_month_metrics">;

type Props = {
  suppliers: Client[];
  currentMonth: string;
  nextMonth: string;
  monthMetrics: ClientMonthMetric[];
};

export function SuppliersTable({ suppliers, currentMonth, nextMonth, monthMetrics }: Props) {
  const [localMetrics, setLocalMetrics] = useState(monthMetrics);

  if (suppliers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Клиентов пока нет. Добавьте карточку формой выше.
      </p>
    );
  }

  function readMetric(clientId: string, month: string) {
    return localMetrics.find((m) => m.client_id === clientId && m.month === month);
  }

  async function saveMetric(clientId: string, month: string, delivered: number, potential: number) {
    const res = await upsertClientMonthMetric({
      client_id: clientId,
      month,
      delivered_amount: delivered,
      potential_amount: potential,
    });
    if (!res.ok) {
      toast.error("Не удалось сохранить метрику", { description: res.error });
      return;
    }
    toast.success("Месячная метрика сохранена");
    setLocalMetrics((prev) => {
      const filtered = prev.filter((m) => !(m.client_id === clientId && m.month === month));
      return [
        ...filtered,
        {
          id: crypto.randomUUID(),
          client_id: clientId,
          month,
          delivered_amount: delivered,
          potential_amount: potential,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
    });
  }

  return (
    <div className="rounded-xl border border-border/80 bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Компания</TableHead>
            <TableHead>БИН</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Поставлено ({currentMonth.slice(0, 7)})</TableHead>
            <TableHead>Потенциал ({currentMonth.slice(0, 7)})</TableHead>
            <TableHead>Потенциал ({nextMonth.slice(0, 7)})</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {suppliers.map((client) => {
            const cur = readMetric(client.id, currentMonth);
            const next = readMetric(client.id, nextMonth);
            return (
              <TableRow key={client.id}>
                <TableCell className="font-medium">{client.company_name}</TableCell>
                <TableCell>{client.bin}</TableCell>
                <TableCell>{client.sku_count}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    defaultValue={cur?.delivered_amount ?? 0}
                    onBlur={(e) =>
                      void saveMetric(
                        client.id,
                        currentMonth,
                        Number(e.target.value) || 0,
                        cur?.potential_amount ?? 0,
                      )
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    defaultValue={cur?.potential_amount ?? 0}
                    onBlur={(e) =>
                      void saveMetric(
                        client.id,
                        currentMonth,
                        cur?.delivered_amount ?? 0,
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    defaultValue={next?.potential_amount ?? 0}
                    onBlur={(e) =>
                      void saveMetric(
                        client.id,
                        nextMonth,
                        next?.delivered_amount ?? 0,
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
