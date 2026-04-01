import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDashboardCards } from "@/app/actions/dashboard-metrics";
import { requireAdmin } from "@/lib/auth";

export default async function AdminPage() {
  await requireAdmin();
  const cards = await getDashboardCards();

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Админ: аналитика</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          KPI по новой normalized-схеме.
        </p>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Поставщики 10млн+</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{cards?.suppliers10mCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Поставщики SKU 100+</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{cards?.suppliersSku100Count ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>План 10млн+ (%)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{cards?.plan10mPercent ?? 0}%</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>План SKU 100+ (%)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{cards?.planSku100Percent ?? 0}%</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-muted-foreground">Формула: count / 5 * 100</p></CardContent>
        </Card>
      </section>
    </div>
  );
}
