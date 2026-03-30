import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Вход
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Email и пароль из Supabase Auth. После первого входа профиль создаётся
        автоматически (роль manager). Админа назначают вручную в таблице{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">profiles</code>.
      </p>
      <LoginForm />
    </div>
  );
}
