import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Settings } from 'lucide-react';
import {
  backfillOrderCommissionsApi,
  countOrdersWithoutCommissionApi,
  deleteClientCategoryApi,
  fetchAdminAnalyticsTabEnabledApi,
  fetchClientCategoriesApi,
  fetchMrpApi,
  setAdminAnalyticsTabEnabledApi,
  setMrpApi,
  upsertClientCategoryApi,
  type ClientCategory,
} from '../lib/crmApi';
import { formatMoneyKzt, getCommissionThresholds } from '../lib/commission';

type Props = {
  onRefreshReports?: () => Promise<void>;
  onMrpUpdated?: (mrp: number) => void;
  onAnalyticsTabEnabledChange?: (enabled: boolean) => void;
};

export function AdminSettingsPanel({ onRefreshReports, onMrpUpdated, onAnalyticsTabEnabledChange }: Props) {
  const [mrp, setMrp] = useState('4325');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingWithout, setPendingWithout] = useState<number | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [analyticsTabEnabled, setAnalyticsTabEnabled] = useState(true);
  const [analyticsTabSaving, setAnalyticsTabSaving] = useState(false);
  const [categories, setCategories] = useState<ClientCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categorySaving, setCategorySaving] = useState(false);

  const thresholds = useMemo(() => {
    const n = Math.max(1, Math.floor(Number(mrp.replace(/\s/g, '')) || 0));
    return getCommissionThresholds(n);
  }, [mrp]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, pending, analyticsEnabled, cats] = await Promise.all([
        fetchMrpApi(),
        countOrdersWithoutCommissionApi(),
        fetchAdminAnalyticsTabEnabledApi(),
        fetchClientCategoriesApi(),
      ]);
      setMrp(String(m));
      setPendingWithout(pending);
      setAnalyticsTabEnabled(analyticsEnabled);
      setCategories(cats);
      onAnalyticsTabEnabledChange?.(analyticsEnabled);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось загрузить настройки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveMrp = async () => {
    const n = Math.floor(Number(mrp.replace(/\s/g, '')) || 0);
    if (n < 1) {
      alert('МРП должен быть не меньше 1');
      return;
    }
    setSaving(true);
    try {
      await setMrpApi(n);
      setMrp(String(n));
      onMrpUpdated?.(n);
      alert('МРП сохранён');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось сохранить МРП');
    } finally {
      setSaving(false);
    }
  };

  const toggleAnalyticsTab = async () => {
    const next = !analyticsTabEnabled;
    setAnalyticsTabSaving(true);
    try {
      await setAdminAnalyticsTabEnabledApi(next);
      setAnalyticsTabEnabled(next);
      onAnalyticsTabEnabledChange?.(next);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось сохранить настройку');
    } finally {
      setAnalyticsTabSaving(false);
    }
  };

  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (name.length < 2) {
      alert('Название категории — не менее 2 символов');
      return;
    }
    setCategorySaving(true);
    try {
      await upsertClientCategoryApi(name);
      setNewCategoryName('');
      setCategories(await fetchClientCategoriesApi());
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось добавить категорию');
    } finally {
      setCategorySaving(false);
    }
  };

  const removeCategory = async (id: string, name: string) => {
    if (!window.confirm(`Удалить категорию «${name}»? У клиентов поле станет пустым.`)) return;
    setCategorySaving(true);
    try {
      await deleteClientCategoryApi(id);
      setCategories(await fetchClientCategoriesApi());
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось удалить категорию');
    } finally {
      setCategorySaving(false);
    }
  };

  const runBackfill = async () => {
    const pending = pendingWithout ?? 0;
    const overwrite = window.confirm(
      'Пересчитать также заказы, у которых комиссия уже заполнена?\n\n' +
        'ОК — пересчитать все (по каждому заказу №1, №2…).\n' +
        'Отмена — только пустые комиссии.',
    );
    const ok = window.confirm(
      `${overwrite ? 'Пересчитать все комиссии' : 'Заполнить комиссии по архиву'}?\n\n` +
        `Ориентир: ${pending} отдельных заказов (№1, №2…) без комиссии.\n` +
        `КТП и МРП (${thresholds.mrp} ₸) — текущие. Backfill заполняет комиссию по каждой сумме в записи.`,
    );
    if (!ok) return;
    setBackfilling(true);
    try {
      const updated = await backfillOrderCommissionsApi(overwrite);
      await onRefreshReports?.();
      const left = await countOrdersWithoutCommissionApi();
      setPendingWithout(left);
      alert(`Обновлено записей в архиве: ${updated}. Осталось заказов без комиссии: ${left}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Backfill не удался');
    } finally {
      setBackfilling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm font-bold">Загрузка настроек…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2 text-gray-800">
        <div className="p-2.5 bg-slate-700 rounded-xl text-white">
          <Settings size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold">Настройки</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">МРП и комиссии</p>
        </div>
      </div>

      <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4 max-w-xl">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">МРП (₸)</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1 flex-1 min-w-[140px]">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Значение</label>
            <input
              type="text"
              inputMode="numeric"
              value={mrp}
              onChange={(e) => setMrp(e.target.value.replace(/[^\d]/g, ''))}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold"
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveMrp()}
            className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-blue-500 disabled:opacity-60"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
        <ul className="text-xs text-gray-600 space-y-1 font-medium">
          <li>5% до: {formatMoneyKzt(thresholds.tier1NonKtpMax)} ₸ (800 МРП)</li>
          <li>3% КТП до: {formatMoneyKzt(thresholds.tier1KtpMax)} ₸ (≈1333 МРП)</li>
          <li>Фикс. комиссия: {formatMoneyKzt(thresholds.fixedCommission)} ₸ (40 МРП)</li>
          <li>Макс. заказ: {formatMoneyKzt(thresholds.maxOrderAmount)} ₸ (4000 МРП)</li>
        </ul>
        <p className="text-[10px] text-gray-400">
          Смена МРП влияет только на новые сохранения заказов и лимит при вводе. Старые заказы в таблице не пересчитываются.
        </p>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4 max-w-xl">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Категории клиентов</h3>
        {categories.length === 0 ? (
          <p className="text-sm text-gray-500">Категорий пока нет.</p>
        ) : (
          <ul className="space-y-2">
            {categories.map((cat) => (
              <li
                key={cat.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100"
              >
                <span className="text-sm font-bold text-gray-800">{cat.name}</span>
                <button
                  type="button"
                  disabled={categorySaving}
                  onClick={() => void removeCategory(cat.id, cat.name)}
                  className="text-[10px] font-bold uppercase tracking-wider text-rose-600 hover:text-rose-800 disabled:opacity-50"
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1 flex-1 min-w-[180px]">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Новая категория</label>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold"
              placeholder="Госзаказ"
            />
          </div>
          <button
            type="button"
            disabled={categorySaving}
            onClick={() => void addCategory()}
            className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-blue-500 disabled:opacity-60"
          >
            {categorySaving ? 'Сохранение…' : 'Добавить'}
          </button>
        </div>
        <p className="text-[10px] text-gray-400">
          Категории также можно создать при заведении нового контрагента.
        </p>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4 max-w-xl">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Интерфейс админки</h3>
        <p className="text-sm text-gray-700">
          Вкладка «Аналитика» (таблица контрагентов):{' '}
          <span className="font-black">{analyticsTabEnabled ? 'включена' : 'отключена'}</span>
        </p>
        <button
          type="button"
          disabled={analyticsTabSaving}
          onClick={() => void toggleAnalyticsTab()}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border disabled:opacity-60 ${
            analyticsTabEnabled
              ? 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
          }`}
        >
          {analyticsTabSaving
            ? 'Сохранение…'
            : analyticsTabEnabled
              ? 'Отключить вкладку «Аналитика»'
              : 'Включить вкладку «Аналитика»'}
        </button>
        <p className="text-[10px] text-gray-400">
          Настройка сохраняется для всех администраторов. Дашборд, KPI и остальные вкладки не затрагиваются.
        </p>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4 max-w-xl">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Архив заказов</h3>
        <p className="text-sm text-gray-700">
          Заказов без комиссии:{' '}
          <span className="font-black">{pendingWithout ?? '—'}</span>
        </p>
        <p className="text-[10px] text-gray-400">
          Считаются отдельные суммы в списке заказов, а не строки таблицы «Заказы».
        </p>
        <button
          type="button"
          disabled={backfilling || (pendingWithout ?? 0) === 0}
          onClick={() => void runBackfill()}
          className="px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs font-bold uppercase tracking-wider hover:bg-amber-100 disabled:opacity-50"
        >
          {backfilling ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Заполнение…
            </span>
          ) : (
            'Заполнить комиссии по архиву'
          )}
        </button>
      </section>
    </div>
  );
}
