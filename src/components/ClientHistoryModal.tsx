import { X, CalendarCheck, ShoppingBag, User } from 'lucide-react';
import type { UiClient } from '../lib/crmApi';
import type { ClientConductedRow, ClientOrderRow } from '../lib/crmClientHistory';

type Props = {
  client: UiClient;
  conducted: ClientConductedRow[];
  orders: ClientOrderRow[];
  onClose: () => void;
};

export function ClientHistoryModal({ client, conducted, orders, onClose }: Props) {
  const hasHistory = conducted.length > 0 || orders.length > 0;

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
                      <th className="p-3 min-w-[120px]">Результат</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {conducted.map((row, i) => (
                      <tr key={`c-${i}-${row.reportDate}-${row.date}`} className="hover:bg-gray-50/50">
                        <td className="p-3 font-mono text-xs text-gray-700 whitespace-nowrap">{row.reportDate}</td>
                        <td className="p-3 text-gray-800">{row.manager}</td>
                        <td className="p-3 font-mono text-xs text-gray-600 whitespace-nowrap">{row.date || '—'}</td>
                        <td className="p-3 text-gray-600">{row.type}</td>
                        <td className="p-3 text-gray-800">{row.entityName}</td>
                        <td className="p-3 text-gray-600 text-xs leading-snug">{row.result || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {orders.length > 0 && (
            <section className="text-left">
              <div className="flex items-center gap-2 mb-3 text-amber-700">
                <ShoppingBag size={18} />
                <h4 className="text-xs font-black uppercase tracking-widest">Подтверждённые сделки (заказы)</h4>
                <span className="text-[10px] text-gray-400 font-mono">({orders.length})</span>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] font-black text-gray-500 uppercase tracking-tighter">
                      <th className="p-3">Дата отчёта</th>
                      <th className="p-3">Менеджер</th>
                      <th className="p-3">Сущность</th>
                      <th className="p-3">Кол-во</th>
                      <th className="p-3">Сумма</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orders.map((row, i) => (
                      <tr key={`o-${i}-${row.reportDate}-${row.entityName}`} className="hover:bg-gray-50/50">
                        <td className="p-3 font-mono text-xs text-gray-700 whitespace-nowrap">{row.reportDate}</td>
                        <td className="p-3 text-gray-800">{row.manager}</td>
                        <td className="p-3 text-gray-800">{row.entityName}</td>
                        <td className="p-3 font-mono text-xs">{row.orderCount}</td>
                        <td className="p-3 font-mono text-xs text-emerald-700">
                          {row.totalAmount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₸
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50/50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-600 bg-white border border-gray-200 hover:bg-gray-50"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
