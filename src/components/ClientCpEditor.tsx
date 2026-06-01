import { useEffect, useState } from 'react';
import {
  createClientStandaloneCp,
  updateConductedMeetingCpById,
  updateClientStandaloneCpById,
} from '../lib/crmApi';
import type { ClientCpMeeting, ClientStandaloneCpView } from '../lib/clientCpStats';

function formatDisplayDate(raw: string): string {
  const t = (raw || '').trim();
  const ymd = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[3]}-${ymd[2]}-${ymd[1]}`;
  return t || '—';
}

const PAID_MONTHS = [
  { value: '01', label: 'Январь' },
  { value: '02', label: 'Февраль' },
  { value: '03', label: 'Март' },
  { value: '04', label: 'Апрель' },
  { value: '05', label: 'Май' },
  { value: '06', label: 'Июнь' },
  { value: '07', label: 'Июль' },
  { value: '08', label: 'Август' },
  { value: '09', label: 'Сентябрь' },
  { value: '10', label: 'Октябрь' },
  { value: '11', label: 'Ноябрь' },
  { value: '12', label: 'Декабрь' },
] as const;

function formatPaidMonth(raw: string): string {
  const t = (raw || '').trim();
  const m = t.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!m) return t || '—';
  const monthLabel = PAID_MONTHS.find((item) => item.value === m[2])?.label ?? m[2];
  return `${monthLabel} ${m[1]}`;
}

function paidYearOptions(): number[] {
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y, y + 1];
}

function parsePaidMonthYear(raw: string | null | undefined): { month: string; year: string } {
  const now = new Date();
  const m = (raw || '').match(/^(\d{4})-(\d{2})/);
  if (m) return { year: m[1], month: m[2] };
  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1).padStart(2, '0'),
  };
}

type Props = {
  bin: string;
  meetingCp: number;
  extraCp: number;
  totalCp: number;
  meetings: ClientCpMeeting[];
  standaloneByManager: ClientStandaloneCpView[];
  cpPaid?: boolean;
  cpPaidAt?: string | null;
  /** Свой manager_id — для сохранения «ЦП без встречи». */
  currentManagerId?: string | null;
  isAdmin?: boolean;
  onToggleClientPaid?: (bin: string, paid: boolean, paidAt?: string | null) => Promise<void>;
  onRefreshReports?: () => Promise<void>;
  compact?: boolean;
};

export function ClientCpEditor({
  bin,
  meetingCp,
  extraCp,
  totalCp,
  meetings,
  standaloneByManager,
  cpPaid,
  cpPaidAt,
  currentManagerId,
  isAdmin,
  onToggleClientPaid,
  onRefreshReports,
  compact,
}: Props) {
  const [open, setOpen] = useState(false);
  const [qtyModal, setQtyModal] = useState<{ meetingId: string; input: string } | null>(null);
  const [extraInput, setExtraInput] = useState('1');
  const [entryEdits, setEntryEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [paidAtModal, setPaidAtModal] = useState<{ month: string; year: string } | null>(null);

  const editable = Boolean(onRefreshReports);
  const label = totalCp >= 1 ? `${totalCp} шт.` : '—';
  const ownStandaloneEntries = currentManagerId ? standaloneByManager.filter((s) => s.managerId === currentManagerId) : [];

  useEffect(() => {
    if (!open) return;
    setExtraInput('1');
    const next: Record<string, string> = {};
    for (const s of standaloneByManager) {
      next[s.id] = String(s.cpQuantity);
    }
    setEntryEdits(next);
  }, [open, standaloneByManager]);

  const applyMeetingCp = async (meetingId: string, cpSent: boolean, cpQuantity: number) => {
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

  const createStandalone = async (quantity: number, managerId?: string) => {
    if (!onRefreshReports) return;
    setBusy(true);
    try {
      await createClientStandaloneCp(bin, quantity, managerId);
      await onRefreshReports();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось добавить ЦП без встречи');
    } finally {
      setBusy(false);
    }
  };

  const updateStandalone = async (id: string, quantity: number) => {
    if (!onRefreshReports) return;
    setBusy(true);
    try {
      await updateClientStandaloneCpById(id, quantity);
      await onRefreshReports();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось сохранить ЦП без встречи');
    } finally {
      setBusy(false);
    }
  };

  const applyClientPaid = async (paid: boolean, paidAt?: string | null) => {
    if (!onToggleClientPaid) return;
    setBusy(true);
    try {
      await onToggleClientPaid(bin, paid, paidAt);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось сохранить статус оплаты');
    } finally {
      setBusy(false);
    }
  };

  const paidCaption = cpPaid ? formatPaidMonth(cpPaidAt || '') : 'Не оплачено';

  if (!editable) {
    return (
      <span className="text-sm font-bold text-gray-800 whitespace-nowrap" title={`встречи: ${meetingCp}, без встречи: ${extraCp}`}>
        {label}
      </span>
    );
  }

  return (
    <>
      <div className={`flex ${compact ? 'flex-col items-end gap-1' : 'flex-row items-center gap-2 flex-wrap'}`}>
        <span
          className="text-sm font-bold text-gray-800 whitespace-nowrap"
          title={`всего ${totalCp} (встречи ${meetingCp} + без встречи ${extraCp})`}
        >
          {label}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(true)}
          className="text-[10px] font-black uppercase text-blue-600 hover:underline disabled:opacity-50"
        >
          Изменить
        </button>
        {isAdmin ? (
          <button
            type="button"
            disabled={busy}
            className={`min-w-[98px] rounded-xl px-3 py-1.5 text-[10px] font-bold tracking-wide border transition-colors ${
              cpPaid
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
            }`}
            onClick={() => {
              if (cpPaid) {
                void applyClientPaid(false, null);
              } else {
                setPaidAtModal(parsePaidMonthYear(cpPaidAt));
              }
            }}
          >
            {paidCaption}
          </button>
        ) : null}
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
              Всего: <strong>{totalCp >= 1 ? `${totalCp} шт.` : 'нет'}</strong>
              {' '}
              (по встречам <strong>{meetingCp}</strong>, без встречи <strong>{extraCp}</strong>)
            </p>
            <section className="mb-6">
              <h5 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">ЦП без встречи</h5>
              {isAdmin ? (
                standaloneByManager.length === 0 ? (
                  <p className="text-xs text-gray-500">Нет дополнительных ЦП по менеджерам.</p>
                ) : (
                  <div className="space-y-2">
                    {standaloneByManager.map((s) => (
                      <div key={s.id} className="border border-gray-100 rounded-xl p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs font-bold text-gray-700 truncate">
                          {s.managerName || s.managerId.slice(0, 8)}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            disabled={busy}
                            className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold"
                            value={entryEdits[s.id] ?? String(s.cpQuantity)}
                            onChange={(e) =>
                              setEntryEdits((prev) => ({ ...prev, [s.id]: e.target.value }))
                            }
                          />
                          <button
                            type="button"
                            disabled={busy}
                            className="text-[10px] font-black uppercase text-blue-600 shrink-0"
                            onClick={async () => {
                              const n = parseInt((entryEdits[s.id] ?? '0').trim(), 10);
                              if (!Number.isFinite(n) || n < 0) {
                                alert('Введите целое число ≥ 0.');
                                return;
                              }
                              await updateStandalone(s.id, n);
                            }}
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className="text-[10px] font-black uppercase text-red-600 shrink-0"
                            onClick={async () => {
                              const ok = confirm('Удалить эту запись ЦП без встречи?');
                              if (!ok) return;
                              await updateStandalone(s.id, 0);
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="border border-dashed border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-2 justify-between">
                      <span className="text-[11px] font-bold text-gray-600">Добавить запись</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          disabled={busy}
                          className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold"
                          value={extraInput}
                          onChange={(e) => setExtraInput(e.target.value)}
                        />
                        <button
                          type="button"
                          disabled={busy}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-blue-600 text-white"
                          onClick={async () => {
                            const n = parseInt(extraInput.trim(), 10);
                            if (!Number.isFinite(n) || n < 1) {
                              alert('Введите целое число от 1.');
                              return;
                            }
                            await createStandalone(n, currentManagerId ?? undefined);
                            setExtraInput('1');
                          }}
                        >
                          Добавить
                        </button>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div className="space-y-2 w-full">
                  {ownStandaloneEntries.length === 0 ? (
                    <p className="text-xs text-gray-500">Пока нет записей.</p>
                  ) : (
                    ownStandaloneEntries.map((s) => (
                      <div key={s.id} className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          disabled={busy}
                          className="w-24 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold"
                          value={entryEdits[s.id] ?? String(s.cpQuantity)}
                          onChange={(e) => setEntryEdits((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          disabled={busy}
                          className="px-3 py-2 rounded-xl text-[10px] font-black uppercase bg-blue-600 text-white"
                          onClick={async () => {
                            const n = parseInt((entryEdits[s.id] ?? '0').trim(), 10);
                            if (!Number.isFinite(n) || n < 0) {
                              alert('Введите целое число ≥ 0.');
                              return;
                            }
                            await updateStandalone(s.id, n);
                          }}
                        >
                          Сохранить
                        </button>
                      </div>
                    ))
                  )}
                  <div className="border border-dashed border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-2 justify-between">
                    <span className="text-[11px] font-bold text-gray-600">Добавить запись</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        disabled={busy}
                        className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold"
                        value={extraInput}
                        onChange={(e) => setExtraInput(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={busy}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-blue-600 text-white"
                        onClick={async () => {
                          const n = parseInt(extraInput.trim(), 10);
                          if (!Number.isFinite(n) || n < 1) {
                            alert('Введите целое число от 1.');
                            return;
                          }
                          await createStandalone(n, currentManagerId ?? undefined);
                          setExtraInput('1');
                        }}
                      >
                        Добавить
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {!isAdmin && currentManagerId ? (
                <p className="text-[10px] text-gray-400 mt-2">Дополнительные ЦП, не привязанные к проведённой встрече.</p>
              ) : null}
            </section>

            <section>
              <h5 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">ЦП по встречам</h5>
              {meetings.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">
                  Нет сохранённых проведённых встреч. Добавьте встречу в отчёте и сохраните отчёт.
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
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <select
                            disabled={busy}
                            className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] font-bold"
                            value={sent ? 'yes' : 'no'}
                            onChange={(e) => {
                              if (e.target.value === 'no') void applyMeetingCp(m.meetingId, false, 0);
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
            </section>

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
            <h4 className="text-xs font-black text-gray-800 uppercase tracking-widest mb-2">Количество ЦП (встреча)</h4>
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
                  await applyMeetingCp(qtyModal.meetingId, true, n);
                  setQtyModal(null);
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
      {paidAtModal && (
        <div
          className="fixed inset-0 bg-black/60 z-[635] flex items-center justify-center p-4"
          onClick={() => {
            if (!busy) setPaidAtModal(null);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-xs font-black text-gray-800 uppercase tracking-widest mb-3">Месяц оплаты ЦП</h4>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Месяц</label>
                <select
                  disabled={busy}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold"
                  value={paidAtModal.month}
                  onChange={(e) => setPaidAtModal((prev) => (prev ? { ...prev, month: e.target.value } : prev))}
                >
                  {PAID_MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Год</label>
                <select
                  disabled={busy}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold"
                  value={paidAtModal.year}
                  onChange={(e) => setPaidAtModal((prev) => (prev ? { ...prev, year: e.target.value } : prev))}
                >
                  {paidYearOptions().map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                disabled={busy}
                className="px-3 py-2 rounded-xl text-[10px] font-black uppercase border border-gray-200"
                onClick={() => setPaidAtModal(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={busy}
                className="px-3 py-2 rounded-xl text-[10px] font-black uppercase bg-blue-600 text-white"
                onClick={async () => {
                  const ym = `${paidAtModal.year}-${paidAtModal.month}`;
                  if (!/^\d{4}-\d{2}$/.test(ym)) {
                    alert('Выбери корректный месяц оплаты.');
                    return;
                  }
                  await applyClientPaid(true, `${ym}-01`);
                  setPaidAtModal(null);
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
