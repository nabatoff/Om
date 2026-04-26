import { useState } from 'react';
import { LogIn, UserPlus, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type Mode = 'signin' | 'signup';

export function LoginView() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setPending(true);
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password);
        if (error) setErr(error.message);
      } else {
        const { error } = await signUp(email, password);
        if (error) setErr(error.message);
        else
          setErr(
            'Регистрация отправлена. Если включено подтверждение email — проверьте почту, затем войдите.',
          );
      }
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
        <form onSubmit={submit} className="space-y-4 text-left">
          {err && (
            <div
              className={`rounded-2xl px-4 py-3 text-sm ${err.includes('почту') ? 'bg-amber-500/10 text-amber-200 border border-amber-500/30' : 'bg-red-500/10 text-red-200 border border-red-500/20'}`}
            >
              {err}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 uppercase">Email</label>
            <input
              type="email"
              autoComplete="email"
              required
              className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/50"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 uppercase">Пароль</label>
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
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
            {mode === 'signin' ? <LogIn size={18} /> : <UserPlus size={18} />}
            {pending ? '…' : mode === 'signin' ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </form>
        <p className="text-center text-slate-500 text-xs mt-6">
          {mode === 'signin' ? (
            <>
              Нет аккаунта?{' '}
              <button
                type="button"
                className="text-blue-400 font-bold"
                onClick={() => { setMode('signup'); setErr(null); }}
              >
                Регистрация
              </button>
            </>
          ) : (
            <>
              Уже есть аккаунт?{' '}
              <button
                type="button"
                className="text-blue-400 font-bold"
                onClick={() => { setMode('signin'); setErr(null); }}
              >
                Войти
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
