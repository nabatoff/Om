import { useState } from 'react';
import { updateConductedMeetingCpById } from '../lib/crmApi';
import type { ClientCpMeeting } from '../lib/clientCpStats';

function formatDisplayDate(raw: string): string {
  const t = (raw || '').trim();
  const ymd = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[3]}-${ymd[2]}-${ymd[1]}`;
  return t || '—';
}

type Props = {
  totalCp: number;
  meetings: ClientCpMeeting[];
  onRefreshReports?: () => Promise<void>;
  compact?: boolean;
};

export function ClientCpEditor({ totalCp, meetings, onRefreshReports, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [qtyModal, setQtyModal] = useState<{ meetingId: string; input: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const editable = Boolean(onRefreshReports);
  const label = totalCp >= 1 ? `${totalCp} шт.` : '—';

  const applyCp = async (meetingId: string, cpSent: boolean, cpQuantity: number) => {
    if (!onRefreshReports) return;
    setBusy(true);
    try {
      await updateConductedMeetingCpById(meetingId, cpSent, cpQuantity);
      await onRefreshReports();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось сохранить ЦП');
    } finally {
      setBusy(false);
    }
  };

  if (!editable) {
    return <span className="text-sm font-bold text-gray-800 whitespace-nowrap">{label}</span>;
  }

  return (
    <>
      <div className={`flex ${compact ? 'flex-col items-end gap-0.5' : 'flex-row items-center gap-2'}`}>
        <span className="text-sm font-bold text-gray-800 whitespace-nowrap">{label}</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(true)}
          className="text-[10px] font-black uppercase text-blue-600 hover:underline disabled:opacity-50"
        >
          Изменить
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-[620] flex items-center justify-center p-4"
          onClick={() => {
            if (!busy) setOpen(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-gray-200 p-5 max-w-lg w-full text-left max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-xs font-black text-gray-800 uppercase tracking-widest mb-1">ЦП по клиенту</h4>
            <p className="text-[11px] text-gray-500 mb-4">
              Всего: <strong>{totalCp >= 1 ? `${totalCp} шт.` : 'нет'}</strong>. Редактирование по каждой проведённой встрече.
            </p>

            {meetings.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">
                Нет сохранённых проведённых встреч с id. Добавьте встречу в отчёте и сохраните отчёт — затем можно указать ЦП.
              </p>
            ) : (
              <div className="space-y-3">
                {meetings.map((m) => {
                  const sent = m.cpSent && m.cpQuantity >= 1;
                  return (
                    <div
                      key={m.meetingId}
                      className="border border-gray-100 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between"
                    >
                      <div className="text-xs text-gray-600">
                        <span className="font-mono">{formatDisplayDate(m.reportDate)}</span>
                        {m.meetingDate ? (
                          <span className="text-gray-400"> · встреча {formatDisplayDate(m.meetingDate)}</span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          disabled={busy}
                          className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] font-bold"
                          value={sent ? 'yes' : 'no'}
                          onChange={(e) => {
                            if (e.target.value === 'no') void applyCp(m.meetingId, false, 0);
                            else setQtyModal({ meetingId: m.meetingId, input: m.cpQuantity >= 1 ? String(m.cpQuantity) : '' });
                          }}
                        >
                          <option value="no">Нет</option>
                          <option value="yes">Да</option>
                        </select>
                        {sent ? (
                          <button
                            type="button"
                            disabled={busy}
                            className="text-[10px] font-black uppercase text-blue-600"
                            onClick={() =>
                              setQtyModal({
                                meetingId: m.meetingId,
                                input: String(m.cpQuantity),
                              })
                            }
                          >
                            {m.cpQuantity} шт.
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button
                type="button"
                disabled={busy}
                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-gray-200 text-gray-600"
                onClick={() => setOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {qtyModal && (
        <div
          className="fixed inset-0 bg-black/60 z-[630] flex items-center justify-center p-4"
          onClick={() => {
            if (!busy) setQtyModal(null);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-xs font-black text-gray-800 uppercase tracking-widest mb-2">Количество ЦП</h4>
            <input
              type="number"
              min={1}
              step={1}
              disabled={busy}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold mb-4"
              autoFocus
              value={qtyModal.input}
              onChange={(e) => setQtyModal((prev) => (prev ? { ...prev, input: e.target.value } : prev))}
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                disabled={busy}
                className="px-3 py-2 rounded-xl text-[10px] font-black uppercase border border-gray-200"
                onClick={() => setQtyModal(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={busy}
                className="px-3 py-2 rounded-xl text-[10px] font-black uppercase bg-blue-600 text-white"
                onClick={async () => {
                  const n = parseInt(qtyModal.input.trim(), 10);
                  if (!Number.isFinite(n) || n < 1) {
                    alert('Введите целое число от 1.');
                    return;
                  }
                  await applyCp(qtyModal.meetingId, true, n);
                  setQtyModal(null);
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
