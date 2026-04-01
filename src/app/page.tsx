import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";

export default async function Home() {
  const user = await getSessionUser();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        CRM отдела продаж
      </h1>
      <p className="text-muted-foreground">
        Next.js, Tailwind, Supabase: ежедневные отчеты, реестр клиентов, RLS
        по ролям.
      </p>
      <div className="flex flex-wrap gap-3">
        {user ? (
          <Button asChild>
            <Link href="/dashboard">Дашборд</Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href="/login">Войти</Link>
          </Button>
        )}
        {user && (
          <Button variant="outline" asChild>
            <Link href="/suppliers">Клиенты</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
