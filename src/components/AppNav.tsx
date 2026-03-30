import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import type { ProfileRow } from "@/lib/auth";

type Props = {
  profile: ProfileRow | null;
};

const navLink =
  "text-sm text-muted-foreground transition-colors hover:text-foreground";

export function AppNav({ profile }: Props) {
  if (!profile) {
    return (
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            Sales CRM
          </Link>
          <Button asChild size="sm">
            <Link href="/login">Войти</Link>
          </Button>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <nav className="flex flex-wrap items-center gap-6">
          <Link
            href="/dashboard"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            Sales CRM
          </Link>
          <Link href="/dashboard" className={navLink}>
            Дашборд
          </Link>
          <Link href="/suppliers" className={navLink}>
            Поставщики
          </Link>
          {profile.role === "admin" && (
            <Link href="/admin" className={navLink}>
              Админ
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {profile.full_name || "Без имени"} · {profile.role}
          </span>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Выйти
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
