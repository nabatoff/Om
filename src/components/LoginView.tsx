import { useState } from 'react';
import { LogIn, ShieldCheck, User } from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import {
  formatAuthSignInError,
  isValidStaffLogin,
  staffLoginToServiceEmail,
} from '../lib/staffAuth';

export function LoginView() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!isValidStaffLogin(login)) {
      setErr('Логин: 2–32 символа, латиница, цифры, подчёркивание _');
      return;
    }
    setPending(true);
    try {
      const email = staffLoginToServiceEmail(login);
      const { error } = await getSupabase().auth.signInWithPassword({ email, password });
      if (error) {
        if (import.meta.env.DEV) console.error('[signInWithPassword]', email, error);
        setErr(formatAuthSignInError(error, email));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Неверный логин');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="bg-blue-600 text-white p-2.5 rounded-lg">
            <ShieldCheck size={22} />
          </div>
          <div className="text-left">
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">Модуль отчетов</h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Вход в CRM</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <p className="text-xs text-gray-500 text-center mb-5">
            Войти по <strong className="text-gray-800">логину</strong> и паролю, которые выдал администратор.
          </p>
          <form onSubmit={submit} className="space-y-4 text-left">
            {err && (
              <div className="rounded-xl px-4 py-3 text-sm bg-red-50 text-red-700 border border-red-100 font-medium">
                {err}
              </div>
            )}
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <User size={12} />
                Логин
              </label>
              <input
                type="text"
                name="username"
                autoComplete="username"
                required
                minLength={2}
                maxLength={32}
                className="w-full font-mono bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium outline-none focus:border-blue-500 transition"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="например ivan_01"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                Пароль
              </label>
              <input
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium outline-none focus:border-blue-500 transition"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm py-3 rounded-xl mt-2 shadow-sm transition"
            >
              <LogIn size={18} />
              {pending ? '…' : 'Войти'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
