import { useMemo, useState } from 'react';
import { Fingerprint, Pencil, Search, Trash2, UserPlus, Users } from 'lucide-react';
import type { UiClient } from '../lib/crmApi';

type Props = {
  clients: UiClient[];
  onSelectClient: (c: UiClient) => void;
  onAddClient: () => void;
  onEditClient: (c: UiClient) => void;
  onDeleteClient: (c: UiClient) => void;
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function ClientDirectoryPanel({ clients, onSelectClient, onAddClient, onEditClient, onDeleteClient }: Props) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const textQuery = normalizeText(q);
    const digitsQuery = q.replace(/\D/g, '');
    if (!textQuery && !digitsQuery) return clients;

    return clients.filter(
      (c) =>
        (textQuery ? normalizeText(c.name).includes(textQuery) : false) ||
        (digitsQuery ? c.bin.replace(/\D/g, '').includes(digitsQuery) : false),
    );
  }, [clients, q]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-gray-800">
          <div className="p-2.5 bg-blue-600 rounded-xl text-white">
            <Users size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold">Все контрагенты</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">База crm_clients</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
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
          <button
            type="button"
            onClick={onAddClient}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest shadow-sm hover:bg-blue-500"
          >
            <UserPlus size={16} />
            Новый
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-22rem)]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 text-[10px] font-black text-gray-500 uppercase tracking-tighter border-b border-gray-100">
                <th className="p-4 bg-gray-50">Наименование</th>
                <th className="p-4 bg-gray-50">БИН</th>
                <th className="p-4 w-44 text-right bg-gray-50">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-10 text-center text-gray-500 text-sm">
                    {clients.length === 0 ? 'Контрагентов пока нет. Нажми «Новый».' : 'Ничего не найдено.'}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
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
                    <td className="p-4 font-bold text-gray-900">{c.name}</td>
                    <td className="p-4 font-mono text-xs text-gray-600 tracking-tight">
                      <span className="inline-flex items-center gap-1.5">
                        <Fingerprint size={12} className="text-gray-300" />
                        {c.bin}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <span className="text-[10px] font-black text-blue-600 uppercase">История</span>
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
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 text-[10px] text-gray-400 border-t border-gray-100">
          Клик по строке — встречи и сделки по БИН из всех отчётов.
        </p>
      </div>
    </div>
  );
}
