import { useState, useEffect, useMemo, useCallback, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import {
  Plus,
  Trash2,
  Briefcase,
  Phone,
  CheckCircle,
  Users,
  FileText,
  X,
  Save,
  Clock,
  ShieldCheck,
  CalendarCheck,
  Target,
  ShoppingBag,
  List,
  UserPlus,
  Fingerprint,
  AlertTriangle,
} from 'lucide-react';
import {
  type FormStats,
  type UiClient,
  type FullReport,
  type UiAssigned,
  type UiConducted,
  type UiOrder,
  fetchClientsApi,
  fetchReportsApi,
  createClientRow,
  saveReportToDb,
} from './lib/crmApi';

const DAILY_CALL_GOAL = 22;
const MANAGERS = ['Алексей С.', 'Мария К.', 'Иван П.', 'Елена В.'] as const;

const App = () => {
  const [currentView, setCurrentView] = useState<'manager' | 'admin' | 'orders'>('manager');
  const [currentManager, setCurrentManager] = useState<string>(MANAGERS[0]);
  const [clients, setClients] = useState<UiClient[]>([]);
  const [allReports, setAllReports] = useState<FullReport[]>([]);
  const [formStats, setFormStats] = useState<FormStats>({
    processedTotal: 0,
    newInWork: 0,
    callsTotal: 0,
    validatedTotal: 0,
  });
  const [assignedMeetings, setAssignedMeetings] = useState<UiAssigned[]>([]);
  const [conductedMeetings, setConductedMeetings] = useState<UiConducted[]>([]);
  const [confirmedOrders, setConfirmedOrders] = useState<UiOrder[]>([]);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [activeMeetingIndex, setActiveMeetingIndex] = useState<number | null>(null);
  const [meetingResultTemp, setMeetingResultTemp] = useState('');
  const [detailsModal, setDetailsModal] = useState<{
    isOpen: boolean;
    list: UiAssigned[];
    title: string;
    type: string;
    manager: string;
    reportDate: string;
  }>({ isOpen: false, list: [], title: '', type: '', manager: '', reportDate: '' });
  const [orderDetailModal, setOrderDetailModal] = useState<{
    isOpen: boolean;
    entity: string;
    bin: string;
    amounts: number[];
  }>({ isOpen: false, entity: '', bin: '', amounts: [] });
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [newClientData, setNewClientData] = useState({ name: '', bin: '' });
  const [onClientCreatedCallback, setOnClientCreatedCallback] = useState<((c: UiClient) => void) | null>(null);
  const [filterManager, setFilterManager] = useState('Все');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [booting, setBooting] = useState(true);

  const supabaseOk = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

  const refresh = useCallback(async () => {
    if (!supabaseOk) {
      setBooting(false);
      return;
    }
    setLoadError(null);
    try {
      const [c, r] = await Promise.all([fetchClientsApi(), fetchReportsApi()]);
      setClients(c);
      setAllReports(r);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setBooting(false);
    }
  }, [supabaseOk]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveReport = async () => {
    const allEntries = [...assignedMeetings, ...conductedMeetings, ...confirmedOrders];
    const invalidEntry = allEntries.find((e) => !e.bin);
    if (invalidEntry) {
      alert(
        `Контрагент "${invalidEntry.entityName || 'Неизвестно'}" не зарегистрирован. Создайте карточку через «+».`,
      );
      return;
    }
    if (!supabaseOk) {
      alert('Supabase не настроен (.env).');
      return;
    }
    setSaving(true);
    try {
      const reportDate = new Date().toISOString().split('T')[0];
      await saveReportToDb({
        reportDate,
        manager: currentManager,
        stats: { ...formStats },
        assignedMeetings,
        conductedMeetings,
        confirmedOrders,
      });
      await refresh();
      setFormStats({ processedTotal: 0, newInWork: 0, callsTotal: 0, validatedTotal: 0 });
      setAssignedMeetings([]);
      setConductedMeetings([]);
      setConfirmedOrders([]);
      setCurrentView('admin');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Сохранение не удалось');
    } finally {
      setSaving(false);
    }
  };

  const createClient = async () => {
    if (newClientData.name.trim().length < 2 || newClientData.bin.length !== 12) {
      alert('Необходимо заполнить наименование и БИН (12 цифр)');
      return;
    }
    const exists = clients.find((c) => c.bin === newClientData.bin);
    if (exists) {
      alert('Контрагент с таким БИН уже существует');
      return;
    }
    if (!supabaseOk) {
      alert('Supabase не настроен');
      return;
    }
    try {
      const newUser = await createClientRow({ name: newClientData.name.trim(), bin: newClientData.bin });
      setClients((prev) => [...prev, newUser].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
      onClientCreatedCallback?.(newUser);
      setIsClientModalOpen(false);
      setNewClientData({ name: '', bin: '' });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка создания');
    }
  };

  const findSpecificConductedEvidence = (plannedMeeting: UiAssigned, manager: string) => {
    for (const report of allReports) {
      if (report.manager !== manager) continue;
      const evidence = report.conductedMeetings.find(
        (cm) => cm.bin === plannedMeeting.bin && cm.type === plannedMeeting.type && cm.date >= plannedMeeting.date,
      );
      if (evidence) {
        return { evidence, reportDate: report.date } as { evidence: UiConducted; reportDate: string };
      }
    }
    return null;
  };

  const filteredReports = useMemo(() => {
    return allReports.filter((report) => {
      const matchManager = filterManager === 'Все' || report.manager === filterManager;
      const matchDateFrom = !filterDateFrom || report.date >= filterDateFrom;
      const matchDateTo = !filterDateTo || report.date <= filterDateTo;
      return matchManager && matchDateFrom && matchDateTo;
    });
  }, [allReports, filterManager, filterDateFrom, filterDateTo]);

  const allFilteredOrders = useMemo(() => {
    const orders: (UiOrder & { manager: string; date: string })[] = [];
    filteredReports.forEach((report) => {
      report.confirmedOrders.forEach((order) => {
        orders.push({ ...order, manager: report.manager, date: report.date });
      });
    });
    return orders;
  }, [filteredReports]);

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 text-sm">Загрузка…</div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 md:p-8 font-sans text-sm">
      <div className="max-w-7xl mx-auto space-y-6">
        {(!supabaseOk || loadError) && (
          <div
            className={`rounded-2xl p-4 text-xs font-bold ${loadError ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-red-50 text-red-800 border border-red-200'}`}
          >
            {!supabaseOk
              ? 'Скопируй .env: VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (см. env.example) и перезапусти dev.'
              : loadError}
          </div>
        )}

        <datalist id="clients-list">
          {clients.map((c, i) => (
            <option key={i} value={c.name}>
              {c.bin}
            </option>
          ))}
        </datalist>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-left">
            <div className="p-3 bg-blue-600 rounded-xl text-white shadow-inner">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800 tracking-tight">CRM Модуль</h1>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest leading-none">
                База контрагентов и аналитика · Supabase
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
            <label className="text-[10px] font-black text-gray-400 uppercase sr-only">Менеджер (отчёт)</label>
            <select
              className="px-3 py-2 bg-gray-100 rounded-xl text-xs font-bold"
              value={currentManager}
              onChange={(e) => setCurrentManager(e.target.value)}
            >
              {MANAGERS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <div className="flex bg-gray-100 p-1 rounded-xl flex-1 md:flex-none min-w-0">
              <button
                onClick={() => setCurrentView('manager')}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${currentView === 'manager' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <FileText size={14} /> ОТЧЕТ
              </button>
              <button
                onClick={() => setCurrentView('admin')}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${currentView === 'admin' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <List size={14} /> АДМИНКА
              </button>
              <button
                onClick={() => setCurrentView('orders')}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${currentView === 'orders' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <ShoppingBag size={14} /> ЗАКАЗЫ
              </button>
            </div>
          </div>
        </div>

        {currentView === 'manager' && (
          <ManagerDashboard
            stats={formStats}
            setStats={setFormStats}
            DAILY_CALL_GOAL={DAILY_CALL_GOAL}
            assignedMeetings={assignedMeetings}
            setAssignedMeetings={setAssignedMeetings}
            conductedMeetings={conductedMeetings}
            setConductedMeetings={setConductedMeetings}
            confirmedOrders={confirmedOrders}
            setConfirmedOrders={setConfirmedOrders}
            saveReport={saveReport}
            saving={saving}
            setIsMeetingModalOpen={setIsMeetingModalOpen}
            setActiveMeetingIndex={setActiveMeetingIndex}
            setMeetingResultTemp={setMeetingResultTemp}
            clients={clients}
            onOpenAddClient={(inputValue, callback) => {
              const isBin = /^\d{12}$/.test(inputValue.trim());
              setNewClientData({
                name: isBin ? '' : inputValue,
                bin: isBin ? inputValue : '',
              });
              setOnClientCreatedCallback(() => callback);
              setIsClientModalOpen(true);
            }}
          />
        )}

        {currentView === 'admin' && (
          <AdminDashboard
            reports={filteredReports}
            filterManager={filterManager}
            setFilterManager={setFilterManager}
            filterDateFrom={filterDateFrom}
            setFilterDateFrom={setFilterDateFrom}
            filterDateTo={filterDateTo}
            setFilterDateTo={setFilterDateTo}
            openDetails={(list, title, _type, manager, rDate) =>
              setDetailsModal({ isOpen: true, list, title, type: 'conversion', manager, reportDate: rDate })
            }
            findEvidence={findSpecificConductedEvidence}
          />
        )}

        {currentView === 'orders' && (
          <OrdersHistoryDashboard
            orders={allFilteredOrders}
            filterManager={filterManager}
            setFilterManager={setFilterManager}
            filterDateFrom={filterDateFrom}
            setFilterDateFrom={setFilterDateFrom}
            filterDateTo={filterDateTo}
            setFilterDateTo={setFilterDateTo}
            openOrderDetails={(entity, bin, amounts) => setOrderDetailModal({ isOpen: true, entity, bin, amounts })}
          />
        )}
      </div>

      {isClientModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-[500] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsClientModalOpen(false)}
        >
          <div
            className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8 border-b flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-3 text-blue-600">
                <UserPlus size={24} />
                <h3 className="font-black text-gray-800 text-sm uppercase tracking-widest">Новый контрагент</h3>
              </div>
              <button onClick={() => setIsClientModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2 text-left">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-2 tracking-tighter">Наименование Юр. Лица</label>
                <input
                  type="text"
                  className="w-full bg-gray-50 border-none p-4 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                  placeholder="ТОО Прогресс..."
                  value={newClientData.name}
                  onChange={(e) => setNewClientData({ ...newClientData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2 text-left">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-2 tracking-tighter">БИН / ИИН (12 цифр)</label>
                <div className="relative">
                  <Fingerprint size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input
                    type="text"
                    maxLength={12}
                    className="w-full bg-gray-50 border-none p-4 pl-12 rounded-2xl text-sm font-black focus:ring-2 focus:ring-blue-500 transition-all outline-none tracking-widest"
                    placeholder="000000000000"
                    value={newClientData.bin}
                    onChange={(e) => setNewClientData({ ...newClientData, bin: e.target.value.replace(/\D/g, '') })}
                  />
                </div>
              </div>
            </div>
            <div className="p-8 bg-gray-50 flex gap-4">
              <button
                onClick={() => setIsClientModalOpen(false)}
                className="flex-1 px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-widest"
              >
                Отмена
              </button>
              <button
                onClick={() => void createClient()}
                className="flex-1 bg-blue-600 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {isMeetingModalOpen && activeMeetingIndex != null && (
        <MeetingModal
          isOpen={isMeetingModalOpen}
          onClose={() => setIsMeetingModalOpen(false)}
          value={meetingResultTemp}
          onChange={setMeetingResultTemp}
          onSave={() => {
            if (activeMeetingIndex == null) return;
            const updated = [...conductedMeetings];
            if (updated[activeMeetingIndex]) {
              updated[activeMeetingIndex] = { ...updated[activeMeetingIndex], result: meetingResultTemp };
              setConductedMeetings(updated);
            }
            setIsMeetingModalOpen(false);
          }}
          entityName={conductedMeetings[activeMeetingIndex]?.entityName}
        />
      )}

      {detailsModal.isOpen && (
        <DetailsListModal
          modal={detailsModal}
          findEvidence={findSpecificConductedEvidence}
          onClose={() => setDetailsModal({ ...detailsModal, isOpen: false })}
        />
      )}

      {orderDetailModal.isOpen && (
        <OrderItemsModal modal={orderDetailModal} onClose={() => setOrderDetailModal({ ...orderDetailModal, isOpen: false })} />
      )}
    </div>
  );
};

type SetState<T> = Dispatch<SetStateAction<T>>;

const ManagerDashboard = ({
  stats,
  setStats,
  DAILY_CALL_GOAL,
  assignedMeetings,
  setAssignedMeetings,
  conductedMeetings,
  setConductedMeetings,
  confirmedOrders,
  setConfirmedOrders,
  saveReport,
  saving,
  setIsMeetingModalOpen,
  setActiveMeetingIndex,
  setMeetingResultTemp,
  clients,
  onOpenAddClient,
}: {
  stats: FormStats;
  setStats: SetState<FormStats>;
  DAILY_CALL_GOAL: number;
  assignedMeetings: UiAssigned[];
  setAssignedMeetings: SetState<UiAssigned[]>;
  conductedMeetings: UiConducted[];
  setConductedMeetings: SetState<UiConducted[]>;
  confirmedOrders: UiOrder[];
  setConfirmedOrders: SetState<UiOrder[]>;
  saveReport: () => void | Promise<void>;
  saving: boolean;
  setIsMeetingModalOpen: SetState<boolean>;
  setActiveMeetingIndex: SetState<number | null>;
  setMeetingResultTemp: SetState<string>;
  clients: UiClient[];
  onOpenAddClient: (input: string, cb: (c: UiClient) => void) => void;
}) => {
  const handleStatChange = (field: keyof FormStats, value: string) => {
    const numericValue = value === '' ? 0 : parseInt(value, 10);
    setStats((prev) => ({ ...prev, [field]: Number.isNaN(numericValue) ? 0 : numericValue }));
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatInput
          icon={<Briefcase size={20} className="text-blue-500" />}
          label="Отработано"
          value={stats.processedTotal}
          onChange={(v) => handleStatChange('processedTotal', v)}
        />
        <StatInput
          icon={<Users size={20} className="text-emerald-500" />}
          label="Взято новых"
          value={stats.newInWork}
          onChange={(v) => handleStatChange('newInWork', v)}
        />
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3 text-left">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-500">
              <Phone size={18} className="text-indigo-500" />
              <span className="text-[10px] font-black uppercase tracking-widest">Звонки</span>
            </div>
            <span className="text-[10px] font-black text-gray-300">ЦЕЛЬ: {DAILY_CALL_GOAL}</span>
          </div>
          <input
            type="number"
            className="w-full text-3xl font-black text-gray-800 outline-none bg-transparent"
            value={stats.callsTotal}
            onChange={(e) => handleStatChange('callsTotal', e.target.value)}
          />
        </div>
        <StatInput
          icon={<CheckCircle size={20} className="text-amber-500" />}
          label="Квалификация"
          value={stats.validatedTotal}
          onChange={(v) => handleStatChange('validatedTotal', v)}
        />
      </div>
      <MeetingTable
        title="Назначено встреч (План)"
        icon={<Clock className="text-indigo-400" />}
        data={assignedMeetings}
        setData={setAssignedMeetings}
        type="assigned"
        clients={clients}
        onOpenAddClient={onOpenAddClient}
      />
      <MeetingTable
        title="Проведено встреч (Факт)"
        icon={<CalendarCheck className="text-blue-400" />}
        data={conductedMeetings}
        setData={setConductedMeetings}
        type="conducted"
        onResultClick={(idx) => {
          setActiveMeetingIndex(idx);
          setMeetingResultTemp(conductedMeetings[idx]?.result ?? '');
          setIsMeetingModalOpen(true);
        }}
        clients={clients}
        onOpenAddClient={onOpenAddClient}
      />
      <OrdersBlock data={confirmedOrders} setData={setConfirmedOrders} clients={clients} onOpenAddClient={onOpenAddClient} />
      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={() => void saveReport()}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-12 py-4 rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-blue-200 flex items-center gap-3"
        >
          <Save size={18} /> {saving ? 'Сохранение…' : 'Сохранить отчет'}
        </button>
      </div>
    </div>
  );
};

const ContractorLookup = ({
  value,
  onSelect,
  clients,
  onOpenAddClient,
}: {
  value: string;
  onSelect: (name: string, bin: string) => void;
  clients: UiClient[];
  onOpenAddClient: (input: string, cb: (c: UiClient) => void) => void;
}) => {
  const currentClient = clients.find(
    (c) => c.name.trim().toLowerCase() === value.trim().toLowerCase() || c.bin === value.trim(),
  );
  const isNotFound = value.trim() !== '' && !currentClient;
  return (
    <div className="flex flex-col gap-1.5 text-left">
      <div className="flex gap-2 items-center">
        <div className="relative flex-grow group">
          <input
            list="clients-list"
            type="text"
            className={`w-full bg-gray-50/50 p-3 rounded-2xl text-sm font-bold outline-none focus:ring-1 transition-all ${currentClient ? 'border-emerald-100 ring-emerald-500 text-emerald-700 bg-emerald-50/20' : isNotFound ? 'ring-amber-500 border-amber-100' : 'focus:ring-blue-500'}`}
            value={currentClient ? currentClient.name : value}
            onChange={(e) => {
              const val = e.target.value;
              const found = clients.find((c) => c.name === val || c.bin === val);
              onSelect(found ? found.name : val, found ? found.bin : '');
            }}
            placeholder="Наименование или БИН..."
          />
          {currentClient && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 flex flex-col items-end leading-none animate-in fade-in zoom-in duration-300">
              <CheckCircle size={16} />
              <span className="text-[7px] font-mono font-black tracking-tighter mt-0.5">{currentClient.bin}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onOpenAddClient(value, (newClient) => onSelect(newClient.name, newClient.bin))}
          className={`p-3 border rounded-2xl transition-all shadow-sm group ${isNotFound ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-gray-100 text-blue-600 hover:bg-blue-50'}`}
          title="Создать карточку клиента"
        >
          <UserPlus size={20} className="group-active:scale-90 transition-transform" />
        </button>
      </div>
      {isNotFound && (
        <div className="flex items-center gap-1 text-[10px] text-amber-600 font-black uppercase tracking-tighter ml-2">
          <AlertTriangle size={12} />
          <span>Не найдено в базе — Создайте карточку</span>
        </div>
      )}
    </div>
  );
};

const OrdersBlock = ({
  data,
  setData,
  clients,
  onOpenAddClient,
}: {
  data: UiOrder[];
  setData: SetState<UiOrder[]>;
  clients: UiClient[];
  onOpenAddClient: (input: string, cb: (c: UiClient) => void) => void;
}) => {
  const addOrder = () =>
    setData([...data, { entityName: '', bin: '', orderCount: 1, amounts: [0], totalAmount: 0 }]);
  const updateOrder = (idx: number, field: keyof UiOrder, val: string | number) => {
    const updated = [...data];
    if (field === 'orderCount') {
      const count = Math.max(1, parseInt(String(val), 10) || 1);
      const newAmounts = [...updated[idx].amounts];
      while (newAmounts.length < count) newAmounts.push(0);
      newAmounts.length = count;
      updated[idx] = { ...updated[idx], orderCount: count, amounts: newAmounts, totalAmount: newAmounts.reduce((a, b) => a + b, 0) };
    } else {
      updated[idx] = { ...updated[idx], [field]: val } as UiOrder;
    }
    setData(updated);
  };
  return (
    <div className="bg-white border border-gray-200 rounded-[32px] p-8 shadow-sm">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4 text-left">
          <CheckCircle size={20} className="text-emerald-500" />
          <h2 className="font-black text-gray-800 text-xs uppercase tracking-widest">Заказы</h2>
        </div>
        <button type="button" onClick={addOrder} className="text-[10px] font-black text-blue-600 hover:underline uppercase">
          Добавить ЮЛ
        </button>
      </div>
      <div className="space-y-6 text-left">
        {data.map((order, oIdx) => (
          <div key={oIdx} className="bg-gray-50/50 p-6 rounded-[32px] border border-gray-100 space-y-4 relative">
            <button
              type="button"
              onClick={() => setData(data.filter((_, i) => i !== oIdx))}
              className="absolute top-4 right-4 text-gray-300 hover:text-red-500"
            >
              <Trash2 size={20} />
            </button>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 text-left">
                <label className="text-[9px] font-black text-gray-400 uppercase ml-2">Контрагент</label>
                <ContractorLookup
                  value={order.entityName}
                  onSelect={(name, bin) => {
                    const u = [...data];
                    u[oIdx] = { ...u[oIdx], entityName: name, bin };
                    setData(u);
                  }}
                  clients={clients}
                  onOpenAddClient={onOpenAddClient}
                />
              </div>
              <div className="space-y-1.5 text-left">
                <label className="text-[9px] font-black text-gray-400 uppercase ml-2">К-во заказов</label>
                <input
                  type="number"
                  min={1}
                  className="w-full bg-white border-none p-3 rounded-2xl text-sm font-black shadow-sm h-[46px]"
                  value={order.orderCount}
                  onChange={(e) => updateOrder(oIdx, 'orderCount', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
              {order.amounts.map((sum, sIdx) => (
                <div key={sIdx} className="space-y-1 text-left">
                  <label className="text-[8px] font-bold text-gray-300 uppercase ml-1">Сумма #{sIdx + 1}</label>
                  <input
                    type="text"
                    className="w-full bg-white border-none p-2 rounded-xl text-xs font-black text-right shadow-inner"
                    value={sum || ''}
                    onChange={(e) => {
                      const u = [...data];
                      u[oIdx].amounts[sIdx] = parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0;
                      u[oIdx].totalAmount = u[oIdx].amounts.reduce((a, b) => a + b, 0);
                      setData(u);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const MeetingTable = ({
  title,
  icon,
  data,
  setData,
  type,
  onResultClick,
  clients,
  onOpenAddClient,
}: {
  title: string;
  icon: ReactNode;
  data: (UiAssigned | UiConducted)[];
  setData: SetState<UiAssigned[]> | SetState<UiConducted[]>;
  type: 'assigned' | 'conducted';
  onResultClick?: (idx: number) => void;
  clients: UiClient[];
  onOpenAddClient: (input: string, cb: (c: UiClient) => void) => void;
}) => {
  const addRow = () => {
    const d = new Date().toISOString().split('T')[0];
    if (type === 'assigned') {
      (setData as SetState<UiAssigned[]>)([...(data as UiAssigned[]), { entityName: '', bin: '', date: d, type: 'Новая' }]);
    } else {
      (setData as SetState<UiConducted[]>)([
        ...(data as UiConducted[]),
        { entityName: '', bin: '', date: d, type: 'Новая', result: '' },
      ]);
    }
  };
  const removeRow = (idx: number) => {
    const next = data.filter((_, i) => i !== idx);
    if (type === 'assigned') (setData as SetState<UiAssigned[]>)(next as UiAssigned[]);
    else (setData as SetState<UiConducted[]>)(next as UiConducted[]);
  };
  const updateRow = (idx: number, field: string, val: string) => {
    const updated = [...data] as Record<string, unknown>[];
    updated[idx][field] = val;
    (setData as (u: (UiAssigned | UiConducted)[]) => void)(updated as never);
  };
  return (
    <div className="bg-white border border-gray-200 rounded-[32px] p-8 shadow-sm">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4 text-left">
          {icon}
          <h2 className="font-black text-gray-800 text-xs uppercase tracking-widest">{title}</h2>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="p-2.5 bg-gray-50 text-gray-400 rounded-2xl hover:bg-blue-600 hover:text-white"
        >
          <Plus size={20} />
        </button>
      </div>
      {data.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[9px] font-black text-gray-400 uppercase border-b border-gray-50 tracking-widest">
                <th className="pb-4">Контрагент / БИН</th>
                <th className="pb-4 w-40 px-4 text-center">Дата</th>
                <th className="pb-4 w-36 px-4 text-center">Тип</th>
                {type === 'conducted' && <th className="pb-4 w-32 text-center">Итог</th>}
                <th className="pb-4 w-10" />
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={idx}>
                  <td className="py-4 pr-2 min-w-[300px]">
                    <ContractorLookup
                      value={row.entityName}
                      onSelect={(name, bin) => {
                        updateRow(idx, 'entityName', name);
                        updateRow(idx, 'bin', bin);
                      }}
                      clients={clients}
                      onOpenAddClient={onOpenAddClient}
                    />
                  </td>
                  <td className="py-4 px-4">
                    <input
                      type="date"
                      className="w-full bg-gray-50/50 p-3 rounded-2xl text-sm font-bold h-[46px] outline-none"
                      value={row.date}
                      onChange={(e) => updateRow(idx, 'date', e.target.value)}
                    />
                  </td>
                  <td className="py-4 px-4">
                    <select
                      className="w-full bg-gray-50/50 p-3 rounded-2xl text-sm font-bold text-center h-[46px] outline-none cursor-pointer"
                      value={row.type}
                      onChange={(e) => updateRow(idx, 'type', e.target.value)}
                    >
                      <option>Новая</option>
                      <option>Повторная</option>
                    </select>
                  </td>
                  {type === 'conducted' && (
                    <td className="py-4 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => onResultClick?.(idx)}
                        className={`text-[9px] h-[46px] w-full rounded-xl font-black ${(row as UiConducted).result ? 'bg-emerald-500 text-white shadow-lg' : 'bg-gray-100 text-gray-400'}`}
                      >
                        {(row as UiConducted).result ? 'OK' : 'ВВЕСТИ'}
                      </button>
                    </td>
                  )}
                  <td className="py-4 text-right">
                    <button type="button" onClick={() => removeRow(idx)} className="text-gray-200 hover:text-red-500">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 text-center text-gray-300 text-[10px] font-black uppercase border-2 border-dashed border-gray-50 rounded-[24px]">
          Нет записей
        </div>
      )}
    </div>
  );
};

const badgeStyles: Record<'indigo' | 'blue' | 'emerald', string> = {
  indigo: 'bg-indigo-50 text-indigo-700 border border-indigo-100',
  blue: 'bg-blue-50 text-blue-700 border border-blue-100',
  emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
};

const DashboardBadge = ({ icon, count, color }: { icon: ReactNode; count: number; color: 'indigo' | 'blue' | 'emerald' }) => (
  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold ${badgeStyles[color]}`}>
    {icon} {count}
  </div>
);

const AdminDashboard = ({
  reports,
  filterManager,
  setFilterManager,
  filterDateFrom,
  setFilterDateFrom,
  filterDateTo,
  setFilterDateTo,
  openDetails,
  findEvidence,
}: {
  reports: FullReport[];
  filterManager: string;
  setFilterManager: SetState<string>;
  filterDateFrom: string;
  setFilterDateFrom: SetState<string>;
  filterDateTo: string;
  setFilterDateTo: SetState<string>;
  openDetails: (list: UiAssigned[], title: string, type: string, manager: string, rDate: string) => void;
  findEvidence: (a: UiAssigned, m: string) => { evidence: UiConducted; reportDate: string } | null;
}) => {
  const MANAGERS_LIST = ['Все', 'Алексей С.', 'Мария К.', 'Иван П.', 'Елена В.'];
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
      <AdminFilters
        manager={filterManager}
        setManager={setFilterManager}
        from={filterDateFrom}
        setFrom={setFilterDateFrom}
        to={filterDateTo}
        setTo={setFilterDateTo}
        managerOptions={MANAGERS_LIST}
      />
      <div className="bg-white border border-gray-200 rounded-3xl shadow-sm overflow-x-auto text-left">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase border-b border-gray-100">
              <th className="py-6 px-8">Дата отчета</th>
              <th className="py-6 px-4">Менеджер</th>
              <th className="py-6 px-4 text-center">План</th>
              <th className="py-6 px-4 text-center">Факт</th>
              <th className="py-6 px-4 text-center">Реализация</th>
              <th className="py-6 px-8 text-right">Выручка</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {reports.map((report) => {
              const plans = report.assignedMeetings?.length || 0;
              const conducted = report.conductedMeetings?.length || 0;
              const conversion = report.assignedMeetings?.filter((p) => findEvidence(p, report.manager)).length || 0;
              const revenue = report.confirmedOrders.reduce((a, b) => a + b.totalAmount, 0);
              return (
                <tr key={report.id} className="hover:bg-gray-50/50">
                  <td className="py-5 px-8 text-gray-500 font-medium">
                    {new Date(report.date + 'T12:00:00').toLocaleDateString('ru-RU')}
                  </td>
                  <td className="py-5 px-4 font-bold text-gray-800">{report.manager}</td>
                  <td className="py-5 px-4 text-center">
                    <DashboardBadge icon={<Clock size={12} />} count={plans} color="indigo" />
                  </td>
                  <td className="py-5 px-4 text-center">
                    <DashboardBadge icon={<CalendarCheck size={12} />} count={conducted} color="blue" />
                  </td>
                  <td className="py-5 px-4 text-center">
                    <button
                      type="button"
                      onClick={() =>
                        openDetails(report.assignedMeetings, `Анализ за ${report.date}`, 'conversion', report.manager, report.date)
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg font-black text-[10px] hover:bg-emerald-100"
                    >
                      <Target size={12} /> {conversion} <span className="opacity-40">/ {plans}</span>
                    </button>
                  </td>
                  <td className="py-5 px-8 text-right font-black text-gray-900">
                    {new Intl.NumberFormat('ru-RU').format(revenue)} ₸
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const OrdersHistoryDashboard = ({
  orders,
  filterManager,
  setFilterManager,
  filterDateFrom,
  setFilterDateFrom,
  filterDateTo,
  setFilterDateTo,
  openOrderDetails,
}: {
  orders: (UiOrder & { date: string })[];
  filterManager: string;
  setFilterManager: SetState<string>;
  filterDateFrom: string;
  setFilterDateFrom: SetState<string>;
  filterDateTo: string;
  setFilterDateTo: SetState<string>;
  openOrderDetails: (entity: string, bin: string, amounts: number[]) => void;
}) => {
  const MANAGERS_LIST = ['Все', 'Алексей С.', 'Мария К.', 'Иван П.', 'Елена В.'];
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 text-left">
      <AdminFilters
        manager={filterManager}
        setManager={setFilterManager}
        from={filterDateFrom}
        setFrom={setFilterDateFrom}
        to={filterDateTo}
        setTo={setFilterDateTo}
        managerOptions={MANAGERS_LIST}
      />
      <div className="bg-white border border-gray-200 rounded-3xl shadow-sm overflow-x-auto text-left">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-gray-50/50 text-[10px] font-black text-gray-400 border-b border-gray-100">
              <th className="py-6 px-8">Дата</th>
              <th className="py-6 px-4">БИН/ИИН</th>
              <th className="py-6 px-4">Контрагент</th>
              <th className="py-6 px-4 text-center">Кол-во</th>
              <th className="py-6 px-8 text-right">Сумма</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {orders.map((order, idx) => (
              <tr key={idx} className="hover:bg-gray-50/50 text-sm">
                <td className="py-5 px-8 text-gray-500 whitespace-nowrap">
                  {new Date(order.date + 'T12:00:00').toLocaleDateString('ru-RU')}
                </td>
                <td className="py-5 px-4 font-mono text-gray-400 text-[11px]">{order.bin}</td>
                <td className="py-5 px-4 font-black text-gray-800">{order.entityName}</td>
                <td className="py-5 px-4 text-center">
                  <button
                    type="button"
                    onClick={() => openOrderDetails(order.entityName, order.bin, order.amounts)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl font-black text-xs border border-blue-100"
                  >
                    <List size={14} /> {order.orderCount}
                  </button>
                </td>
                <td className="py-5 px-8 text-right font-black text-emerald-600">
                  {new Intl.NumberFormat('ru-RU').format(order.totalAmount)} ₸
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AdminFilters = ({
  manager,
  setManager,
  from,
  setFrom,
  to,
  setTo,
  managerOptions,
}: {
  manager: string;
  setManager: SetState<string>;
  from: string;
  setFrom: SetState<string>;
  to: string;
  setTo: SetState<string>;
  managerOptions: string[];
}) => (
  <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-wrap gap-6 items-end">
    <div className="flex-1 min-w-[200px] space-y-1.5 text-left">
      <label className="text-[10px] font-black text-gray-400 uppercase">Менеджер</label>
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
    <div className="flex-1 min-w-[150px] space-y-1.5 text-left">
      <label className="text-[10px] font-black text-gray-400 uppercase">Дата с</label>
      <input type="date" className="w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
    </div>
    <div className="flex-1 min-w-[150px] space-y-1.5 text-left">
      <label className="text-[10px] font-black text-gray-400 uppercase">Дата по</label>
      <input type="date" className="w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
    </div>
  </div>
);

const StatInput = ({
  icon,
  label,
  value,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  onChange: (v: string) => void;
}) => (
  <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3 text-left">
    <div className="flex items-center gap-2 text-gray-500">
      {icon}
      <span className="text-[10px] font-black uppercase tracking-widest leading-none">{label}</span>
    </div>
    <input
      type="number"
      min={0}
      className="w-full text-3xl font-black text-gray-800 outline-none bg-transparent"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => e.target.value === '0' && onChange('')}
      onBlur={(e) => e.target.value === '' && onChange('0')}
    />
  </div>
);

const MeetingModal = ({
  isOpen: _o,
  onClose,
  value,
  onChange,
  onSave,
  entityName,
}: {
  isOpen: boolean;
  onClose: () => void;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  entityName?: string;
}) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[300] flex items-center justify-center p-4" onClick={onClose}>
    <div
      className="bg-white rounded-[48px] shadow-2xl w-full max-w-lg overflow-hidden border border-white/20"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-10 border-b flex justify-between items-center bg-gray-50/50">
        <div>
          <h3 className="font-black text-gray-900 text-sm uppercase">{entityName}</h3>
          <p className="text-[9px] text-gray-400 font-bold uppercase mt-1">Итог встречи</p>
        </div>
        <button type="button" onClick={onClose} className="text-gray-300 hover:text-gray-500">
          <X size={24} />
        </button>
      </div>
      <div className="p-10 space-y-6 text-left">
        <textarea
          className="w-full h-56 p-6 bg-gray-50/50 border border-gray-100 rounded-[32px] outline-none text-sm font-bold"
          placeholder="О чем договорились?"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <div className="p-10 bg-gray-50 flex justify-end gap-6">
        <button type="button" onClick={onClose} className="px-6 py-2 text-[10px] font-black text-gray-400 uppercase">
          Отмена
        </button>
        <button type="button" onClick={onSave} className="bg-gray-900 text-white px-12 py-4 rounded-[20px] font-black text-[10px] uppercase">
          Сохранить
        </button>
      </div>
    </div>
  </div>
);

const DetailsListModal = ({
  modal,
  onClose,
  findEvidence,
}: {
  modal: { isOpen: boolean; list: UiAssigned[]; title: string; type: string; manager: string; reportDate: string };
  onClose: () => void;
  findEvidence: (a: UiAssigned, m: string) => { evidence: UiConducted; reportDate: string } | null;
}) => (
  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-4xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="p-8 border-b flex justify-between items-center bg-gray-50/50 text-left">
        <div>
          <h3 className="font-black text-gray-900 text-lg uppercase">{modal.title}</h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase">{modal.manager}</p>
        </div>
        <button type="button" onClick={onClose} className="p-3 hover:bg-gray-100 rounded-full text-gray-400">
          <X size={24} />
        </button>
      </div>
      <div className="p-10 overflow-y-auto max-h-[60vh] text-left">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-[10px] font-black text-gray-400 border-b">
              <th className="pb-5">Контрагент / БИН</th>
              <th className="pb-5 px-4 text-center">Тип</th>
              <th className="pb-5 px-4 text-center">Дата</th>
              <th className="pb-5 text-right">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {modal.list.map((item, idx) => {
              const isAssignedType = modal.type === 'assigned' || modal.type === 'conversion';
              const ev = isAssignedType ? findEvidence(item, modal.manager) : null;
              return (
                <tr key={idx}>
                  <td className="py-5 font-bold text-gray-800">
                    <div>{item.entityName}</div>
                    <div className="text-[9px] font-mono text-gray-400">{item.bin}</div>
                  </td>
                  <td className="py-5 px-4 text-center">
                    <span
                      className={`px-2 py-1 rounded text-[9px] font-black uppercase ${item.type === 'Новая' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
                    >
                      {item.type}
                    </span>
                  </td>
                  <td className="py-5 px-4 text-center text-gray-500 font-bold text-xs">
                    {new Date(item.date + 'T12:00:00').toLocaleDateString('ru-RU')}
                  </td>
                  <td className="py-5 text-right">
                    {isAssignedType ? (
                      ev ? (
                        <div className="flex flex-col items-end">
                          <span className="text-emerald-600 font-black text-[10px] bg-emerald-50 px-3 py-1.5 rounded-full uppercase">Выполнено</span>
                          <span className="text-[9px] text-gray-400 mt-1">Отчет от {new Date(ev.reportDate + 'T12:00:00').toLocaleDateString('ru-RU')}</span>
                        </div>
                      ) : (
                        <span className="text-amber-500 font-black text-[10px] bg-amber-50 px-3 py-1.5 rounded-full uppercase">Ожидает</span>
                      )
                    ) : (
                      <div className="max-w-[250px] text-[11px] text-gray-500 ml-auto text-right">—</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="p-8 bg-gray-50 flex justify-end">
        <button type="button" onClick={onClose} className="bg-gray-900 text-white px-12 py-3 rounded-2xl font-black text-xs uppercase">
          Закрыть
        </button>
      </div>
    </div>
  </div>
);

const OrderItemsModal = ({
  modal,
  onClose,
}: {
  modal: { isOpen: boolean; entity: string; bin: string; amounts: number[] };
  onClose: () => void;
}) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[400] flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="p-8 border-b flex justify-between items-center bg-gray-50/50 text-left">
        <div>
          <h3 className="font-black text-gray-900 text-lg uppercase">{modal.entity}</h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">БИН: {modal.bin}</p>
        </div>
        <button type="button" onClick={onClose} className="p-3 hover:bg-gray-100 rounded-full text-gray-400">
          <X size={24} />
        </button>
      </div>
      <div className="p-8 space-y-4 max-h-[50vh] overflow-y-auto text-left">
        {modal.amounts.map((amt, idx) => (
          <div key={idx} className="flex justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <span className="text-[10px] font-black text-gray-400 uppercase">Заказ №{idx + 1}</span>
            <span className="text-lg font-black text-gray-800">{new Intl.NumberFormat('ru-RU').format(amt)} ₸</span>
          </div>
        ))}
      </div>
      <div className="p-8 bg-gray-50 flex justify-end items-center gap-4 text-right">
        <span className="text-xl font-black text-emerald-600">
          {new Intl.NumberFormat('ru-RU').format(modal.amounts.reduce((a, b) => a + b, 0))} ₸
        </span>
        <button type="button" onClick={onClose} className="ml-4 bg-gray-900 text-white px-8 py-3 rounded-2xl text-xs font-black uppercase">
          Ок
        </button>
      </div>
    </div>
  </div>
);

export default App;
