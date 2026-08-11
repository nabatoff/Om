import type { Dispatch, SetStateAction } from 'react';
import { PeriodFilterFields } from './PeriodFilterFields';
import { STAFF_DEPT_OPTIONS, type StaffDept } from '../lib/staffDept';

type SetState<T> = Dispatch<SetStateAction<T>>;

type Props = {
  manager: string;
  setManager: SetState<string>;
  from: string;
  setFrom: SetState<string>;
  to: string;
  setTo: SetState<string>;
  managerOptions: string[];
  staffDept?: StaffDept;
  setStaffDept?: (dept: StaffDept) => void;
  onReset: () => void;
};

export function AdminFilters({
  manager,
  setManager,
  from,
  setFrom,
  to,
  setTo,
  managerOptions,
  staffDept = 'all',
  setStaffDept,
  onReset,
}: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
      <div className="flex flex-wrap gap-4 sm:gap-6 items-end justify-between">
        {setStaffDept ? (
          <div className="w-full sm:flex-1 sm:min-w-[160px] space-y-1.5 text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Отдел</label>
            <select
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold"
              value={staffDept}
              onChange={(e) => setStaffDept(e.target.value as StaffDept)}
            >
              {STAFF_DEPT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="w-full sm:flex-1 sm:min-w-[200px] space-y-1.5 text-left">
          <label className="text-[10px] font-bold text-gray-400 uppercase">
            {staffDept === 'diggers' ? 'Лидоруб' : staffDept === 'managers' ? 'Менеджер' : 'Сотрудник'}
          </label>
          <select
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold"
            value={manager}
            onChange={(e) => setManager(e.target.value)}
          >
            {managerOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-auto flex-none self-end">
          <button
            type="button"
            onClick={onReset}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold uppercase tracking-wider text-gray-600 hover:bg-gray-50"
          >
            Сбросить фильтр
          </button>
        </div>
      </div>
      <PeriodFilterFields from={from} to={to} setFrom={setFrom} setTo={setTo} />
    </div>
  );
}
