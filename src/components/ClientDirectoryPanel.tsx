import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Fingerprint, Pencil, Search, Trash2, UserPlus, Users } from 'lucide-react';
import type { ClientListRow } from '../lib/clientCpStats';
import { ClientCpEditor } from './ClientCpEditor';

type Props = {
  rows: ClientListRow[];
  onSelectClient: (c: { name: string; bin: string }) => void;
  onAddClient?: () => void;
  onEditClient?: (c: { name: string; bin: string; managerId?: string | null }) => void;
  onDeleteClient?: (c: { name: string; bin: string }) => void;
  onRefreshReports?: () => Promise<void>;
  onToggleClientPaid?: (bin: string, paid: boolean, paidAt?: string | null) => Promise<void>;
  onAssignManager?: (bin: string, managerId: string | null) => Promise<void>;
  onToggleKtp?: (bin: string, isKtp: boolean) => Promise<void>;
  managerSelectOptions?: Array<{ id: string; fullName: string }>;
  currentManagerId?: string | null;
  isAdmin?: boolean;
  managerFilter?: string;
  managerOptions?: string[];
  onManagerFilterChange?: (value: string) => void;
  title?: string;
  subtitle?: string;
  emptyHint?: string;
};

type CpSort = 'none' | 'desc' | 'asc';

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function ClientDirectoryPanel({
  rows,
  onSelectClient,
  onAddClient,
  onEditClient,
  onDeleteClient,
  onRefreshReports,
  onToggleClientPaid,
  onAssignManager,
  onToggleKtp,
  managerSelectOptions = [],
  currentManagerId,
  isAdmin,
  managerFilter = 'Все',
  managerOptions = ['Все'],
  onManagerFilterChange,
  title = 'Все контрагенты',
  subtitle = 'База crm_clients',
  emptyHint,
}: Props) {
  const [q, setQ] = useState('');
  const [cpSort, setCpSort] = useState<CpSort>('none');
  const canMutate = Boolean(onAddClient && onEditClient && onDeleteClient);

  const filtered = useMemo(() => {
    const textQuery = normalizeText(q);
    const digitsQuery = q.replace(/\D/g, '');
    if (!textQuery && !digitsQuery) return rows;

    return rows.filter(
      (c) =>
        (textQuery ? normalizeText(c.name).includes(textQuery) : false) ||
        (digitsQuery ? c.bin.replace(/\D/g, '').includes(digitsQuery) : false),
    );
  }, [rows, q]);

  const displayed = useMemo(() => {
    if (!isAdmin || cpSort === 'none') return filtered;
    return [...filtered].sort((a, b) => (cpSort === 'desc' ? b.totalCp - a.totalCp : a.totalCp - b.totalCp));
  }, [filtered, cpSort, isAdmin]);

  const cycleCpSort = () => {
    setCpSort((prev) => (prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none'));
  };

  const defaultEmpty =
    emptyHint ?? (rows.length === 0 ? (canMutate ? 'Контрагентов пока нет. Нажми «Новый».' : 'Клиентов пока нет в ваших отчётах.') : 'Ничего не найдено.');

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-gray-800">
          <div className="p-2.5 bg-blue-600 rounded-xl text-white">
            <Users size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{subtitle}</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {isAdmin ? (
            <select
              value={managerFilter}
              onChange={(e) => onManagerFilterChange?.(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium bg-white min-w-[180px]"
            >
              {managerOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : null}
          <div className="relative flex-1 min-w-0 sm:min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              type="search"
              placeholder="Поиск по названию или БИН…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          {canMutate && onAddClient ? (
            <button
              type="button"
              onClick={onAddClient}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest shadow-sm hover:bg-blue-500"
            >
              <UserPlus size={16} />
              Новый
            </button>
          ) : null}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-22rem)]">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 text-[10px] font-black text-gray-500 uppercase tracking-tighter border-b border-gray-100">
                <th className="p-4 bg-gray-50 w-[30%]">Наименование</th>
                <th className="p-4 bg-gray-50 w-[14%]">БИН</th>
                {isAdmin ? <th className="p-4 bg-gray-50 w-[8%] text-center">КТП</th> : null}
                {isAdmin ? <th className="p-4 bg-gray-50 w-[20%]">Менеджер</th> : null}
                <th className="p-4 bg-gray-50 w-[14%] text-center">
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={cycleCpSort}
                      className="inline-flex items-center justify-center gap-1 w-full text-[10px] font-black uppercase tracking-tighter text-gray-500 hover:text-blue-600"
                      title="Сортировка по количеству ЦП"
                    >
                      ЦП (всего)
                      {cpSort === 'desc' ? <ArrowDown size={12} className="text-blue-600" /> : null}
                      {cpSort === 'asc' ? <ArrowUp size={12} className="text-blue-600" /> : null}
                    </button>
                  ) : (
                    'ЦП (всего)'
                  )}
                </th>
                <th className="p-4 w-[14%] text-right bg-gray-50">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 4} className="p-10 text-center text-gray-500 text-sm">
                    {defaultEmpty}
                  </td>
                </tr>
              ) : (
                displayed.map((c) => (
                  <tr
                    key={c.bin}
                    className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                    onClick={() => onSelectClient(c)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectClient(c);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td className="p-4 font-bold text-gray-900 truncate" title={c.name}>{c.name}</td>
                    <td className="p-4 font-mono text-xs text-gray-600 tracking-tight">
                      <span className="inline-flex items-center gap-1.5">
                        <Fingerprint size={12} className="text-gray-300" />
                        {c.bin}
                      </span>
                    </td>
                    {isAdmin ? (
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={Boolean(c.isKtp)}
                          onChange={(e) => void onToggleKtp?.(c.bin, e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                          title="КТП"
                          aria-label={`КТП ${c.name}`}
                        />
                      </td>
                    ) : null}
                    {isAdmin ? (
                      <td className="p-4 text-xs text-gray-700" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={c.managerId ?? ''}
                          onChange={(e) => void onAssignManager?.(c.bin, e.target.value || null)}
                          className="w-full min-w-[140px] bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                        >
                          <option value="">Не назначен</option>
                          {managerSelectOptions.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.fullName}
                            </option>
                          ))}
                        </select>
                      </td>
                    ) : null}
                    <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <ClientCpEditor
                        bin={c.bin}
                        meetingCp={c.meetingCp}
                        extraCp={c.extraCp}
                        totalCp={c.totalCp}
                        meetings={c.cpMeetings}
                        standaloneByManager={c.standaloneByManager}
                        cpPaid={c.cpPaid}
                        cpPaidAt={c.cpPaidAt}
                        currentManagerId={currentManagerId}
                        isAdmin={isAdmin}
                        onToggleClientPaid={onToggleClientPaid}
                        onRefreshReports={onRefreshReports}
                        compact
                      />
                    </td>
                    <td className="p-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <span className="text-[10px] font-black text-blue-600 uppercase">История</span>
                        {canMutate && onEditClient ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditClient(c);
                            }}
                            className="inline-flex items-center justify-center p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100"
                            aria-label={`Изменить ${c.name}`}
                            title="Изменить"
                          >
                            <Pencil size={14} />
                          </button>
                        ) : null}
                        {canMutate && onDeleteClient ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteClient(c);
                            }}
                            className="inline-flex items-center justify-center p-1.5 rounded-lg text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100"
                            aria-label={`Удалить клиента ${c.name}`}
                            title="Удалить клиента"
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 text-[10px] text-gray-400 border-t border-gray-100">
          Клик по строке — история. ЦП = по встречам + без встречи. У админа статус оплаты находится рядом с ЦП.
        </p>
      </div>
    </div>
  );
}
