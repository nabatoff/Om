import { useState, useCallback, useEffect } from 'react';
import { UserPlus, RefreshCw, Shield, Briefcase, AlertCircle, KeyRound, X, UserX } from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import { useAuth, type Profile } from '../context/AuthContext';

type Row = Pick<Profile, 'id' | 'full_name' | 'role' | 'is_active'> & { login_code: string | null; created_at?: string | null };

export function StaffManager() {
  const { user: authUser } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ login_code: '', password: '', full_name: '', role: 'manager' as 'manager' | 'admin' });
  const [formErr, setFormErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pwdFor, setPwdFor] = useState<Row | null>(null);
  const [pwdNew, setPwdNew] = useState('');
  const [pwdNew2, setPwdNew2] = useState('');
  const [pwdErr, setPwdErr] = useState<string | null>(null);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [revokeFor, setRevokeFor] = useState<Row | null>(null);
  const [revokeErr, setRevokeErr] = useState<string | null>(null);
  const [revokeSaving, setRevokeSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadErr(null);
    setLoading(true);
    try {
      const { data, error } = await getSupabase()
        .from('profiles')
        .select('id, full_name, role, is_active, login_code, created_at')
        .order('login_code', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true });
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

  const openPwd = (r: Row) => {
    setPwdFor(r);
    setPwdNew('');
    setPwdNew2('');
    setPwdErr(null);
  };

  const closePwd = () => {
    if (pwdSaving) return;
    setPwdFor(null);
    setPwdErr(null);
  };

  const submitPwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwdFor) return;
    setPwdErr(null);
    if (pwdNew.length < 6) {
      setPwdErr('Пароль минимум 6 символов');
      return;
    }
    if (pwdNew !== pwdNew2) {
      setPwdErr('Пароли не совпадают');
      return;
    }
    setPwdSaving(true);
    try {
      const { data, error } = await getSupabase().functions.invoke<{ ok?: boolean; error?: string }>('set-staff-password', {
        body: { user_id: pwdFor.id, password: pwdNew },
      });
      if (data && typeof data === 'object' && 'error' in data && (data as { error: string }).error) {
        throw new Error((data as { error: string }).error);
      }
      if (error) {
        const msg = (data as { error?: string } | null)?.error || error.message;
        throw new Error(msg);
      }
      setPwdFor(null);
      setPwdNew('');
      setPwdNew2('');
      setPwdErr(null);
    } catch (err) {
      setPwdErr(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setPwdSaving(false);
    }
  };

  const closeRevoke = () => {
    if (revokeSaving) return;
    setRevokeFor(null);
    setRevokeErr(null);
  };

  const submitRevoke = async () => {
    if (!revokeFor) return;
    setRevokeErr(null);
    setRevokeSaving(true);
    try {
      const { data, error } = await getSupabase().functions.invoke<{ ok?: boolean; error?: string }>('revoke-staff-access', {
        body: { user_id: revokeFor.id },
      });
      if (data && typeof data === 'object' && 'error' in data && (data as { error: string }).error) {
        throw new Error((data as { error: string }).error);
      }
      if (error) {
        const msg = (data as { error?: string } | null)?.error || error.message;
        throw new Error(msg);
      }
      setRevokeFor(null);
      setRevokeErr(null);
      await load();
    } catch (err) {
      setRevokeErr(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setRevokeSaving(false);
    }
  };

  return (
    <div className="space-y-8 text-left max-w-4xl">
      <p className="text-xs text-gray-600 leading-relaxed">
        Придумай уникальный <strong>логин</strong> (латиница, цифры, знак <code className="bg-gray-100 px-1 rounded">_</code>, 2–32
        символа) — его сотрудник будет вводить на странице входа <strong>вместе с паролем</strong>. Это не e-mail: почта в системе
        не используется. <strong>Отозвать доступ</strong> можно у «Сотрудники» — ФИО остаётся в системе, в т.ч. в уже сохранённых
        отчётах (поле «менеджер»).
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
            <label className="text-[10px] font-black text-gray-400 uppercase">Логин</label>
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
          <table className="w-full text-sm border-collapse min-w-[720px]">
            <thead>
              <tr className="text-[10px] font-black text-gray-400 uppercase border-b">
                <th className="text-left py-2">Логин</th>
                <th className="text-left py-2">ФИО</th>
                <th className="text-left py-2">Роль</th>
                <th className="text-left py-2">Активен</th>
                <th className="text-left py-2 min-w-[200px]">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const isSelf = authUser?.id === r.id;
                const isActive = r.is_active !== false;
                return (
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
                    <td className="py-2 text-xs">{isActive ? 'да' : 'нет'}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-3">
                        {isActive ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openPwd(r)}
                              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800"
                            >
                              <KeyRound size={14} />
                              Пароль
                            </button>
                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRevokeFor(r);
                                  setRevokeErr(null);
                                }}
                                className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-800"
                              >
                                <UserX size={14} />
                                Отозвать
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">доступ отключён</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pwdFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwd-modal-title"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-gray-200">
            <div className="flex items-start justify-between gap-2 mb-4">
              <h3 id="pwd-modal-title" className="font-black text-gray-800 text-sm uppercase tracking-widest">
                Новый пароль
              </h3>
              <button type="button" onClick={closePwd} className="p-1 text-gray-400 hover:text-gray-600" title="Закрыть">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Сотрудник: <span className="font-mono font-bold text-blue-600">{pwdFor.login_code || pwdFor.id.slice(0, 8)}</span> —{' '}
              {pwdFor.full_name}
            </p>
            <form onSubmit={submitPwd} className="space-y-3">
              {pwdErr && <div className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{pwdErr}</div>}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase">Пароль</label>
                <input
                  type="password"
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-2.5 text-sm"
                  value={pwdNew}
                  onChange={(e) => setPwdNew(e.target.value)}
                  minLength={6}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase">Повтор</label>
                <input
                  type="password"
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-2.5 text-sm"
                  value={pwdNew2}
                  onChange={(e) => setPwdNew2(e.target.value)}
                  minLength={6}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closePwd}
                  disabled={pwdSaving}
                  className="flex-1 border border-gray-200 py-2.5 rounded-2xl text-xs font-bold text-gray-600"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={pwdSaving}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest disabled:opacity-50"
                >
                  {pwdSaving ? '…' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {revokeFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="revoke-modal-title"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-gray-200">
            <div className="flex items-start justify-between gap-2 mb-4">
              <h3 id="revoke-modal-title" className="font-black text-gray-800 text-sm uppercase tracking-widest">
                Отозвать доступ
              </h3>
              <button type="button" onClick={closeRevoke} className="p-1 text-gray-400 hover:text-gray-600" title="Закрыть">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              <span className="font-bold text-gray-800">{revokeFor.full_name}</span> не сможет войти.{' '}
              <strong>ФИО</strong> в карточке и в уже сохранённых отчётах (менеджер) <strong>не удаляется</strong>.
            </p>
            {revokeErr && <div className="text-sm text-red-600 bg-red-50 p-2 rounded-lg mb-3">{revokeErr}</div>}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={closeRevoke}
                disabled={revokeSaving}
                className="flex-1 border border-gray-200 py-2.5 rounded-2xl text-xs font-bold text-gray-600"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void submitRevoke()}
                disabled={revokeSaving}
                className="flex-1 bg-rose-600 text-white py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest disabled:opacity-50"
              >
                {revokeSaving ? '…' : 'Отозвать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
