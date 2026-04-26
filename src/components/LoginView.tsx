import { useState } from 'react';
import { LogIn, ShieldCheck, Fingerprint } from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import { isValidStaffCode, staffCodeToEmail } from '../lib/staffAuth';

export function LoginView() {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!isValidStaffCode(code)) {
      setErr('Код: 2–32 символа, латиница, цифры, подчёркивание _');
      return;
    }
    setPending(true);
    try {
      let email: string;
      try {
        email = staffCodeToEmail(code);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Неверный код');
        return;
      }
      const { error } = await getSupabase().auth.signInWithPassword({ email, password });
      if (error) setErr(error.message === 'Invalid login credentials' ? 'Неверный код или пароль' : error.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-10 justify-center text-blue-400">
          <div className="p-3 bg-blue-600/20 rounded-xl">
            <ShieldCheck size={28} />
          </div>
          <div className="text-left">
            <h1 className="text-lg font-bold tracking-tight">CRM</h1>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Вход</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 text-center mb-4">
          Аккаунты выдаёт администратор. Регистрация с этой страницы отключена.
        </p>
        <form onSubmit={submit} className="space-y-4 text-left">
          {err && (
            <div className="rounded-2xl px-4 py-3 text-sm bg-red-500/10 text-red-200 border border-red-500/20">{err}</div>
          )}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1.5">
              <Fingerprint size={12} />
              Код
            </label>
            <input
              type="text"
              autoComplete="username"
              required
              minLength={2}
              maxLength={32}
              className="w-full font-mono bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/50"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ivan_m"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 uppercase">Пароль</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/50"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl mt-6"
          >
            <LogIn size={18} />
            {pending ? '…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
