import { useState, useCallback, useEffect } from 'react';
import { UserPlus, RefreshCw, Shield, Briefcase, AlertCircle } from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import { STAFF_EMAIL_DOMAIN } from '../lib/staffAuth';
import type { Profile } from '../context/AuthContext';

type Row = Pick<Profile, 'id' | 'full_name' | 'role' | 'is_active'> & { login_code: string | null; created_at?: string | null };

export function StaffManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ login_code: '', password: '', full_name: '', role: 'manager' as 'manager' | 'admin' });
  const [formErr, setFormErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    setLoading(true);
    try {
      const { data, error } = await getSupabase()
        .from('profiles')
        .select('id, full_name, role, is_active, login_code, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows((data as Row[]) || []);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    setSaving(true);
    try {
      const { data, error } = await getSupabase().functions.invoke<{
        ok?: boolean;
        id?: string;
        error?: string;
      }>('create-staff', {
        body: {
          login_code: form.login_code,
          password: form.password,
          full_name: form.full_name,
          role: form.role,
        },
      });
      if (data && typeof data === 'object' && 'error' in data && (data as { error: string }).error) {
        throw new Error((data as { error: string }).error);
      }
      if (error) {
        const msg = (data as { error?: string } | null)?.error || error.message;
        throw new Error(msg);
      }
      setForm({ login_code: '', password: '', full_name: '', role: 'manager' });
      await load();
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 text-left max-w-4xl">
      <p className="text-xs text-gray-500">
        Сотрудник входит: поле «Код» = этот идентификатор, пароль = заданный ниже. Технический email в auth: <code
          className="bg-gray-100 px-1 rounded"
        >
          {'код@'}
          {STAFF_EMAIL_DOMAIN}
        </code>{' '}
        (вводить не нужно).
      </p>
      {loadErr && (
        <div className="text-sm text-amber-700 bg-amber-50 p-3 rounded-xl flex gap-2">
          <AlertCircle size={18} className="shrink-0" />
          {loadErr}
        </div>
      )}

      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-3xl p-8 space-y-4 shadow-sm">
        <h2 className="font-black text-gray-800 text-xs uppercase tracking-widest flex items-center gap-2">
          <UserPlus size={16} className="text-blue-500" />
          Новый сотрудник
        </h2>
        {formErr && <div className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{formErr}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase">Код (логин)</label>
            <input
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-2.5 text-sm font-bold"
              value={form.login_code}
              onChange={(e) => setForm((f) => ({ ...f, login_code: e.target.value }))}
              placeholder="ivan_m"
              required
              minLength={2}
              maxLength={32}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase">Пароль</label>
            <input
              type="password"
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-2.5 text-sm"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-400 uppercase">ФИО</label>
          <input
            className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-2.5 text-sm font-bold"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            required
            minLength={2}
            placeholder="Иванов И.И."
            autoComplete="name"
          />
        </div>
        <div className="space-y-1 max-w-xs">
          <label className="text-[10px] font-black text-gray-400 uppercase">Роль</label>
          <select
            className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-2.5 text-sm font-bold"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'manager' | 'admin' }))}
          >
            <option value="manager">Менеджер</option>
            <option value="admin">Администратор</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest disabled:opacity-50"
        >
          {saving ? '…' : 'Создать'}
        </button>
      </form>

      <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-gray-800 text-xs uppercase tracking-widest">Сотрудники</h2>
          <button
            type="button"
            onClick={() => void load()}
            className="p-2 text-gray-400 hover:text-blue-600"
            title="Обновить"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {loading && rows.length === 0 ? (
          <p className="text-sm text-gray-400">Загрузка…</p>
        ) : (
          <table className="w-full text-sm border-collapse min-w-[600px]">
            <thead>
              <tr className="text-[10px] font-black text-gray-400 uppercase border-b">
                <th className="text-left py-2">Код</th>
                <th className="text-left py-2">ФИО</th>
                <th className="text-left py-2">Роль</th>
                <th className="text-left py-2">Активен</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="text-gray-800">
                  <td className="py-2 font-mono text-xs text-blue-600">{r.login_code || '—'}</td>
                  <td className="py-2 font-bold">{r.full_name}</td>
                  <td className="py-2">
                    {r.role === 'admin' ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 text-xs">
                        <Shield size={12} />
                        admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-600 text-xs">
                        <Briefcase size={12} />
                        manager
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-xs">{r.is_active ? 'да' : 'нет'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
