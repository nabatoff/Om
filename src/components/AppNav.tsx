import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import type { ProfileRow } from "@/lib/auth";

type Props = {
  profile: ProfileRow | null;
};

export function AppNav({ profile }: Props) {
  if (!profile) {
    return (
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-semibold text-zinc-900 dark:text-zinc-100">
            Sales CRM
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Войти
          </Link>
        </div>
      </header>
    );
  }

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <nav className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/dashboard" className="font-semibold text-zinc-900 dark:text-zinc-100">
            Sales CRM
          </Link>
          <Link
            href="/dashboard"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Дашборд
          </Link>
          <Link
            href="/suppliers"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Поставщики
          </Link>
          {profile.role === "admin" && (
            <Link
              href="/admin"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Админ
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {profile.full_name || "Без имени"} · {profile.role}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
            >
              Выйти
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
