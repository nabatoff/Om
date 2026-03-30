import Link from "next/link";
import { getSessionUser } from "@/lib/auth";

export default async function Home() {
  const user = await getSessionUser();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-16">
      <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
        CRM отдела продаж
      </h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Next.js, Tailwind, Supabase: ежедневные отчёты, реестр поставщиков, RLS по
        ролям.
      </p>
      <div className="flex flex-wrap gap-3">
        {user ? (
          <Link
            href="/dashboard"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Дашборд
          </Link>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Войти
          </Link>
        )}
        {user && (
          <Link
            href="/suppliers"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
          >
            Поставщики
          </Link>
        )}
      </div>
    </div>
  );
}
