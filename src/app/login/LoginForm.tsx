"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) {
      setError("Нет настроек Supabase в .env.local");
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    if (mode === "signup") {
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
        },
      });
      setLoading(false);
      if (err) {
        setError(err.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
      return;
    }
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  if (!isSupabaseConfigured()) {
    return (
      <Card className="mt-6 border-amber-500/30 bg-amber-500/5 shadow-sm">
        <CardContent className="pt-6 text-sm">
          <p className="font-medium text-foreground">Не заданы переменные Supabase</p>
          <p className="text-muted-foreground mt-2">
            Скопируй <code className="rounded bg-muted px-1">.env.example</code> в{" "}
            <code className="rounded bg-muted px-1">.env.local</code> и заполни{" "}
            <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_URL</code> и{" "}
            <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
            из{" "}
            <a
              className="text-primary underline"
              href="https://supabase.com/dashboard/project/_/settings/api"
              target="_blank"
              rel="noreferrer"
            >
              Settings → API
            </a>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6 border-border/80 shadow-sm">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === "signin" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setMode("signin")}
            >
              Вход
            </Button>
            <Button
              type="button"
              variant={mode === "signup" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setMode("signup")}
            >
              Регистрация
            </Button>
          </div>
          {mode === "signup" && (
            <div className="grid gap-2">
              <Label htmlFor="full_name">ФИО</Label>
              <Input
                id="full_name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading
              ? "…"
              : mode === "signup"
                ? "Зарегистрироваться"
                : "Войти"}
          </Button>
          <Button variant="link" asChild className="text-muted-foreground">
            <Link href="/">На главную</Link>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
