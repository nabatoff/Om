import { useEffect, useState } from 'react';
import { X, CalendarCheck, ShoppingBag, User } from 'lucide-react';
import type { ClientCategory, UiClient } from '../lib/crmApi';
import type { ClientConductedRow, ClientOrderRow } from '../lib/crmClientHistory';
import { ClientCpEditor } from './ClientCpEditor';
import type { ClientCpMeeting, ClientStandaloneCpView } from '../lib/clientCpStats';
import {
  ATTRACTION_MONTH_OPTIONS,
  NEW_CATEGORY_VALUE,
  attractionMonthFromParts,
  attractionYearOptions,
  formatAttractionMonth,
  parseAttractionMonth,
} from '../lib/clientProfile';
import { formatMoneyKzt } from '../lib/commission';

function formatDisplayDate(raw: string): string {
  const t = (raw || '').trim();
  const ymd = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[3]}-${ymd[2]}-${ymd[1]}`;
  const dmyDots = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmyDots) return `${dmyDots[1].padStart(2, '0')}-${dmyDots[2].padStart(2, '0')}-${dmyDots[3]}`;
  return t;
}

type ProfilePayload = {
  categoryId: string | null;
  newCategoryName?: string;
  gzTurnoverPrevYear: number | null;
  attractionMonth: string | null;
};

type Props = {
  client: UiClient;
  conducted: ClientConductedRow[];
  orders: ClientOrderRow[];
  meetingCp?: number;
  extraCp?: number;
  totalCp?: number;
  cpPaid?: boolean;
  cpPaidAt?: string | null;
  cpMeetings?: ClientCpMeeting[];
  standaloneByManager?: ClientStandaloneCpView[];
  currentManagerId?: string | null;
  isAdmin?: boolean;
  categories?: ClientCategory[];
  profileSaving?: boolean;
  onSaveProfile?: (bin: string, profile: ProfilePayload) => Promise<void>;
  onToggleClientPaid?: (bin: string, paid: boolean, paidAt?: string | null) => Promise<void>;
  onRefreshReports?: () => Promise<void>;
  onClose: () => void;
};

export function ClientHistoryModal({
  client,
  conducted,
  orders,
  meetingCp = 0,
  extraCp = 0,
  totalCp = 0,
  cpPaid = false,
  cpPaidAt = null,
  cpMeetings = [],
  standaloneByManager = [],
  currentManagerId,
  isAdmin,
  categories = [],
  profileSaving = false,
  onSaveProfile,
  onToggleClientPaid,
  onRefreshReports,
  onClose,
}: Props) {
  const hasHistory = conducted.length > 0 || orders.length > 0;
  const parsedAttraction = parseAttractionMonth(client.attractionMonth);
  const [categoryId, setCategoryId] = useState(client.categoryId ?? '');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [gzTurnover, setGzTurnover] = useState(
    client.gzTurnoverPrevYear != null ? String(client.gzTurnoverPrevYear) : '',
  );
  const [attractionYear, setAttractionYear] = useState(parsedAttraction?.year ?? new Date().getFullYear());
  const [attractionMonth, setAttractionMonth] = useState(parsedAttraction?.month ?? new Date().getMonth() + 1);

  useEffect(() => {
    const parsed = parseAttractionMonth(client.attractionMonth);
    setCategoryId(client.categoryId ?? '');
    setNewCategoryName('');
    setGzTurnover(client.gzTurnoverPrevYear != null ? String(client.gzTurnoverPrevYear) : '');
    setAttractionYear(parsed?.year ?? new Date().getFullYear());
    setAttractionMonth(parsed?.month ?? new Date().getMonth() + 1);
  }, [client.bin, client.categoryId, client.gzTurnoverPrevYear, client.attractionMonth]);

  const saveProfile = async () => {
    if (!onSaveProfile) return;
    if (categoryId === NEW_CATEGORY_VALUE && newCategoryName.trim().length < 2) {
      alert('Укажите название новой категории (не менее 2 символов)');
      return;
    }
    const gzNum = gzTurnover.trim() ? Math.max(0, Math.floor(Number(gzTurnover.replace(/\s/g, '')) || 0)) : null;
    await onSaveProfile(client.bin, {
      categoryId: categoryId === NEW_CATEGORY_VALUE ? null : categoryId || null,
      newCategoryName: categoryId === NEW_CATEGORY_VALUE ? newCategoryName.trim() : undefined,
      gzTurnoverPrevYear: gzNum,
      attractionMonth: attractionMonthFromParts(attractionYear, attractionMonth),
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md z-[500] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[min(90vh,900px)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-100 flex justify-between items-start bg-gray-50/80 shrink-0">
          <div>
            <div className="flex items-center gap-2 text-blue-600">
              <User size={22} />
              <h3 className="font-black text-gray-800 text-sm uppercase tracking-widest">Карточка контрагента</h3>
            </div>
            <p className="text-lg font-bold text-gray-900 mt-1">{client.name}</p>
            <p className="text-xs font-mono text-gray-500">БИН {client.bin}</p>

            <div className="mt-3 grid gap-2 text-xs text-gray-700 sm:grid-cols-3">
              {isAdmin && onSaveProfile ? (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Категория</span>
                    <select
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold"
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                    >
                      <option value="">—</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      <option value={NEW_CATEGORY_VALUE}>— Новая категория —</option>
                    </select>
                    {categoryId === NEW_CATEGORY_VALUE && (
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold mt-1"
                        placeholder="Название категории"
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      Обороты ГЗ (прошлый год)
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={gzTurnover}
                      onChange={(e) => setGzTurnover(e.target.value.replace(/[^\d]/g, ''))}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold"
                      placeholder="₸"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      Месяц привлечения
                    </span>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 bg-white border border-gray-200 rounded-xl px-2 py-2 text-sm font-bold"
                        value={attractionMonth}
                        onChange={(e) => setAttractionMonth(Number(e.target.value))}
                      >
                        {ATTRACTION_MONTH_OPTIONS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="w-24 bg-white border border-gray-200 rounded-xl px-2 py-2 text-sm font-bold"
                        value={attractionYear}
                        onChange={(e) => setAttractionYear(Number(e.target.value))}
                      >
                        {attractionYearOptions().map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Категория</span>
                    <p className="font-bold text-gray-800 mt-0.5">{client.categoryName || '—'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      Обороты ГЗ (прошлый год)
                    </span>
                    <p className="font-bold text-gray-800 mt-0.5">
                      {client.gzTurnoverPrevYear != null ? `${formatMoneyKzt(client.gzTurnoverPrevYear)} ₸` : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      Месяц привлечения
                    </span>
                    <p className="font-bold text-gray-800 mt-0.5">{formatAttractionMonth(client.attractionMonth)}</p>
                  </div>
                </>
              )}
            </div>

            {isAdmin && onSaveProfile && (
              <button
                type="button"
                disabled={profileSaving}
                onClick={() => void saveProfile()}
                className="mt-3 px-4 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-60"
              >
                {profileSaving ? 'Сохранение…' : 'Сохранить профиль'}
              </button>
            )}

            <div className="mt-2 flex items-center gap-2 text-[11px] flex-wrap">
              <span className="font-black text-gray-400 uppercase tracking-widest">ЦП всего</span>
              <ClientCpEditor
                bin={client.bin}
                meetingCp={meetingCp}
                extraCp={extraCp}
                totalCp={totalCp}
                meetings={cpMeetings}
                standaloneByManager={standaloneByManager}
                cpPaid={cpPaid}
                cpPaidAt={cpPaidAt}
                currentManagerId={currentManagerId}
                isAdmin={isAdmin}
                onToggleClientPaid={onToggleClientPaid}
                onRefreshReports={onRefreshReports}
              />
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={24} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-8 flex-1 min-h-0">
          {!hasHistory && (
            <p className="text-sm text-gray-500 text-center py-8">По этому БИН пока нет проведённых встреч и подтверждённых сделок в отчётах.</p>
          )}

          {conducted.length > 0 && (
            <section className="text-left">
              <div className="flex items-center gap-2 mb-3 text-emerald-700">
                <CalendarCheck size={18} />
                <h4 className="text-xs font-black uppercase tracking-widest">Проведённые встречи</h4>
                <span className="text-[10px] text-gray-400 font-mono">({conducted.length})</span>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] font-black text-gray-500 uppercase tracking-tighter">
                      <th className="p-3">Дата отчёта</th>
                      <th className="p-3">Менеджер</th>
                      <th className="p-3">Дата встречи</th>
                      <th className="p-3">Тип</th>
                      <th className="p-3">Сущность</th>
                      <th className="p-3 text-center">ЦП</th>
                      <th className="p-3 min-w-[120px]">Результат</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {conducted.map((row, i) => (
                      <tr key={`c-${i}-${row.reportDate}-${row.date}`} className="hover:bg-gray-50/50">
                        <td className="p-3 font-mono text-xs">{formatDisplayDate(row.reportDate)}</td>
                        <td className="p-3 text-xs font-bold">{row.manager}</td>
                        <td className="p-3 font-mono text-xs">{formatDisplayDate(row.date)}</td>
                        <td className="p-3 text-xs">{row.type}</td>
                        <td className="p-3 text-xs font-medium">{row.entityName}</td>
                        <td className="p-3 text-center text-xs font-black">{row.cpQuantity > 0 ? row.cpQuantity : '—'}</td>
                        <td className="p-3 text-xs text-gray-600">{row.result || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {orders.length > 0 && (
            <section className="text-left">
              <div className="flex items-center gap-2 mb-3 text-blue-700">
                <ShoppingBag size={18} />
                <h4 className="text-xs font-black uppercase tracking-widest">Подтверждённые заказы</h4>
                <span className="text-[10px] text-gray-400 font-mono">({orders.length})</span>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] font-black text-gray-500 uppercase tracking-tighter">
                      <th className="p-3">Дата отчёта</th>
                      <th className="p-3">Менеджер</th>
                      <th className="p-3">Сущность</th>
                      <th className="p-3">Через</th>
                      <th className="p-3 text-right">Сумма</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orders.map((row, i) => (
                      <tr key={`o-${i}-${row.reportDate}-${row.bin}`} className="hover:bg-gray-50/50">
                        <td className="p-3 font-mono text-xs">{formatDisplayDate(row.reportDate)}</td>
                        <td className="p-3 text-xs font-bold">{row.manager}</td>
                        <td className="p-3 text-xs font-medium">{row.entityName}</td>
                        <td className="p-3 text-xs text-gray-600">{row.viaEntityName || '—'}</td>
                        <td className="p-3 text-right text-xs font-black">{formatMoneyKzt(row.totalAmount)} ₸</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
