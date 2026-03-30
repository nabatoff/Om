import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Вход</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Email и пароль из Supabase Auth. Профиль создаётся автоматически (роль
        manager). Админа назначают в таблице{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">profiles</code>.
      </p>
      <LoginForm />
    </div>
  );
}
