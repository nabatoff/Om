import { useState, useEffect, useMemo, useCallback, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import {
  Plus,
  Trash2,
  CheckCircle,
  Users,
  FileText,
  X,
  Clock,
  ShieldCheck,
  CalendarCheck,
  Target,
  ShoppingBag,
  List,
  UserPlus,
  Fingerprint,
  AlertTriangle,
  LogOut,
  LayoutGrid,
  UserCog,
  Send,
  Loader2,
  Settings,
  BarChart2,
  ClipboardCheck,
  BookOpen,
  FileSpreadsheet,
  Edit2,
  ChevronUp,
  ChevronDown,
  Download,
  ArrowRightCircle,
  Building2,
} from 'lucide-react';
import { adminDateFilterBounds, formatYmdLocal, reportDateMatchesAdminBounds } from './lib/periodBounds';
import { PeriodFilterFields } from './components/PeriodFilterFields';
import {
  type FormStats,
  type UiClient,
  type FullReport,
  type UiAssigned,
  type UiConducted,
  type UiOrder,
  type DeletedMeeting,
  fetchClientsApi,
  fetchClientsAdminApi,
  fetchClientCategoriesApi,
  fetchManagerProfilesApi,
  fetchAssigneeProfilesApi,
  setClientProfileApi,
  upsertClientCategoryApi,
  fetchAdminAnalyticsTabEnabledApi,
  fetchMrpApi,
  fetchTelegramWeeklyForecastApi,
  setClientKtp,
  recalcOrderCommissionsForClientBinApi,
  fetchDeletedMeetingsApi,
  fetchReportsApi,
  fetchStandaloneCpApi,
  type ClientStandaloneCp,
  createClientRow,
  updateClientRow,
  deleteClientByBin,
  deleteReportById,
  deleteAssignedMeetingById,
  deleteConductedMeetingById,
  restoreAssignedMeetingById,
  restoreConductedMeetingById,
  hardDeleteAssignedMeetingById,
  hardDeleteConductedMeetingById,
  saveReportToDb,
  saveKpiToDb,
  setClientCpPaid,
  setClientManager,
  setClientDigger,
  sendTelegramDailyReportNow,
  setTelegramWeeklyForecastApi,
} from './lib/crmApi';
import { buildClientCrmHistory } from './lib/crmClientHistory';
import { buildClientListRows, filterReportsForManager } from './lib/clientCpStats';
import { ClientDirectoryPanel } from './components/ClientDirectoryPanel';
import { EnsTruCheckPanel } from './components/EnsTruCheckPanel';
import { SupplierRegistryPanel } from './components/SupplierRegistryPanel';
import { GoszakupContractsPanel } from './components/GoszakupContractsPanel';
import { AdminOrderEditModal } from './components/AdminOrderEditModal';
import { AdminOrderCreateModal } from './components/AdminOrderCreateModal';
import { EnterpriseLeadsBuffer } from './components/EnterpriseLeadsBuffer';
import { EnterpriseLeadsAllPanel } from './components/EnterpriseLeadsAllPanel';
import { LeadDiggerLeadsPanel } from './components/LeadDiggerLeadsPanel';
import { LeadDiggerConversionDashboard } from './components/LeadDiggerConversionDashboard';
import { ManagerEnterpriseLeadsPanel } from './components/ManagerEnterpriseLeadsPanel';
import { DiggerTransferModal } from './components/DiggerTransferModal';
import {
  setClientBusinessScaleApi,
  listEnterpriseLeadsApi,
  leadTransferredDay,
  type EnterpriseLead,
} from './lib/enterpriseLeadsApi';
import { notifyEnterpriseLeadTelegram } from './lib/telegramEnterpriseLead';
import {
  managerOptionsForDept,
  reportMatchesStaffDept,
  type StaffDept,
} from './lib/staffDept';
import type { OrderRow } from './lib/ordersGrouping';
import { AdminSettingsPanel } from './components/AdminSettingsPanel';
import { SalesComparisonDashboard } from './components/SalesComparisonDashboard';
import {
  isNewMeetingType,
  isRepeatMeetingType,
  normalizeKpiMeetingType,
  shouldHidePlannedEnterpriseLead,
} from './lib/kpiMetrics';
import {
  buildClientKtpMap,
  countOrderLinesWithoutCommission,
  formatMoneyKzt,
  orderLineAmounts,
  resolveMergedOrdersCommissionDisplay,
  resolveOrderCommissionDisplay,
  resolveOrderCommissionTotal,
  commissionKtpSourceHint,
  validateOrderLinesAmount,
  validateOrderViaLegalEntity,
  type OrderCommissionFields,
} from './lib/commission';
import { groupOrdersByCounterparty, type GroupedCounterpartyOrder } from './lib/ordersGrouping';
import { exportOrdersToExcel } from './lib/ordersExport';
import {
  ATTRACTION_MONTH_OPTIONS,
  NEW_CATEGORY_VALUE,
  attractionMonthFromParts,
  attractionYearOptions,
  currentAttractionParts,
  emptyNewClientForm,
  newClientFormFromClient,
  type ClientCategory,
  type NewClientFormData,
} from './lib/clientProfile';
import { ClientHistoryModal } from './components/ClientHistoryModal';
import { isSupabaseConfigured, getSupabase } from './lib/supabase';
import { useAuth } from './context/AuthContext';
import { LoginView } from './components/LoginView';
import { StaffManager } from './components/StaffManager';
import { ManagerMeetingsPanel } from './components/ManagerMeetingsPanel';
import { postTelegramDailyDigestIfConfigured } from './lib/telegramDailyDigest';
import { KpiDashboard } from './components/KpiDashboard';
import { AdminFilters } from './components/AdminFilters';
import { ManagerBlockersPanel } from './components/ManagerBlockersPanel';
import { DAILY_CALL_GOAL } from './lib/kpiMetrics';

function reportStrength(r: FullReport): number {
  return (
    r.stats.processedTotal +
    r.stats.newInWork +
    r.stats.callsTotal +
    r.stats.validatedTotal +
    r.assignedMeetings.length +
    r.conductedMeetings.length +
    r.confirmedOrders.length
  );
}

function formatDisplayDate(raw: string): string {
  const t = (raw || '').trim();
  const ymd = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[3]}-${ymd[2]}-${ymd[1]}`;
  const dmyDots = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmyDots) return `${dmyDots[1].padStart(2, '0')}-${dmyDots[2].padStart(2, '0')}-${dmyDots[3]}`;
  return t;
}

type SaveReportOptions = {
  silent?: boolean;
  skipValidation?: boolean;
  refreshAfterSave?: boolean;
  /** Свежий список назначенных (обход stale state после setAssignedMeetings). */
  assignedMeetingsOverride?: UiAssigned[];
};

const LS_CURRENT_VIEW = 'om.currentView';
const LS_ADMIN_SUBVIEW = 'om.adminSubView';
const LS_MANAGER_ORDERS_SECTION = 'om.managerOrdersSection';
const LS_CLIENTS_ORDERS_SUBVIEW = 'om.clientsOrdersSubView';

type CurrentView =
  | 'manager'
  | 'admin'
  | 'orders'
  | 'clients'
  | 'clientsOrders'
  | 'registry'
  | 'goszakupContracts'
  | 'ensTru'
  | 'diggerLeads';
type ClientsOrdersSubView = 'clients' | 'orders';

function getSavedCurrentView(): CurrentView {
  const raw = localStorage.getItem(LS_CURRENT_VIEW);
  if (
    raw === 'admin' ||
    raw === 'orders' ||
    raw === 'clients' ||
    raw === 'clientsOrders' ||
    raw === 'registry' ||
    raw === 'goszakupContracts' ||
    raw === 'ensTru' ||
    raw === 'diggerLeads'
  ) {
    return raw;
  }
  return 'manager';
}

function getSavedClientsOrdersSubView(): ClientsOrdersSubView {
  return localStorage.getItem(LS_CLIENTS_ORDERS_SUBVIEW) === 'orders' ? 'orders' : 'clients';
}

function getSavedAdminSubView():
  | 'salesDashboard'
  | 'dashboard'
  | 'kpi'
  | 'staff'
  | 'meetings'
  | 'settings'
  | 'enterpriseLeads'
  | 'enterpriseLeadsAll'
  | 'diggerConversion' {
  const raw = localStorage.getItem(LS_ADMIN_SUBVIEW);
  return raw === 'salesDashboard' ||
    raw === 'dashboard' ||
    raw === 'kpi' ||
    raw === 'staff' ||
    raw === 'meetings' ||
    raw === 'settings' ||
    raw === 'enterpriseLeads' ||
    raw === 'enterpriseLeadsAll' ||
    raw === 'diggerConversion'
    ? raw
    : 'salesDashboard';
}

function getSavedManagerOrdersSection(): 'calendar' | 'meetings' | 'orders' {
  const raw = localStorage.getItem(LS_MANAGER_ORDERS_SECTION);
  return raw === 'meetings' || raw === 'orders' ? raw : 'calendar';
}

const App = () => {
  const { session, ready: authReady, managerName, signOut, isAdmin, canAdminWrite, isLeadDigger } = useAuth();
  const canManageClients = !isAdmin || canAdminWrite;
  const sessionUserId = session?.user?.id;
  const [currentView, setCurrentView] = useState<CurrentView>(() => getSavedCurrentView());
  const [clients, setClients] = useState<UiClient[]>([]);
  const [managerProfiles, setManagerProfiles] = useState<Array<{ id: string; fullName: string }>>([]);
  const [assigneeProfiles, setAssigneeProfiles] = useState<Array<{ id: string; fullName: string; role: string }>>([]);
  const [standaloneCp, setStandaloneCp] = useState<ClientStandaloneCp[]>([]);
  const [allReports, setAllReports] = useState<FullReport[]>([]);
  const [deletedMeetings, setDeletedMeetings] = useState<DeletedMeeting[]>([]);
  const [formStats, setFormStats] = useState<FormStats>({
    processedTotal: 0,
    newInWork: 0,
    callsTotal: 0,
    validatedTotal: 0,
    stageTransitions: 0,
  });
  const [assignedMeetings, setAssignedMeetings] = useState<UiAssigned[]>([]);
  const [conductedMeetings, setConductedMeetings] = useState<UiConducted[]>([]);
  const [confirmedOrders, setConfirmedOrders] = useState<UiOrder[]>([]);
  const [managerReportDate, setManagerReportDate] = useState(() => new Date().toISOString().split('T')[0]);
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
  const [adminRealizationModal, setAdminRealizationModal] = useState<{
    isOpen: boolean;
    title: string;
    rows: Array<{ manager: string; reportDate: string; entityName: string; bin: string; date: string; type: string }>;
  }>({ isOpen: false, title: '', rows: [] });
  const [orderDetailModal, setOrderDetailModal] = useState<{
    isOpen: boolean;
    entity: string;
    bin: string;
    viaBin?: string;
    viaEntityName?: string;
    amounts: number[];
    totalAmount: number;
    mrpKztApplied?: number | null;
    isKtpApplied?: boolean | null;
    commissionAmount?: number | null;
    sourceOrders?: OrderCommissionFields[];
    editableOrder?: OrderRow | null;
  }>({ isOpen: false, entity: '', bin: '', viaBin: '', viaEntityName: '', amounts: [], totalAmount: 0 });
  const [editingOrder, setEditingOrder] = useState<OrderRow | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [newClientData, setNewClientData] = useState<NewClientFormData>(() => emptyNewClientForm());
  const [clientCategories, setClientCategories] = useState<ClientCategory[]>([]);
  const [clientProfileSaving, setClientProfileSaving] = useState(false);
  const [onClientCreatedCallback, setOnClientCreatedCallback] = useState<((c: UiClient) => void) | null>(null);
  /** Если задан — модалка в режиме редактирования существующего контрагента (ключ = исходный БИН). */
  const [editingClientBin, setEditingClientBin] = useState<string | null>(null);
  const [clientHistoryFor, setClientHistoryFor] = useState<UiClient | null>(null);
  const [adminClientsFilterManager, setAdminClientsFilterManager] = useState('Все');
  const [adminFilterManager, setAdminFilterManager] = useState('Все');
  const [adminStaffDept, setAdminStaffDept] = useState<StaffDept>('all');
  const [adminFilterDateFrom, setAdminFilterDateFrom] = useState(() => adminDateFilterBounds('', '').from);
  const [adminFilterDateTo, setAdminFilterDateTo] = useState(() => adminDateFilterBounds('', '').to);
  const [ordersFilterManager, setOrdersFilterManager] = useState('Все');
  const [ordersFilterDateFrom, setOrdersFilterDateFrom] = useState(() => adminDateFilterBounds('', '').from);
  const [ordersFilterDateTo, setOrdersFilterDateTo] = useState(() => adminDateFilterBounds('', '').to);
  const [ordersFilterCounterparty, setOrdersFilterCounterparty] = useState('');
  const [ordersViewMode, setOrdersViewMode] = useState<'records' | 'byCounterparty'>('records');
  const [managerOrdersSection, setManagerOrdersSection] = useState<'calendar' | 'meetings' | 'orders'>(() =>
    getSavedManagerOrdersSection(),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [booting, setBooting] = useState(true);
  const [adminSubView, setAdminSubView] = useState<
    | 'salesDashboard'
    | 'dashboard'
    | 'kpi'
    | 'staff'
    | 'meetings'
    | 'settings'
    | 'enterpriseLeads'
    | 'enterpriseLeadsAll'
    | 'diggerConversion'
  >(() => getSavedAdminSubView());
  const [clientsOrdersSubView, setClientsOrdersSubView] = useState<ClientsOrdersSubView>(() =>
    getSavedClientsOrdersSubView(),
  );
  const [mrpKzt, setMrpKzt] = useState(4325);
  const [adminAnalyticsTabEnabled, setAdminAnalyticsTabEnabled] = useState(true);
  const [kpiFilterManager, setKpiFilterManager] = useState('Все');
  const [kpiStaffDept, setKpiStaffDept] = useState<StaffDept>('all');
  const [kpiFilterDateFrom, setKpiFilterDateFrom] = useState(() => adminDateFilterBounds('', '').from);
  const [kpiFilterDateTo, setKpiFilterDateTo] = useState(() => adminDateFilterBounds('', '').to);
  const [kpiSaving, setKpiSaving] = useState(false);
  const [telegramReportDate, setTelegramReportDate] = useState(() => formatYmdLocal(new Date()));
  const [telegramReportSending, setTelegramReportSending] = useState(false);
  const [telegramWeeklyForecastSaved, setTelegramWeeklyForecastSaved] = useState(0);
  const [telegramWeeklyForecastDraft, setTelegramWeeklyForecastDraft] = useState('');
  const [telegramWeeklyForecastSaving, setTelegramWeeklyForecastSaving] = useState(false);

  const supabaseOk = isSupabaseConfigured();

  const handleSendTelegramDailyReport = useCallback(async () => {
    if (telegramReportSending) return;
    const ymd = telegramReportDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      alert('Укажите дату отчёта');
      return;
    }
    setTelegramReportSending(true);
    try {
      const res = await sendTelegramDailyReportNow(ymd);
      const label = res.reportDateLabel ?? res.reportDate ?? ymd;
      if (res.delivery === 'both') {
        alert(`Отчёт за ${label} отправлен в Telegram: картинка и текст.`);
      } else if (res.delivery === 'photo') {
        alert(`Отчёт за ${label} отправлен в Telegram картинкой.`);
      } else if (res.imageError) {
        alert(`Отчёт за ${label} отправлен текстом (картинка не собралась: ${res.imageError}).`);
      } else {
        alert(`Отчёт за ${label} отправлен в Telegram.`);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось отправить отчёт в Telegram');
    } finally {
      setTelegramReportSending(false);
    }
  }, [telegramReportSending, telegramReportDate]);

  const saveTelegramWeeklyForecast = useCallback(async () => {
    const amount = Math.max(0, Math.floor(Number(telegramWeeklyForecastDraft.replace(/\s/g, '').replace(',', '.')) || 0));
    setTelegramWeeklyForecastSaving(true);
    try {
      await setTelegramWeeklyForecastApi(amount);
      setTelegramWeeklyForecastSaved(amount);
      setTelegramWeeklyForecastDraft(amount ? String(amount) : '');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось сохранить прогноз');
      setTelegramWeeklyForecastDraft(telegramWeeklyForecastSaved ? String(telegramWeeklyForecastSaved) : '');
    } finally {
      setTelegramWeeklyForecastSaving(false);
    }
  }, [telegramWeeklyForecastDraft, telegramWeeklyForecastSaved]);

  const forecastDirty = useMemo(() => {
    const draft = Math.max(0, Math.floor(Number(telegramWeeklyForecastDraft.replace(/\s/g, '').replace(',', '.')) || 0));
    return draft !== telegramWeeklyForecastSaved;
  }, [telegramWeeklyForecastDraft, telegramWeeklyForecastSaved]);

  const loadReports = useCallback(async (): Promise<FullReport[]> => {
    if (!supabaseOk) {
      setBooting(false);
      return [];
    }
    if (!sessionUserId) {
      setBooting(false);
      return [];
    }
    setLoadError(null);
    try {
      const [c, r, basket, standalone, mrp, analyticsTabEnabled, cats, weeklyForecast] = await Promise.all([
        isAdmin ? fetchClientsAdminApi() : fetchClientsApi(),
        fetchReportsApi(),
        isAdmin ? fetchDeletedMeetingsApi() : Promise.resolve([]),
        fetchStandaloneCpApi().catch(() => [] as ClientStandaloneCp[]),
        fetchMrpApi().catch(() => 4325),
        isAdmin ? fetchAdminAnalyticsTabEnabledApi().catch(() => true) : Promise.resolve(true),
        isAdmin ? fetchClientCategoriesApi().catch(() => [] as ClientCategory[]) : Promise.resolve([]),
        isAdmin ? fetchTelegramWeeklyForecastApi().catch(() => 0) : Promise.resolve(0),
      ]);
      setMrpKzt(mrp);
      if (isAdmin) {
        setAdminAnalyticsTabEnabled(analyticsTabEnabled);
        setClientCategories(cats);
        setTelegramWeeklyForecastSaved(weeklyForecast);
        setTelegramWeeklyForecastDraft(weeklyForecast ? String(weeklyForecast) : '');
      }
      const managers = isAdmin
        ? await fetchManagerProfilesApi().catch(() => [] as Array<{ id: string; fullName: string }>)
        : [];
      const assignees = isAdmin
        ? await fetchAssigneeProfilesApi().catch(() => [] as Array<{ id: string; fullName: string; role: string }>)
        : [];
      setClients(c);
      setManagerProfiles(managers);
      setAssigneeProfiles(assignees);
      setAllReports(r);
      setDeletedMeetings(basket);
      setStandaloneCp(standalone);
      return r;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Ошибка загрузки');
      return [];
    } finally {
      setBooting(false);
    }
  }, [supabaseOk, sessionUserId, isAdmin]);

  const refresh = useCallback(async () => {
    await loadReports();
  }, [loadReports]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isAdmin && currentView === 'admin') {
      setCurrentView('manager');
    }
    if (isAdmin && currentView === 'ensTru') {
      setCurrentView(canAdminWrite ? 'admin' : 'clientsOrders');
    }
    if (!isAdmin && currentView === 'clientsOrders') {
      setCurrentView('clients');
    }
    if (!isAdmin && currentView === 'registry') {
      setCurrentView('manager');
    }
    if (!isAdmin && currentView === 'goszakupContracts') {
      setCurrentView('manager');
    }
    if (isAdmin && !canAdminWrite && currentView === 'goszakupContracts') {
      setCurrentView('clientsOrders');
    }
    if (isAdmin && currentView === 'clients') {
      setCurrentView('clientsOrders');
      setClientsOrdersSubView('clients');
    }
    if (isAdmin && currentView === 'orders') {
      setCurrentView('clientsOrders');
      setClientsOrdersSubView('orders');
    }
    if (!isLeadDigger && currentView === 'diggerLeads') {
      setCurrentView('manager');
    }
    if (isAdmin && currentView === 'manager') {
      setCurrentView('admin');
      if (!canAdminWrite) setAdminSubView('kpi');
    }
    if (isAdmin && !canAdminWrite && currentView === 'admin') {
      const allowed: typeof adminSubView[] = ['kpi', 'diggerConversion', 'enterpriseLeadsAll'];
      if (!allowed.includes(adminSubView)) {
        setAdminSubView('kpi');
      }
    }
  }, [isAdmin, canAdminWrite, currentView, adminSubView]);

  useEffect(() => {
    localStorage.setItem(LS_CURRENT_VIEW, currentView);
  }, [currentView]);

  useEffect(() => {
    localStorage.setItem(LS_ADMIN_SUBVIEW, adminSubView);
  }, [adminSubView]);

  useEffect(() => {
    localStorage.setItem(LS_CLIENTS_ORDERS_SUBVIEW, clientsOrdersSubView);
  }, [clientsOrdersSubView]);

  useEffect(() => {
    localStorage.setItem(LS_MANAGER_ORDERS_SECTION, managerOrdersSection);
  }, [managerOrdersSection]);

  useEffect(() => {
    if (!isClientModalOpen || !isAdmin) return;
    void fetchClientCategoriesApi()
      .then(setClientCategories)
      .catch(() => setClientCategories([]));
  }, [isClientModalOpen, isAdmin]);

  useEffect(() => {
    if (currentView !== 'admin' || !canAdminWrite) return;
    setAdminSubView('salesDashboard');
  }, [currentView, canAdminWrite]);

  useEffect(() => {
    if (!adminAnalyticsTabEnabled && adminSubView === 'dashboard') {
      setAdminSubView('salesDashboard');
    }
  }, [adminAnalyticsTabEnabled, adminSubView]);

  useEffect(() => {
    if (currentView !== 'orders') {
      setManagerOrdersSection('calendar');
    }
  }, [currentView]);

  const managerFilterOptions = useMemo(() => {
    const set = new Set<string>();
    allReports.forEach((r) => {
      if (r.manager) set.add(r.manager);
    });
    return ['Все', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))];
  }, [allReports]);

  const adminDeptManagerOptions = useMemo(
    () => managerOptionsForDept(allReports, adminStaffDept, assigneeProfiles),
    [allReports, adminStaffDept, assigneeProfiles],
  );

  const kpiDeptManagerOptions = useMemo(
    () => managerOptionsForDept(allReports, kpiStaffDept, assigneeProfiles),
    [allReports, kpiStaffDept, assigneeProfiles],
  );

  const adminDeptReports = useMemo(
    () => allReports.filter((r) => reportMatchesStaffDept(r, adminStaffDept, assigneeProfiles)),
    [allReports, adminStaffDept, assigneeProfiles],
  );

  const kpiDeptReports = useMemo(
    () => allReports.filter((r) => reportMatchesStaffDept(r, kpiStaffDept, assigneeProfiles)),
    [allReports, kpiStaffDept, assigneeProfiles],
  );

  const managerReportForDate = useMemo(() => {
    if (!sessionUserId) return null;
    const matches = allReports.filter(
      (r) => r.date === managerReportDate && (r.managerId === sessionUserId || (!r.managerId && r.manager === managerName)),
    );
    if (matches.length === 0) return null;
    return matches.reduce((best, cur) => {
      const bestScore = reportStrength(best);
      const curScore = reportStrength(cur);
      if (curScore !== bestScore) return curScore > bestScore ? cur : best;
      return cur.id > best.id ? cur : best;
    });
  }, [allReports, managerReportDate, managerName, sessionUserId]);

  useEffect(() => {
    if (currentView !== 'manager') return;
    if (managerReportForDate) {
      setFormStats({ ...managerReportForDate.stats });
      setAssignedMeetings([...managerReportForDate.assignedMeetings]);
      setConductedMeetings([...managerReportForDate.conductedMeetings]);
      setConfirmedOrders([...managerReportForDate.confirmedOrders]);
      return;
    }
    setFormStats({ processedTotal: 0, newInWork: 0, callsTotal: 0, validatedTotal: 0, stageTransitions: 0 });
    setAssignedMeetings([]);
    setConductedMeetings([]);
    setConfirmedOrders([]);
  }, [currentView, managerReportForDate]);

  const saveReport = async (options: SaveReportOptions = {}): Promise<boolean> => {
    const {
      silent = false,
      skipValidation = false,
      refreshAfterSave = true,
      assignedMeetingsOverride,
    } = options;
    const assignedRaw = assignedMeetingsOverride ?? assignedMeetings;
    const conductedPool = [...conductedMeetings, ...allReports.flatMap((r) => r.conductedMeetings)];
    const assignedForSave = assignedRaw.filter((m) => !shouldHidePlannedEnterpriseLead(m, conductedPool));
    const allEntries = [...assignedForSave, ...conductedMeetings, ...confirmedOrders];
    const invalidEntry = allEntries.find((e) => !e.bin);
    if (invalidEntry && !skipValidation) {
      if (!silent) {
        alert(
          `Контрагент "${invalidEntry.entityName || 'Неизвестно'}" не зарегистрирован. Создайте карточку через «+».`,
        );
      }
      return false;
    }
    if (!supabaseOk) {
      if (!silent) alert('Supabase не настроен (.env).');
      return false;
    }
    if (!skipValidation) {
      for (const o of confirmedOrders) {
        if (!o.bin) continue;
        const vVia = validateOrderViaLegalEntity(o.viaEntityName, o.viaBin);
        if (!vVia.ok) {
          if (!silent) alert(vVia.message);
          return false;
        }
        const v = validateOrderLinesAmount(o.amounts, o.totalAmount, mrpKzt);
        if (!v.ok) {
          if (!silent) alert(v.message);
          return false;
        }
      }
    }
    setSaving(true);
    try {
      await saveReportToDb({
        reportId: managerReportForDate?.id,
        reportDate: managerReportDate,
        stats: { ...formStats },
        assignedMeetings: assignedForSave,
        conductedMeetings,
        confirmedOrders,
      });
      const webhook = (import.meta.env.VITE_TELEGRAM_REPORT_WEBHOOK_URL ?? '').trim();
      let latestReports: FullReport[] = allReports;
      if (refreshAfterSave || webhook) latestReports = await loadReports();
      if (webhook) {
        try {
          const dayLeads = await listEnterpriseLeadsApi('all').catch(() => [] as EnterpriseLead[]);
          const transferMap = new Map<string, number>();
          for (const l of dayLeads) {
            if (leadTransferredDay(l) !== managerReportDate) continue;
            const name = (l.creatorName || '').trim() || '—';
            transferMap.set(name, (transferMap.get(name) || 0) + 1);
          }
          await postTelegramDailyDigestIfConfigured(
            latestReports,
            managerReportDate,
            assigneeProfiles,
            Array.from(transferMap.entries()).map(([diggerName, count]) => ({ diggerName, count })),
          );
        } catch (err) {
          console.error('[telegram digest]', err);
        }
      }
      if (isAdmin) setCurrentView('admin');
      return true;
    } catch (e) {
      if (!silent) alert(e instanceof Error ? e.message : 'Сохранение не удалось');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveKpi = useCallback(
    async (nextStats: FormStats) => {
      if (!supabaseOk || currentView !== 'manager') return;
      const isAllZero =
        nextStats.processedTotal === 0 &&
        nextStats.newInWork === 0 &&
        nextStats.callsTotal === 0 &&
        nextStats.validatedTotal === 0 &&
        nextStats.stageTransitions === 0;
      if (isAllZero && !managerReportForDate?.id) return;
      setKpiSaving(true);
      try {
        await saveKpiToDb({
          reportId: managerReportForDate?.id,
          reportDate: managerReportDate,
          processedTotal: nextStats.processedTotal,
          newInWork: nextStats.newInWork,
          callsTotal: nextStats.callsTotal,
          validatedTotal: nextStats.validatedTotal,
          stageTransitions: nextStats.stageTransitions,
        });
      } catch (e) {
        console.error(e);
      } finally {
        setKpiSaving(false);
      }
    },
    [supabaseOk, currentView, managerReportForDate?.id, managerReportDate],
  );

  const resolveClientCategoryId = async (): Promise<string | null> => {
    if (newClientData.categoryId === NEW_CATEGORY_VALUE) {
      const catName = newClientData.newCategoryName.trim();
      if (catName.length < 2) {
        throw new Error('Укажите название новой категории (не менее 2 символов)');
      }
      return upsertClientCategoryApi(catName);
    }
    return newClientData.categoryId || null;
  };

  const buildClientProfileFields = () => {
    const gzRaw = newClientData.gzTurnoverPrevYear.trim();
    const gzTurnoverPrevYear = gzRaw ? Math.max(0, Math.floor(Number(gzRaw.replace(/\s/g, '')) || 0)) : null;
    const attractionMonth = attractionMonthFromParts(newClientData.attractionYear, newClientData.attractionMonth);
    return { gzTurnoverPrevYear, attractionMonth };
  };

  const saveClientModal = async () => {
    if (!canManageClients) return;
    if (newClientData.name.trim().length < 2 || newClientData.bin.length !== 12) {
      alert('Необходимо заполнить наименование и БИН (12 цифр)');
      return;
    }
    if (!supabaseOk) {
      alert('Supabase не настроен');
      return;
    }
    const name = newClientData.name.trim();
    const bin = newClientData.bin.replace(/\D/g, '');
    const managerId = isAdmin
      ? (assigneeProfiles.find((p) => p.id === newClientData.managerId)?.role === 'manager'
          ? newClientData.managerId || null
          : null)
      : isLeadDigger
        ? null
        : (sessionUserId ?? null);
    const diggerId = isAdmin
      ? (assigneeProfiles.find((p) => p.id === newClientData.managerId)?.role === 'lead_digger'
          ? newClientData.managerId || null
          : null)
      : isLeadDigger
        ? (sessionUserId ?? null)
        : null;
    if (isAdmin && !editingClientBin && !managerId && !diggerId) {
      alert('Для нового контрагента выберите менеджера или лидоруба.');
      return;
    }
    const openedFromInlinePicker = Boolean(onClientCreatedCallback);
    try {
      let profileFields: {
        categoryId: string | null;
        gzTurnoverPrevYear: number | null;
        attractionMonth: string | null;
      };
      if (isAdmin) {
        const categoryId = await resolveClientCategoryId();
        const { gzTurnoverPrevYear, attractionMonth } = buildClientProfileFields();
        profileFields = { categoryId, gzTurnoverPrevYear, attractionMonth };
      } else {
        const { year, month } = currentAttractionParts();
        profileFields = {
          categoryId: null,
          gzTurnoverPrevYear: null,
          attractionMonth: attractionMonthFromParts(year, month),
        };
      }
      const { categoryId } = profileFields;
      if (editingClientBin) {
        if (bin !== editingClientBin && clients.some((c) => c.bin === bin)) {
          alert('Контрагент с таким БИН уже существует');
          return;
        }
        const existing = clients.find((c) => c.bin === editingClientBin);
        const updatedClient = await updateClientRow(editingClientBin, {
          name,
          bin,
          ...(isAdmin ? profileFields : {}),
          categoryName:
            clientCategories.find((c) => c.id === categoryId)?.name ?? existing?.categoryName ?? null,
        });
        if (isAdmin) {
          if (managerId) await setClientManager(bin, managerId);
          if (diggerId) await setClientDigger(bin, diggerId);
        }
        if ((isLeadDigger || canAdminWrite) && newClientData.businessScale === 'enterprise') {
          const leadId = await setClientBusinessScaleApi(bin, 'enterprise');
          if (leadId) {
            void notifyEnterpriseLeadTelegram({
              clientName: name,
              bin,
              creatorName: managerName,
            }).catch((e) => console.error(e));
          }
        }
        const merged = {
          ...updatedClient,
          ...profileFields,
          businessScale: newClientData.businessScale,
          categoryName:
            clientCategories.find((c) => c.id === categoryId)?.name ?? updatedClient.categoryName ?? null,
          managerId: managerId ?? updatedClient.managerId ?? null,
          managerName: managerId
            ? (assigneeProfiles.find((m) => m.id === managerId)?.fullName
              ?? managerProfiles.find((m) => m.id === managerId)?.fullName
              ?? null)
            : (updatedClient.managerName ?? null),
          diggerId: diggerId ?? updatedClient.diggerId ?? null,
          diggerName: diggerId
            ? (assigneeProfiles.find((m) => m.id === diggerId)?.fullName ?? null)
            : (updatedClient.diggerName ?? null),
        };
        setClients((prev) =>
          prev
            .map((c) => (c.bin === editingClientBin ? merged : c))
            .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
        );
        setClientHistoryFor((prev) =>
          prev?.bin === editingClientBin || prev?.bin === bin ? { ...prev, ...merged } : prev,
        );
        setOnClientCreatedCallback(null);
      } else {
        const exists = clients.find((c) => c.bin === bin);
        if (exists) {
          alert('Контрагент с таким БИН уже существует');
          return;
        }
        const newUser = await createClientRow({
          name,
          bin,
          managerId,
          diggerId,
          ...profileFields,
          businessScale: 'smb',
          categoryName: clientCategories.find((c) => c.id === categoryId)?.name ?? null,
        });
        if (isAdmin) {
          if (managerId) await setClientManager(bin, managerId);
          if (diggerId) await setClientDigger(bin, diggerId);
        }
        if ((isLeadDigger || canAdminWrite) && newClientData.businessScale === 'enterprise') {
          const leadId = await setClientBusinessScaleApi(bin, 'enterprise');
          if (leadId) {
            void notifyEnterpriseLeadTelegram({
              clientName: name,
              bin,
              creatorName: managerName,
            }).catch((e) => console.error(e));
          }
          newUser.businessScale = 'enterprise';
        }
        setClients((prev) => {
          if (prev.some((c) => c.bin === newUser.bin)) return prev;
          return [...prev, newUser].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        });
        onClientCreatedCallback?.(newUser);
        setOnClientCreatedCallback(null);
      }
      if (!openedFromInlinePicker) {
        await refresh();
      }
      setIsClientModalOpen(false);
      setEditingClientBin(null);
      setNewClientData(emptyNewClientForm());
    } catch (e) {
      alert(e instanceof Error ? e.message : editingClientBin ? 'Ошибка сохранения' : 'Ошибка создания');
    }
  };

  const saveClientProfile = useCallback(
    async (
      bin: string,
      profile: {
        categoryId: string | null;
        newCategoryName?: string;
        gzTurnoverPrevYear: number | null;
        attractionMonth: string | null;
      },
    ) => {
      if (!canAdminWrite) return;
      setClientProfileSaving(true);
      try {
        let categoryId = profile.categoryId;
        let cats = clientCategories;
        if (profile.newCategoryName) {
          categoryId = await upsertClientCategoryApi(profile.newCategoryName);
          cats = await fetchClientCategoriesApi();
          setClientCategories(cats);
        }
        await setClientProfileApi(bin, {
          categoryId,
          gzTurnoverPrevYear: profile.gzTurnoverPrevYear,
          attractionMonth: profile.attractionMonth,
        });
        const categoryName = cats.find((c) => c.id === categoryId)?.name ?? null;
        const patch = {
          categoryId,
          categoryName,
          gzTurnoverPrevYear: profile.gzTurnoverPrevYear,
          attractionMonth: profile.attractionMonth,
        };
        setClients((prev) => prev.map((c) => (c.bin === bin ? { ...c, ...patch } : c)));
        setClientHistoryFor((prev) => (prev?.bin === bin ? { ...prev, ...patch } : prev));
        await refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Не удалось сохранить профиль');
      } finally {
        setClientProfileSaving(false);
      }
    },
    [canAdminWrite, clientCategories, refresh],
  );

  const assignClientManager = useCallback(
    async (bin: string, managerId: string | null) => {
      if (!canAdminWrite) return;
      await setClientManager(bin, managerId);
      setClients((prev) =>
        prev.map((c) =>
          c.bin === bin
            ? {
                ...c,
                managerId,
                managerName: managerProfiles.find((m) => m.id === managerId)?.fullName ?? null,
              }
            : c,
        ),
      );
    },
    [canAdminWrite, managerProfiles],
  );

  const toggleClientKtp = useCallback(
    async (bin: string, isKtp: boolean) => {
      if (!supabaseOk) return;
      try {
        await setClientKtp(bin, isKtp);
        await recalcOrderCommissionsForClientBinApi(bin);
        setClients((prev) => prev.map((c) => (c.bin === bin ? { ...c, isKtp } : c)));
        await refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Не удалось обновить КТП');
      }
    },
    [supabaseOk, refresh],
  );

  const toggleClientPaid = useCallback(
    async (bin: string, paid: boolean, paidAt?: string | null) => {
      if (!canAdminWrite) return;
      await setClientCpPaid(bin, paid, paidAt);
      setClients((prev) =>
        prev.map((c) => (c.bin === bin ? { ...c, cpPaid: paid, cpPaidAt: paid ? (paidAt ?? null) : null } : c)),
      );
    },
    [isAdmin],
  );

  const removeClient = async (client: UiClient) => {
    if (!canAdminWrite) return;
    const ok = window.confirm(
      `Удалить контрагента "${client.name}" (${client.bin})?\n\nЕсли он используется в отчётах, удаление может быть запрещено.`,
    );
    if (!ok) return;
    try {
      await deleteClientByBin(client.bin);
      setClientHistoryFor((prev) => (prev?.bin === client.bin ? null : prev));
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось удалить контрагента');
    }
  };

  const removeReport = async (reportId: string) => {
    if (!canAdminWrite) return;
    const ok = window.confirm(
      `Удалить отчёт ${reportId.slice(0, 8)}?\n\nБудут удалены связанные встречи и сделки (если настроено каскадное удаление).`,
    );
    if (!ok) return;
    try {
      await deleteReportById(reportId);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось удалить отчёт');
    }
  };

  const removeAdminMeeting = async (row: {
    source: 'assigned' | 'conducted';
    id?: string;
    entityName: string;
    bin?: string;
    type?: string;
    manager?: string;
    date: string;
  }) => {
    if (!canAdminWrite) return;
    const normalizeText = (value: string) => value.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
    const normalizeBin = (value: string) => value.replace(/\D/g, '');
    const sameCounterparty = (aName: string, aBin: string, bName: string, bBin: string) => {
      const a = normalizeBin(aBin);
      const b = normalizeBin(bBin);
      if (a && b) return a === b;
      return normalizeText(aName) === normalizeText(bName);
    };
    const sameType = (a: string, b: string) => normalizeKpiMeetingType(a) === normalizeKpiMeetingType(b);

    const manager = row.manager ?? '';
    const rowType = row.type ?? '';
    const rowBin = row.bin ?? '';
    const rowDate = row.date;

    let linkedAssigned: UiAssigned | null = null;
    let linkedConducted: UiConducted | null = null;

    if (row.source === 'assigned') {
      for (const report of allReports) {
        if ((report.manager || '') !== manager) continue;
        const candidates = report.conductedMeetings
          .filter(
            (m) =>
              sameCounterparty(m.entityName, m.bin, row.entityName, rowBin) &&
              sameType(m.type, rowType) &&
              m.date >= rowDate,
          )
          .sort((a, b) => a.date.localeCompare(b.date));
        if (candidates.length > 0) {
          linkedConducted = candidates[0]!;
          break;
        }
      }
    } else {
      for (const report of allReports) {
        if ((report.manager || '') !== manager) continue;
        const candidates = report.assignedMeetings
          .filter(
            (m) =>
              sameCounterparty(m.entityName, m.bin, row.entityName, rowBin) &&
              sameType(m.type, rowType) &&
              m.date <= rowDate,
          )
          .sort((a, b) => b.date.localeCompare(a.date));
        if (candidates.length > 0) {
          linkedAssigned = candidates[0]!;
          break;
        }
      }
    }

    const assignedId = row.source === 'assigned' ? row.id : linkedAssigned?.id;
    const conductedId = row.source === 'conducted' ? row.id : linkedConducted?.id;

    const hasAssigned = Boolean(assignedId);
    const hasConducted = Boolean(conductedId);
    if (!hasAssigned && !hasConducted) {
      alert('Не удалось удалить: у встречи отсутствуют id для удаления.');
      return;
    }

    let deleteAssigned = false;
    let deleteConducted = false;

    if (hasAssigned && hasConducted) {
      const choice = window.prompt(
        [
          `Выбери, что удалить по "${row.entityName}" (${formatDisplayDate(row.date)}):`,
          '1 — только назначенную встречу',
          '2 — только проведенную встречу',
          '3 — удалить обе',
          '',
          'Введи 1, 2 или 3 (пусто = отмена).',
        ].join('\n'),
      );
      if (!choice) return;
      if (choice === '1') deleteAssigned = true;
      else if (choice === '2') deleteConducted = true;
      else if (choice === '3') {
        deleteAssigned = true;
        deleteConducted = true;
      } else {
        alert('Неверный выбор. Введи 1, 2 или 3.');
        return;
      }
    } else if (hasAssigned) {
      const ok = window.confirm(
        `Удалить назначенную встречу "${row.entityName}" от ${formatDisplayDate(row.date)}?\n\nДействие необратимо.`,
      );
      if (!ok) return;
      deleteAssigned = true;
    } else if (hasConducted) {
      const ok = window.confirm(
        `Удалить проведенную встречу "${row.entityName}" от ${formatDisplayDate(row.date)}?\n\nДействие необратимо.`,
      );
      if (!ok) return;
      deleteConducted = true;
    }

    try {
      if (deleteAssigned && assignedId) await deleteAssignedMeetingById(assignedId);
      if (deleteConducted && conductedId) await deleteConductedMeetingById(conductedId);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось удалить встречу');
    }
  };

  const restoreAdminMeeting = async (row: DeletedMeeting) => {
    if (!canAdminWrite) return;
    try {
      if (row.source === 'assigned') await restoreAssignedMeetingById(row.id);
      else await restoreConductedMeetingById(row.id);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось восстановить встречу');
    }
  };

  const hardDeleteAdminMeeting = async (row: DeletedMeeting) => {
    if (!canAdminWrite) return;
    const ok = window.confirm(
      `Удалить навсегда "${row.entityName}" (${formatDisplayDate(row.date)})?\n\nЭто действие необратимо.`,
    );
    if (!ok) return;
    try {
      if (row.source === 'assigned') await hardDeleteAssignedMeetingById(row.id);
      else await hardDeleteConductedMeetingById(row.id);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось удалить встречу навсегда');
    }
  };

  const findSpecificConductedEvidence = (plannedMeeting: UiAssigned, manager: string) => {
    for (const report of allReports) {
      if (report.manager !== manager) continue;
      const evidence = report.conductedMeetings.find(
        (cm) =>
          cm.bin === plannedMeeting.bin &&
          cm.type === plannedMeeting.type &&
          cm.entityName.trim().toLowerCase() === plannedMeeting.entityName.trim().toLowerCase() &&
          cm.date >= plannedMeeting.date,
      );
      if (evidence) {
        return { evidence, reportDate: report.date } as { evidence: UiConducted; reportDate: string };
      }
    }
    return null;
  };

  const filteredReports = useMemo(() => {
    const bounds = adminDateFilterBounds(adminFilterDateFrom, adminFilterDateTo);
    return adminDeptReports.filter((report) => {
      const matchManager = adminFilterManager === 'Все' || report.manager === adminFilterManager;
      return matchManager && reportDateMatchesAdminBounds(report.date, bounds);
    });
  }, [adminDeptReports, adminFilterManager, adminFilterDateFrom, adminFilterDateTo]);

  const kpiFilteredReports = useMemo(() => {
    const bounds = adminDateFilterBounds(kpiFilterDateFrom, kpiFilterDateTo);
    return kpiDeptReports.filter((report) => {
      const matchManager = kpiFilterManager === 'Все' || report.manager === kpiFilterManager;
      return matchManager && reportDateMatchesAdminBounds(report.date, bounds);
    });
  }, [kpiDeptReports, kpiFilterManager, kpiFilterDateFrom, kpiFilterDateTo]);

  /** Админ: как в аналитике. Менеджер: RLS отдаёт только свои отчёты; фильтр по датам. */
  const reportsForOrders = useMemo(() => {
    if (isAdmin) {
      return allReports.filter((r) => {
        const matchManager = ordersFilterManager === 'Все' || r.manager === ordersFilterManager;
        const matchDateFrom = !ordersFilterDateFrom || r.date >= ordersFilterDateFrom;
        const matchDateTo = !ordersFilterDateTo || r.date <= ordersFilterDateTo;
        return matchManager && matchDateFrom && matchDateTo;
      });
    }
    return allReports.filter((r) => {
      const matchDateFrom = !ordersFilterDateFrom || r.date >= ordersFilterDateFrom;
      const matchDateTo = !ordersFilterDateTo || r.date <= ordersFilterDateTo;
      return matchDateFrom && matchDateTo;
    });
  }, [isAdmin, allReports, ordersFilterManager, ordersFilterDateFrom, ordersFilterDateTo]);

  const allOrdersByDateAndManager = useMemo(() => {
    const orders: OrderRow[] = [];
    reportsForOrders.forEach((report) => {
      report.confirmedOrders.forEach((order) => {
        orders.push({ ...order, manager: report.manager, date: report.date, reportId: report.id });
      });
    });
    return orders;
  }, [reportsForOrders]);

  const ordersCounterpartyOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const o of allOrdersByDateAndManager) {
      const key = `${o.entityName.trim().toLowerCase()}|${o.bin.trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`${o.entityName} (${o.bin})`);
    }
    return out.sort((a, b) => a.localeCompare(b, 'ru'));
  }, [allOrdersByDateAndManager]);

  const allFilteredOrders = useMemo(() => {
    const orders = allOrdersByDateAndManager;
    const qRaw = ordersFilterCounterparty.trim().toLowerCase();
    if (!qRaw) return orders;
    const qDigits = qRaw.replace(/\D/g, '');
    return orders.filter((o) => {
      const byName = o.entityName.toLowerCase().includes(qRaw);
      const byBin = qDigits.length > 0 && o.bin.replace(/\D/g, '').includes(qDigits);
      return byName || byBin;
    });
  }, [allOrdersByDateAndManager, ordersFilterCounterparty]);

  const groupedFilteredOrders = useMemo(
    () => groupOrdersByCounterparty(allFilteredOrders),
    [allFilteredOrders],
  );

  const clientKtpByBin = useMemo(() => buildClientKtpMap(clients), [clients]);

  const reportsForClientScope = useMemo(() => {
    if (isAdmin) return allReports;
    return filterReportsForManager(allReports, sessionUserId, managerName);
  }, [allReports, isAdmin, sessionUserId, managerName]);

  const managerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of allReports) {
      if (r.managerId && r.manager) map.set(r.managerId, r.manager);
    }
    for (const s of standaloneCp) {
      if (!map.has(s.managerId)) {
        const rep = allReports.find((r) => r.managerId === s.managerId);
        if (rep?.manager) map.set(s.managerId, rep.manager);
      }
    }
    return map;
  }, [allReports, standaloneCp]);

  const clientListRows = useMemo(
    () =>
      buildClientListRows(allReports, clients, standaloneCp, {
        managerId: isAdmin ? undefined : sessionUserId,
        managerName: isAdmin ? undefined : managerName,
        allCatalog: isAdmin,
        managerNameById,
      }),
    [allReports, clients, standaloneCp, isAdmin, sessionUserId, managerName, managerNameById],
  );

  const adminClientManagerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of clientListRows) {
      for (const m of r.managerNames) {
        if (m) set.add(m);
      }
    }
    return ['Все', 'Не назначен', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))];
  }, [clientListRows]);

  const visibleClientRows = useMemo(() => {
    if (!isAdmin || adminClientsFilterManager === 'Все') return clientListRows;
    if (adminClientsFilterManager === 'Не назначен') return clientListRows.filter((r) => !r.managerId);
    return clientListRows.filter((r) => r.managerNames.includes(adminClientsFilterManager));
  }, [clientListRows, isAdmin, adminClientsFilterManager]);

  const clientHistoryAggregated = useMemo(
    () =>
      clientHistoryFor
        ? buildClientCrmHistory(clientHistoryFor.bin, reportsForClientScope)
        : { conducted: [], orders: [] },
    [clientHistoryFor, reportsForClientScope],
  );

  if (supabaseOk && !authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f6f8] text-gray-500 text-sm">Сессия…</div>
    );
  }
  if (supabaseOk && !session) {
    return <LoginView />;
  }
  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f6f8] text-gray-500 text-sm">Загрузка…</div>
    );
  }

  const navPill = (active: boolean) =>
    `om-pill ${active ? 'om-pill-active' : ''}`;

  const isAdminUtilityView =
    currentView === 'admin' && (adminSubView === 'staff' || adminSubView === 'settings');
  const isAdminCoreView = currentView === 'admin' && !isAdminUtilityView;

  return (
    <div className="om-page min-h-screen flex flex-col">
      <header className="om-header">
        <div className="om-header-inner">
          <div className="flex items-center justify-between h-14 sm:h-16 border-b border-gray-100 gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="bg-blue-600 text-white p-1.5 sm:p-2 rounded-lg shrink-0">
                <ShieldCheck size={20} />
              </div>
              <div className="min-w-0">
                <span className="block text-base sm:text-lg font-bold text-gray-900 truncate">Модуль отчетов</span>
                <span className="block sm:hidden text-[10px] font-bold text-gray-400 truncate">{managerName}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              {isAdmin && canAdminWrite ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentView('admin');
                      setAdminSubView('staff');
                    }}
                    className={`inline-flex items-center gap-1.5 sm:gap-2 text-sm font-medium border px-2 sm:px-3 py-1.5 rounded-lg min-h-10 transition ${
                      currentView === 'admin' && adminSubView === 'staff'
                        ? 'border-blue-200 bg-blue-50 text-blue-800'
                        : 'border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                    title="Сотрудники"
                  >
                    <UserCog size={16} />
                    <span className="hidden md:inline">Сотрудники</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentView('admin');
                      setAdminSubView('settings');
                    }}
                    className={`inline-flex items-center gap-1.5 sm:gap-2 text-sm font-medium border px-2 sm:px-3 py-1.5 rounded-lg min-h-10 transition ${
                      currentView === 'admin' && adminSubView === 'settings'
                        ? 'border-blue-200 bg-blue-50 text-blue-800'
                        : 'border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                    title="Настройки"
                  >
                    <Settings size={16} />
                    <span className="hidden md:inline">Настройки</span>
                  </button>
                </>
              ) : null}
              <div className="text-right hidden sm:flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Менеджер (Отчёт)</span>
                <span className="text-sm font-bold text-gray-800">{managerName}</span>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition font-medium border border-gray-200 px-2.5 sm:px-3 py-1.5 rounded-lg min-h-10"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">Выйти</span>
              </button>
            </div>
          </div>

          <div className="py-2">
            <div className="om-pill-track">
              {!isAdmin && (
                <button type="button" onClick={() => setCurrentView('manager')} className={navPill(currentView === 'manager')}>
                  <FileText size={16} /> Отчёт
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentView('admin');
                    setAdminSubView(canAdminWrite ? 'salesDashboard' : 'kpi');
                  }}
                  className={navPill(isAdminCoreView)}
                >
                  <List size={16} /> Админка
                </button>
              )}
              {isAdmin ? (
                <button type="button" onClick={() => setCurrentView('clientsOrders')} className={navPill(currentView === 'clientsOrders')}>
                  <Users size={16} />
                  <span className="sm:hidden">Клиенты</span>
                  <span className="hidden sm:inline">Клиенты и заказы</span>
                </button>
              ) : null}
              {isAdmin && (
                <button type="button" onClick={() => setCurrentView('registry')} className={navPill(currentView === 'registry')}>
                  <BookOpen size={16} /> Реестр
                </button>
              )}
              {isAdmin && canAdminWrite && (
                <button
                  type="button"
                  onClick={() => setCurrentView('goszakupContracts')}
                  className={navPill(currentView === 'goszakupContracts')}
                >
                  <FileSpreadsheet size={16} /> Госзакуп
                </button>
              )}
              {!isAdmin && (
                <>
                  <button type="button" onClick={() => setCurrentView('clients')} className={navPill(currentView === 'clients')}>
                    <Users size={16} /> Клиенты
                  </button>
                  <button type="button" onClick={() => setCurrentView('orders')} className={navPill(currentView === 'orders')}>
                    <ShoppingBag size={16} /> Заказы
                  </button>
                  <button type="button" onClick={() => setCurrentView('ensTru')} className={navPill(currentView === 'ensTru')}>
                    <ClipboardCheck size={16} />
                    <span className="sm:hidden">ЕНС ТРУ</span>
                    <span className="hidden sm:inline">Проверка ЕНС ТРУ</span>
                  </button>
                  {isLeadDigger ? (
                    <button
                      type="button"
                      onClick={() => setCurrentView('diggerLeads')}
                      className={navPill(currentView === 'diggerLeads')}
                    >
                      <Building2 size={16} /> Лиды
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {isAdmin && isAdminCoreView ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-2 border-t border-gray-100">
              <div className="om-pill-track bg-gray-50/80 min-w-0 flex-1">
                {canAdminWrite ? (
                  <button
                    type="button"
                    onClick={() => setAdminSubView('salesDashboard')}
                    className={`om-subpill ${adminSubView === 'salesDashboard' ? 'om-subpill-active' : 'om-subpill-idle'}`}
                  >
                    <BarChart2 size={16} />
                    Дашборд
                  </button>
                ) : null}
                {canAdminWrite && adminAnalyticsTabEnabled ? (
                  <button
                    type="button"
                    onClick={() => setAdminSubView('dashboard')}
                    className={`om-subpill ${adminSubView === 'dashboard' ? 'om-subpill-active' : 'om-subpill-idle'}`}
                  >
                    <LayoutGrid size={16} />
                    Аналитика
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setAdminSubView('kpi')}
                  className={`om-subpill ${adminSubView === 'kpi' ? 'om-subpill-active' : 'om-subpill-idle'}`}
                >
                  <FileText size={16} />
                  KPI
                </button>
                {canAdminWrite ? (
                  <button
                    type="button"
                    onClick={() => setAdminSubView('enterpriseLeads')}
                    className={`om-subpill ${adminSubView === 'enterpriseLeads' ? 'om-subpill-active' : 'om-subpill-idle'}`}
                  >
                    <UserPlus size={16} />
                    Лиды
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setAdminSubView('enterpriseLeadsAll')}
                  className={`om-subpill ${adminSubView === 'enterpriseLeadsAll' ? 'om-subpill-active' : 'om-subpill-idle'}`}
                >
                  <ClipboardCheck size={16} />
                  Переданные в круп
                </button>
                <button
                  type="button"
                  onClick={() => setAdminSubView('diggerConversion')}
                  className={`om-subpill ${adminSubView === 'diggerConversion' ? 'om-subpill-active' : 'om-subpill-idle'}`}
                >
                  <Target size={16} />
                  Лидорубы
                </button>
                {canAdminWrite ? (
                  <button
                    type="button"
                    onClick={() => setAdminSubView('meetings')}
                    className={`om-subpill ${adminSubView === 'meetings' ? 'om-subpill-active' : 'om-subpill-idle'}`}
                  >
                    <List size={16} />
                    Встречи
                  </button>
                ) : null}
              </div>

              {canAdminWrite ? (
                <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 shrink-0">
                  <input
                    id="telegram-weekly-forecast"
                    type="text"
                    inputMode="numeric"
                    value={telegramWeeklyForecastDraft}
                    onChange={(e) => setTelegramWeeklyForecastDraft(e.target.value.replace(/[^\d\s]/g, ''))}
                    disabled={telegramWeeklyForecastSaving || telegramReportSending}
                    placeholder="Прогноз"
                    title="Прогноз на неделю"
                    className="min-w-0 w-[7.5rem] sm:w-[8.5rem] px-2.5 sm:px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold disabled:opacity-60 outline-none focus:border-blue-500 min-h-10"
                  />
                  <button
                    type="button"
                    disabled={telegramWeeklyForecastSaving || telegramReportSending || !forecastDirty}
                    onClick={() => void saveTelegramWeeklyForecast()}
                    className="px-2.5 sm:px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-bold uppercase tracking-wide text-emerald-800 hover:bg-emerald-100 disabled:opacity-40 disabled:pointer-events-none min-h-10"
                  >
                    {telegramWeeklyForecastSaving ? '…' : 'OK'}
                  </button>
                  <input
                    id="telegram-report-date"
                    type="date"
                    value={telegramReportDate}
                    onChange={(e) => setTelegramReportDate(e.target.value)}
                    disabled={telegramReportSending}
                    title="Дата отчёта"
                    className="min-w-0 w-auto px-2.5 sm:px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold disabled:opacity-60 outline-none focus:border-blue-500 min-h-10"
                  />
                  <button
                    type="button"
                    disabled={telegramReportSending}
                    onClick={() => setTelegramReportDate(formatYmdLocal(new Date()))}
                    className="px-2.5 sm:px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold uppercase tracking-wide text-gray-600 hover:bg-gray-50 disabled:opacity-60 min-h-10"
                  >
                    Сегодня
                  </button>
                  <button
                    type="button"
                    disabled={telegramReportSending}
                    onClick={() => void handleSendTelegramDailyReport()}
                    className="inline-flex items-center justify-center gap-2 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 disabled:opacity-60 disabled:pointer-events-none transition-colors min-h-10"
                    title="Сводка за выбранную дату по данным в базе на текущий момент"
                  >
                    {telegramReportSending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                    {telegramReportSending ? '…' : 'Telegram'}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <main className="om-main om-scroll flex-1">
        <div className="om-main-inner">
        {(!supabaseOk || loadError) && (
          <div
            className={`rounded-2xl p-4 text-xs font-bold ${loadError ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-red-50 text-red-800 border border-red-200'}`}
          >
            {!supabaseOk
              ? 'Нет env для Supabase. Локально: .env.local с VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY. Vercel: те же имена (или NEXT_PUBLIC_*) в Environment Variables → Production + Redeploy.'
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

        {currentView === 'manager' && (
          <ManagerDashboard
            stats={formStats}
            setStats={setFormStats}
            reportDate={managerReportDate}
            setReportDate={setManagerReportDate}
            DAILY_CALL_GOAL={DAILY_CALL_GOAL}
            assignedMeetings={assignedMeetings}
            setAssignedMeetings={setAssignedMeetings}
            conductedMeetings={conductedMeetings}
            setConductedMeetings={setConductedMeetings}
            confirmedOrders={confirmedOrders}
            setConfirmedOrders={setConfirmedOrders}
            saving={saving}
            onSaveAction={(opts) => saveReport(opts)}
            onSaveKpi={saveKpi}
            kpiSaving={kpiSaving}
            setIsMeetingModalOpen={setIsMeetingModalOpen}
            setActiveMeetingIndex={setActiveMeetingIndex}
            setMeetingResultTemp={setMeetingResultTemp}
            clients={clients}
            allReports={allReports}
            mrpKzt={mrpKzt}
            isLeadDigger={isLeadDigger}
            isSalesManager={!isAdmin && !isLeadDigger}
            sessionUserId={sessionUserId}
            creatorName={managerName}
            diggerProfiles={assigneeProfiles.filter((p) => p.role === 'lead_digger')}
            canSetDigger={canAdminWrite}
            onOpenAddClient={(inputValue, callback) => {
              const isBin = /^\d{12}$/.test(inputValue.trim());
              setEditingClientBin(null);
              setNewClientData({
                ...emptyNewClientForm(sessionUserId ?? ''),
                name: isBin ? '' : inputValue,
                bin: isBin ? inputValue : '',
              });
              setOnClientCreatedCallback(() => callback);
              setIsClientModalOpen(true);
            }}
          />
        )}

        {isAdmin && currentView === 'admin' && (
          <div className="space-y-6">
            {adminSubView === 'salesDashboard' && canAdminWrite && (
              <SalesComparisonDashboard
                allReports={adminDeptReports}
                filterManager={adminFilterManager}
                setFilterManager={setAdminFilterManager}
                managerOptions={adminDeptManagerOptions}
                staffDept={adminStaffDept}
                setStaffDept={(dept) => {
                  setAdminStaffDept(dept);
                  setAdminFilterManager('Все');
                }}
              />
            )}
            {adminAnalyticsTabEnabled && adminSubView === 'dashboard' && canAdminWrite && (
              <AdminDashboard
                reports={filteredReports}
                filterManager={adminFilterManager}
                setFilterManager={setAdminFilterManager}
                filterDateFrom={adminFilterDateFrom}
                setFilterDateFrom={setAdminFilterDateFrom}
                filterDateTo={adminFilterDateTo}
                setFilterDateTo={setAdminFilterDateTo}
                managerOptions={adminDeptManagerOptions}
                staffDept={adminStaffDept}
                setStaffDept={(dept) => {
                  setAdminStaffDept(dept);
                  setAdminFilterManager('Все');
                }}
                onOpenRealization={(title, rows) => setAdminRealizationModal({ isOpen: true, title, rows })}
              />
            )}
            {adminSubView === 'kpi' && (
              <KpiDashboard
                allReports={kpiDeptReports}
                reports={kpiFilteredReports}
                filterManager={kpiFilterManager}
                setFilterManager={setKpiFilterManager}
                filterDateFrom={kpiFilterDateFrom}
                setFilterDateFrom={setKpiFilterDateFrom}
                filterDateTo={kpiFilterDateTo}
                setFilterDateTo={setKpiFilterDateTo}
                managerOptions={kpiDeptManagerOptions}
                staffDept={kpiStaffDept}
                setStaffDept={(dept) => {
                  setKpiStaffDept(dept);
                  setKpiFilterManager('Все');
                }}
                onDeleteReport={canAdminWrite ? removeReport : undefined}
              />
            )}
            {adminSubView === 'enterpriseLeads' && canAdminWrite && (
              <EnterpriseLeadsBuffer managers={managerProfiles} onAssigned={refresh} />
            )}
            {adminSubView === 'enterpriseLeadsAll' && (
              <EnterpriseLeadsAllPanel canDelete={canAdminWrite} onDeleted={refresh} />
            )}
            {adminSubView === 'diggerConversion' && <LeadDiggerConversionDashboard />}
            {adminSubView === 'staff' && canAdminWrite && <StaffManager />}
            {adminSubView === 'meetings' && canAdminWrite && (
              <ManagerMeetingsPanel
                variant="admin"
                allReports={allReports}
                findEvidence={findSpecificConductedEvidence}
                managerOptions={managerFilterOptions}
                onAdminDeleteMeeting={removeAdminMeeting}
                deletedMeetings={deletedMeetings}
                onAdminRestoreMeeting={restoreAdminMeeting}
                onAdminHardDeleteMeeting={hardDeleteAdminMeeting}
                onRefreshReports={refresh}
                diggerProfiles={assigneeProfiles.filter((p) => p.role === 'lead_digger')}
              />
            )}
            {adminSubView === 'settings' && canAdminWrite && (
              <AdminSettingsPanel
                onRefreshReports={refresh}
                onMrpUpdated={setMrpKzt}
                onAnalyticsTabEnabledChange={setAdminAnalyticsTabEnabled}
              />
            )}
          </div>
        )}

        {isAdmin && currentView === 'registry' && (
          <SupplierRegistryPanel
            clients={clients}
            reports={allReports}
            clientKtpByBin={clientKtpByBin}
            onOpenClient={(c) => setClientHistoryFor(c)}
          />
        )}

        {isAdmin && canAdminWrite && currentView === 'goszakupContracts' && <GoszakupContractsPanel />}

        {!isAdmin && currentView === 'ensTru' && <EnsTruCheckPanel />}

        {isLeadDigger && currentView === 'diggerLeads' && (
          <LeadDiggerLeadsPanel mode="history" creatorId={sessionUserId ?? undefined} />
        )}

        {isAdmin && currentView === 'clientsOrders' && (
          <div className="om-pill-track">
            <button
              type="button"
              onClick={() => setClientsOrdersSubView('clients')}
              className={navPill(clientsOrdersSubView === 'clients')}
            >
              <Users size={16} />
              Клиенты
            </button>
            <button
              type="button"
              onClick={() => setClientsOrdersSubView('orders')}
              className={navPill(clientsOrdersSubView === 'orders')}
            >
              <ShoppingBag size={16} />
              Заказы
            </button>
          </div>
        )}

        {(currentView === 'clients' || (isAdmin && currentView === 'clientsOrders' && clientsOrdersSubView === 'clients')) && (
          <ClientDirectoryPanel
            rows={visibleClientRows}
            onRefreshReports={refresh}
            currentManagerId={sessionUserId}
            isAdmin={isAdmin}
            canAdminWrite={canAdminWrite}
            onToggleClientPaid={canAdminWrite ? toggleClientPaid : undefined}
            managerSelectOptions={managerProfiles}
            onAssignManager={canAdminWrite ? assignClientManager : undefined}
            onToggleKtp={canAdminWrite ? toggleClientKtp : undefined}
            managerFilter={adminClientsFilterManager}
            managerOptions={adminClientManagerOptions}
            onManagerFilterChange={setAdminClientsFilterManager}
            title={isAdmin ? 'Все контрагенты' : 'Мои клиенты'}
            subtitle={isAdmin ? 'База crm_clients · ЦП по всем отчётам' : 'Из ваших отчётов · сумма ЦП по проведённым встречам'}
            onSelectClient={(c) => setClientHistoryFor(c)}
            onAddClient={
              canAdminWrite
                ? () => {
                    setEditingClientBin(null);
                    setNewClientData(emptyNewClientForm());
                    setOnClientCreatedCallback(null);
                    setIsClientModalOpen(true);
                  }
                : undefined
            }
            onEditClient={
              canAdminWrite
                ? (c) => {
                    setEditingClientBin(c.bin);
                    setNewClientData(newClientFormFromClient(c));
                    setOnClientCreatedCallback(null);
                    setIsClientModalOpen(true);
                  }
                : undefined
            }
            onDeleteClient={canAdminWrite ? removeClient : undefined}
          />
        )}

        {(currentView === 'orders' || (isAdmin && currentView === 'clientsOrders' && clientsOrdersSubView === 'orders')) && (
          <div className="space-y-8">
            {!isAdmin && (
              <div className="om-pill-track">
                <button
                  type="button"
                  onClick={() => setManagerOrdersSection('calendar')}
                  className={navPill(managerOrdersSection === 'calendar')}
                >
                  <CalendarCheck size={16} />
                  Календарь
                </button>
                <button
                  type="button"
                  onClick={() => setManagerOrdersSection('meetings')}
                  className={navPill(managerOrdersSection === 'meetings')}
                >
                  <List size={16} />
                  Встречи
                </button>
                <button
                  type="button"
                  onClick={() => setManagerOrdersSection('orders')}
                  className={navPill(managerOrdersSection === 'orders')}
                >
                  <ShoppingBag size={16} />
                  Заказы
                </button>
              </div>
            )}
            {!isAdmin && managerOrdersSection !== 'orders' && (
              <ManagerMeetingsPanel
                allReports={allReports}
                findEvidence={findSpecificConductedEvidence}
                mode={managerOrdersSection === 'calendar' ? 'calendar' : 'assigned'}
                onRefreshReports={refresh}
              />
            )}
            {(isAdmin || managerOrdersSection === 'orders') && (
              <OrdersHistoryDashboard
                isAdmin={isAdmin}
                orders={allFilteredOrders}
                groupedOrders={groupedFilteredOrders}
                viewMode={ordersViewMode}
                setViewMode={setOrdersViewMode}
                clientKtpByBin={clientKtpByBin}
                totalOrdersCount={allFilteredOrders.reduce((sum, order) => sum + order.orderCount, 0)}
                filterManager={ordersFilterManager}
                setFilterManager={setOrdersFilterManager}
                filterDateFrom={ordersFilterDateFrom}
                setFilterDateFrom={setOrdersFilterDateFrom}
                filterDateTo={ordersFilterDateTo}
                setFilterDateTo={setOrdersFilterDateTo}
                filterCounterparty={ordersFilterCounterparty}
                setFilterCounterparty={setOrdersFilterCounterparty}
                counterpartyOptions={ordersCounterpartyOptions}
                managerOptions={managerFilterOptions}
                openOrderDetails={(order) =>
                  setOrderDetailModal({
                    isOpen: true,
                    entity: order.entityName,
                    bin: order.bin,
                    viaBin: order.viaBin,
                    viaEntityName: order.viaEntityName,
                    amounts: order.amounts,
                    totalAmount: order.totalAmount,
                    mrpKztApplied: order.mrpKztApplied,
                    isKtpApplied: order.isKtpApplied,
                    commissionAmount: order.commissionAmount,
                    editableOrder: canAdminWrite ? order : null,
                  })
                }
                onEditOrder={canAdminWrite ? (order) => setEditingOrder(order) : undefined}
                onCreateOrder={canAdminWrite ? () => setCreatingOrder(true) : undefined}
                openGroupedOrderDetails={(group) =>
                  setOrderDetailModal({
                    isOpen: true,
                    entity: group.entityName,
                    bin: group.bin,
                    viaBin: '',
                    amounts: group.amounts,
                    totalAmount: group.totalAmount,
                    sourceOrders: group.sourceOrders,
                  })
                }
              />
            )}
          </div>
        )}
        </div>
      </main>

      {isClientModalOpen && canManageClients && (
        <div
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[500] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => {
            setIsClientModalOpen(false);
            setEditingClientBin(null);
            setNewClientData(emptyNewClientForm());
          }}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg overflow-hidden max-h-[92dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 text-blue-700 p-2 rounded-lg">
                  <UserPlus size={20} />
                </div>
                <h3 className="font-extrabold text-gray-900 text-lg">
                  {editingClientBin ? 'Редактировать контрагента' : 'Новый контрагент'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsClientModalOpen(false);
                  setEditingClientBin(null);
                  setNewClientData(emptyNewClientForm());
                }}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto om-scroll flex-1">
              <div className="text-left">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Наименование Юр. Лица</label>
                <input
                  type="text"
                  className="w-full border border-gray-200 text-sm font-medium rounded-lg px-4 py-2.5 outline-none focus:border-blue-500 transition"
                  placeholder="ТОО Прогресс..."
                  value={newClientData.name}
                  onChange={(e) => setNewClientData({ ...newClientData, name: e.target.value })}
                />
              </div>
              <div className="text-left">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">БИН / ИИН (12 цифр)</label>
                <div className="relative">
                  <Fingerprint size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input
                    type="text"
                    maxLength={12}
                    className="w-full border border-gray-200 text-sm font-bold rounded-lg px-4 py-2.5 pl-12 outline-none focus:border-blue-500 transition tracking-widest"
                    placeholder="000000000000"
                    value={newClientData.bin}
                    onChange={(e) => setNewClientData({ ...newClientData, bin: e.target.value.replace(/\D/g, '') })}
                  />
                </div>
                {editingClientBin && (
                  <p className="text-[10px] text-gray-500 mt-2">
                    При смене БИН он обновится во всех назначенных и проведённых встречах и в заказах по этому БИН.
                  </p>
                )}
              </div>
              {isAdmin && (
                <div className="text-left">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                    Менеджер / лидоруб
                  </label>
                  <select
                    className="w-full border border-gray-200 text-sm font-bold rounded-lg px-4 py-2.5 outline-none focus:border-blue-500 transition cursor-pointer"
                    value={newClientData.managerId}
                    onChange={(e) => setNewClientData({ ...newClientData, managerId: e.target.value })}
                  >
                    <option value="">Не назначен</option>
                    {assigneeProfiles.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName}
                        {m.role === 'lead_digger' ? ' (лидоруб)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {(isLeadDigger || canAdminWrite) && (
                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 text-left space-y-2">
                  <label className="block text-[10px] font-bold text-blue-800 uppercase tracking-wide">
                    Масштаб бизнеса (Маршрутизация)
                  </label>
                  <select
                    className="w-full bg-white border border-blue-200 text-gray-900 text-sm font-bold rounded-lg px-4 py-2.5 outline-none focus:border-blue-500 transition cursor-pointer shadow-sm"
                    value={newClientData.businessScale}
                    onChange={(e) =>
                      setNewClientData({
                        ...newClientData,
                        businessScale: e.target.value === 'enterprise' ? 'enterprise' : 'smb',
                      })
                    }
                  >
                    <option value="smb">СМБ (Оставить себе в работу)</option>
                    <option value="enterprise">Крупный бизнес (Передать руководителю)</option>
                  </select>
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    «Крупный бизнес» отправится в буфер руководителю на распределение. «СМБ» останется в вашей
                    воронке.
                  </p>
                </div>
              )}
              {isAdmin && (
                <>
                  <div className="space-y-2 text-left">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2 tracking-tighter">Категория</label>
                    <select
                      className="w-full bg-gray-50 border-none p-4 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                      value={newClientData.categoryId}
                      onChange={(e) => setNewClientData({ ...newClientData, categoryId: e.target.value })}
                    >
                      <option value="">—</option>
                      {clientCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      <option value={NEW_CATEGORY_VALUE}>— Новая категория —</option>
                    </select>
                    {newClientData.categoryId === NEW_CATEGORY_VALUE && (
                      <input
                        type="text"
                        className="w-full bg-gray-50 border-none p-4 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                        placeholder="Название категории"
                        value={newClientData.newCategoryName}
                        onChange={(e) => setNewClientData({ ...newClientData, newCategoryName: e.target.value })}
                      />
                    )}
                  </div>
                  <div className="space-y-2 text-left">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2 tracking-tighter">
                      Обороты ГЗ (прошлый год), ₸
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="w-full bg-gray-50 border-none p-4 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                      placeholder="Необязательно"
                      value={newClientData.gzTurnoverPrevYear}
                      onChange={(e) =>
                        setNewClientData({ ...newClientData, gzTurnoverPrevYear: e.target.value.replace(/[^\d]/g, '') })
                      }
                    />
                  </div>
                  <div className="space-y-2 text-left">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2 tracking-tighter">
                      Месяц привлечения
                    </label>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 bg-gray-50 border-none p-4 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                        value={newClientData.attractionMonth}
                        onChange={(e) =>
                          setNewClientData({ ...newClientData, attractionMonth: Number(e.target.value) })
                        }
                      >
                        {ATTRACTION_MONTH_OPTIONS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="w-28 bg-gray-50 border-none p-4 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                        value={newClientData.attractionYear}
                        onChange={(e) => setNewClientData({ ...newClientData, attractionYear: Number(e.target.value) })}
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
              )}
            </div>
            <div className="p-4 sm:p-5 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setIsClientModalOpen(false);
                  setEditingClientBin(null);
                  setNewClientData(emptyNewClientForm());
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-200 border border-gray-200 transition min-h-10"
              >
                Отмена
              </button>
              <button
                onClick={() => void saveClientModal()}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition min-h-10"
              >
                Создать карточку
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

      {adminRealizationModal.isOpen && (
        <div
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[120] flex items-center justify-center p-4"
          onClick={() => setAdminRealizationModal({ ...adminRealizationModal, isOpen: false })}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-8 border-b flex justify-between items-center bg-gray-50/50 text-left">
              <div>
                <h3 className="font-black text-gray-900 text-lg uppercase">{adminRealizationModal.title}</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase">Доведено до проведения: {adminRealizationModal.rows.length}</p>
              </div>
              <button
                type="button"
                onClick={() => setAdminRealizationModal({ ...adminRealizationModal, isOpen: false })}
                className="p-3 hover:bg-gray-100 rounded-full text-gray-400"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-8 overflow-y-auto max-h-[60vh] text-left">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="text-[10px] font-bold text-gray-400 border-b">
                    <th className="pb-4">Менеджер</th>
                    <th className="pb-4">Дата отчета</th>
                    <th className="pb-4">Дата встречи</th>
                    <th className="pb-4">Контрагент / БИН</th>
                    <th className="pb-4">Тип</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {adminRealizationModal.rows.map((row, idx) => (
                    <tr key={`${row.manager}-${row.reportDate}-${row.bin}-${idx}`} className="text-sm">
                      <td className="py-3 font-bold text-gray-800 whitespace-nowrap">{row.manager}</td>
                      <td className="py-3 text-gray-600 whitespace-nowrap">{formatDisplayDate(row.reportDate)}</td>
                      <td className="py-3 text-gray-600 whitespace-nowrap">{formatDisplayDate(row.date)}</td>
                      <td className="py-3">
                        <div className="font-bold text-gray-800">{row.entityName}</div>
                        <div className="text-[10px] font-mono text-gray-400">{row.bin}</div>
                      </td>
                      <td className="py-3 text-gray-700">{row.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-8 bg-gray-50 flex justify-end">
              <button
                type="button"
                onClick={() => setAdminRealizationModal({ ...adminRealizationModal, isOpen: false })}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold text-xs uppercase"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {orderDetailModal.isOpen && (
        <OrderItemsModal
          modal={orderDetailModal}
          isAdmin={isAdmin}
          clientKtpByBin={clientKtpByBin}
          onEdit={
            isAdmin && orderDetailModal.editableOrder
              ? () => {
                  const row = orderDetailModal.editableOrder!;
                  setOrderDetailModal({ ...orderDetailModal, isOpen: false });
                  setEditingOrder(row);
                }
              : undefined
          }
          onClose={() => setOrderDetailModal({ ...orderDetailModal, isOpen: false })}
        />
      )}

      {editingOrder && canAdminWrite ? (
        <AdminOrderEditModal
          order={editingOrder}
          clients={clients}
          mrpKzt={mrpKzt}
          onOpenAddClient={(inputValue, callback) => {
            const isBin = /^\d{12}$/.test(inputValue.trim());
            setEditingClientBin(null);
            setNewClientData({
              ...emptyNewClientForm(sessionUserId ?? ''),
              name: isBin ? '' : inputValue,
              bin: isBin ? inputValue : '',
            });
            setOnClientCreatedCallback(() => callback);
            setIsClientModalOpen(true);
          }}
          onSaved={refresh}
          onClose={() => setEditingOrder(null)}
        />
      ) : null}

      {creatingOrder && canAdminWrite ? (
        <AdminOrderCreateModal
          clients={clients}
          managers={managerProfiles}
          mrpKzt={mrpKzt}
          onOpenAddClient={(inputValue, callback) => {
            const isBin = /^\d{12}$/.test(inputValue.trim());
            setEditingClientBin(null);
            setNewClientData({
              ...emptyNewClientForm(sessionUserId ?? ''),
              name: isBin ? '' : inputValue,
              bin: isBin ? inputValue : '',
            });
            setOnClientCreatedCallback(() => callback);
            setIsClientModalOpen(true);
          }}
          onSaved={refresh}
          onClose={() => setCreatingOrder(false)}
        />
      ) : null}

      {clientHistoryFor && (() => {
        const row = visibleClientRows.find((r) => r.bin === clientHistoryFor.bin) ?? clientListRows.find((r) => r.bin === clientHistoryFor.bin);
        return (
          <ClientHistoryModal
            client={clientHistoryFor}
            conducted={clientHistoryAggregated.conducted}
            orders={clientHistoryAggregated.orders}
            meetingCp={row?.meetingCp ?? 0}
            extraCp={row?.extraCp ?? 0}
            totalCp={row?.totalCp ?? 0}
            cpPaid={row?.cpPaid ?? false}
            cpPaidAt={row?.cpPaidAt ?? null}
            cpMeetings={row?.cpMeetings ?? []}
            standaloneByManager={row?.standaloneByManager ?? []}
            currentManagerId={sessionUserId}
            isAdmin={isAdmin}
            canAdminWrite={canAdminWrite}
            categories={clientCategories}
            profileSaving={clientProfileSaving}
            onSaveProfile={canAdminWrite ? saveClientProfile : undefined}
            onToggleClientPaid={canAdminWrite ? toggleClientPaid : undefined}
            onRefreshReports={refresh}
            onClose={() => setClientHistoryFor(null)}
          />
        );
      })()}
    </div>
  );
};

type SetState<T> = Dispatch<SetStateAction<T>>;

const ManagerDashboard = ({
  stats,
  setStats,
  reportDate,
  setReportDate,
  DAILY_CALL_GOAL,
  assignedMeetings,
  setAssignedMeetings,
  conductedMeetings,
  setConductedMeetings,
  confirmedOrders,
  setConfirmedOrders,
  saving,
  onSaveAction,
  onSaveKpi,
  kpiSaving,
  setIsMeetingModalOpen,
  setActiveMeetingIndex,
  setMeetingResultTemp,
  clients,
  onOpenAddClient,
  allReports,
  mrpKzt,
  isLeadDigger = false,
  isSalesManager = false,
  sessionUserId = null,
  creatorName = '',
  diggerProfiles = [],
  canSetDigger = false,
}: {
  stats: FormStats;
  setStats: SetState<FormStats>;
  reportDate: string;
  setReportDate: SetState<string>;
  DAILY_CALL_GOAL: number;
  assignedMeetings: UiAssigned[];
  setAssignedMeetings: SetState<UiAssigned[]>;
  conductedMeetings: UiConducted[];
  setConductedMeetings: SetState<UiConducted[]>;
  confirmedOrders: UiOrder[];
  setConfirmedOrders: SetState<UiOrder[]>;
  saving: boolean;
  onSaveAction: (opts?: SaveReportOptions) => Promise<boolean>;
  onSaveKpi: (nextStats: FormStats) => Promise<void>;
  kpiSaving: boolean;
  setIsMeetingModalOpen: SetState<boolean>;
  setActiveMeetingIndex: SetState<number | null>;
  setMeetingResultTemp: SetState<string>;
  clients: UiClient[];
  onOpenAddClient: (input: string, cb: (c: UiClient) => void) => void;
  allReports: FullReport[];
  mrpKzt: number;
  isLeadDigger?: boolean;
  isSalesManager?: boolean;
  sessionUserId?: string | null;
  creatorName?: string;
  diggerProfiles?: Array<{ id: string; fullName: string; role: string }>;
  canSetDigger?: boolean;
}) => {
  const [statDraft, setStatDraft] = useState<Record<keyof FormStats, string>>({
    processedTotal: String(stats.processedTotal),
    newInWork: String(stats.newInWork),
    callsTotal: String(stats.callsTotal),
    validatedTotal: String(stats.validatedTotal),
    stageTransitions: String(stats.stageTransitions),
  });
  const [transferredToEnterprise, setTransferredToEnterprise] = useState(0);
  const [transferDraft, setTransferDraft] = useState('');
  const [transferModalCount, setTransferModalCount] = useState(0);
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  useEffect(() => {
    setStatDraft({
      processedTotal: String(stats.processedTotal),
      newInWork: String(stats.newInWork),
      callsTotal: String(stats.callsTotal),
      validatedTotal: String(stats.validatedTotal),
      stageTransitions: String(stats.stageTransitions),
    });
  }, [stats.processedTotal, stats.newInWork, stats.callsTotal, stats.validatedTotal, stats.stageTransitions]);

  const refreshTransferredCount = useCallback(async () => {
    try {
      const data = await listEnterpriseLeadsApi('all');
      setTransferredToEnterprise(data.filter((r) => leadTransferredDay(r) === reportDate).length);
    } catch {
      setTransferredToEnterprise(0);
    }
  }, [reportDate]);

  useEffect(() => {
    if (!isLeadDigger) {
      setTransferredToEnterprise(0);
      return;
    }
    let cancelled = false;
    const refreshCount = async () => {
      try {
        const data = await listEnterpriseLeadsApi('all');
        if (cancelled) return;
        setTransferredToEnterprise(data.filter((r) => leadTransferredDay(r) === reportDate).length);
      } catch {
        if (!cancelled) setTransferredToEnterprise(0);
      }
    };
    void refreshCount();

    if (!sessionUserId) {
      return () => {
        cancelled = true;
      };
    }

    const sb = getSupabase();
    const topic = `digger-kpi-transferred:${sessionUserId}:${crypto.randomUUID()}`;
    const channel = sb.channel(topic);
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'crm_enterprise_leads',
        filter: `creator_id=eq.${sessionUserId}`,
      },
      () => {
        void refreshCount();
      },
    );
    channel.subscribe();
    return () => {
      cancelled = true;
      void sb.removeChannel(channel);
    };
  }, [isLeadDigger, reportDate, sessionUserId]);

  const openTransferModalFromDraft = () => {
    const n = Math.max(0, parseInt(transferDraft, 10) || 0);
    if (n <= 0) return;
    if (n > 50) {
      alert('Максимум 50 компаний за раз');
      return;
    }
    setTransferModalCount(n);
    setTransferModalOpen(true);
  };

  const handleStatChange = (field: keyof FormStats, value: string) => {
    setStatDraft((prev) => ({ ...prev, [field]: value }));
    if (value === '') return;
    const numericValue = parseInt(value, 10);
    if (Number.isNaN(numericValue)) return;
    setStats((prev) => ({ ...prev, [field]: Math.max(0, numericValue) }));
  };

  const handleStatBlur = (field: keyof FormStats) => {
    if (statDraft[field] !== '') return;
    setStatDraft((prev) => ({ ...prev, [field]: '0' }));
    setStats((prev) => ({ ...prev, [field]: 0 }));
  };

  const commitKpi = async (field: keyof FormStats) => {
    const normalized: FormStats = {
      ...stats,
      [field]:
        statDraft[field] === ''
          ? 0
          : Math.max(0, parseInt(statDraft[field], 10) || 0),
    };
    setStats(normalized);
    await onSaveKpi(normalized);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-wrap items-end gap-3 text-left">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Отчет за</label>
          <input
            type="date"
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setReportDate(new Date().toISOString().split('T')[0])}
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold uppercase tracking-wider text-gray-600 hover:bg-gray-50"
        >
          Сегодня
        </button>
      </div>

      <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="text-xs uppercase font-bold tracking-wider text-gray-400 mb-4">KPI за день</div>
        {isSalesManager ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-[#f3f4f6] p-4 rounded-xl text-left">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                Уникальные поставщики в работе
              </div>
              <input
                type="number"
                min={0}
                className="w-full text-2xl font-black text-gray-800 outline-none bg-transparent"
                value={statDraft.processedTotal}
                onChange={(e) => handleStatChange('processedTotal', e.target.value)}
                onFocus={(e) => e.target.value === '0' && handleStatChange('processedTotal', '')}
                onBlur={async () => {
                  handleStatBlur('processedTotal');
                  await commitKpi('processedTotal');
                }}
              />
            </div>
            <div className="bg-[#eff6ff] p-4 rounded-xl border border-blue-50 text-left">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">Звонки</div>
                <span className="text-[10px] font-bold text-blue-300">Цель: {DAILY_CALL_GOAL}</span>
              </div>
              <input
                type="number"
                min={0}
                className="w-full text-2xl font-black text-blue-800 outline-none bg-transparent"
                value={statDraft.callsTotal}
                onChange={(e) => handleStatChange('callsTotal', e.target.value)}
                onFocus={(e) => e.target.value === '0' && handleStatChange('callsTotal', '')}
                onBlur={async () => {
                  handleStatBlur('callsTotal');
                  await commitKpi('callsTotal');
                }}
              />
              <p className="text-[10px] text-blue-400/80 mt-1">{kpiSaving ? 'Сохранение…' : 'KPI при уходе с поля'}</p>
            </div>
            <div className="bg-[#faf5ff] p-4 rounded-xl border border-purple-50 text-left">
              <div className="text-[10px] font-bold text-purple-700 uppercase tracking-widest mb-1">
                Переходы на след. этап
              </div>
              <input
                type="number"
                min={0}
                className="w-full text-2xl font-black text-purple-800 outline-none bg-transparent"
                value={statDraft.stageTransitions}
                onChange={(e) => handleStatChange('stageTransitions', e.target.value)}
                onFocus={(e) => e.target.value === '0' && handleStatChange('stageTransitions', '')}
                onBlur={async () => {
                  handleStatBlur('stageTransitions');
                  await commitKpi('stageTransitions');
                }}
              />
            </div>
          </div>
        ) : (
        <div
          className={`grid grid-cols-2 gap-4 ${
            isLeadDigger ? 'md:grid-cols-3 lg:grid-cols-5' : 'md:grid-cols-4'
          }`}
        >
          <div className="bg-[#f3f4f6] p-4 rounded-xl text-left">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Отработано</div>
            <input
              type="number"
              min={0}
              className="w-full text-2xl font-black text-gray-800 outline-none bg-transparent"
              value={statDraft.processedTotal}
              onChange={(e) => handleStatChange('processedTotal', e.target.value)}
              onFocus={(e) => e.target.value === '0' && handleStatChange('processedTotal', '')}
              onBlur={async () => {
                handleStatBlur('processedTotal');
                await commitKpi('processedTotal');
              }}
            />
          </div>
          <div className="bg-[#ecfdf5] p-4 rounded-xl border border-green-50 text-left">
            <div className="text-[10px] font-bold text-green-700 uppercase tracking-widest mb-1">Взято новых</div>
            <input
              type="number"
              min={0}
              className="w-full text-2xl font-black text-green-800 outline-none bg-transparent"
              value={statDraft.newInWork}
              onChange={(e) => handleStatChange('newInWork', e.target.value)}
              onFocus={(e) => e.target.value === '0' && handleStatChange('newInWork', '')}
              onBlur={async () => {
                handleStatBlur('newInWork');
                await commitKpi('newInWork');
              }}
            />
          </div>
          <div className="bg-[#eff6ff] p-4 rounded-xl border border-blue-50 text-left">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">Звонки</div>
              <span className="text-[10px] font-bold text-blue-300">Цель: {DAILY_CALL_GOAL}</span>
            </div>
            <input
              type="number"
              min={0}
              className="w-full text-2xl font-black text-blue-800 outline-none bg-transparent"
              value={statDraft.callsTotal}
              onChange={(e) => handleStatChange('callsTotal', e.target.value)}
              onFocus={(e) => e.target.value === '0' && handleStatChange('callsTotal', '')}
              onBlur={async () => {
                handleStatBlur('callsTotal');
                await commitKpi('callsTotal');
              }}
            />
            <p className="text-[10px] text-blue-400/80 mt-1">{kpiSaving ? 'Сохранение…' : 'KPI при уходе с поля'}</p>
          </div>
          <div className="bg-[#fffbeb] p-4 rounded-xl border border-yellow-50 text-left">
            <div className="text-[10px] font-bold text-yellow-700 uppercase tracking-widest mb-1">Квалификация</div>
            <input
              type="number"
              min={0}
              className="w-full text-2xl font-black text-yellow-800 outline-none bg-transparent"
              value={statDraft.validatedTotal}
              onChange={(e) => handleStatChange('validatedTotal', e.target.value)}
              onFocus={(e) => e.target.value === '0' && handleStatChange('validatedTotal', '')}
              onBlur={async () => {
                handleStatBlur('validatedTotal');
                await commitKpi('validatedTotal');
              }}
            />
          </div>
          {isLeadDigger ? (
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 border-dashed text-left col-span-2 md:col-span-1">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                Передано в круп
                <ArrowRightCircle size={14} className="text-gray-400" />
              </div>
              <input
                type="number"
                min={0}
                max={50}
                className="w-full text-2xl font-black text-gray-700 outline-none bg-transparent"
                value={transferDraft}
                placeholder={String(transferredToEnterprise)}
                onChange={(e) => setTransferDraft(e.target.value.replace(/[^\d]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    openTransferModalFromDraft();
                  }
                }}
                onBlur={() => openTransferModalFromDraft()}
              />
              <p className="text-[10px] text-gray-400 mt-1">
                За дату: {transferredToEnterprise} · введи N → Enter/blur
              </p>
            </div>
          ) : null}
        </div>
        )}
      </div>
      {isSalesManager ? (
        <ManagerBlockersPanel clients={clients} onOpenAddClient={onOpenAddClient} />
      ) : null}
      <MeetingTable
        title="Назначено встреч (План)"
        icon={<Clock className="text-indigo-400" />}
        data={assignedMeetings}
        setData={setAssignedMeetings}
        reportDate={reportDate}
        type="assigned"
        allReports={allReports}
        currentAssignedMeetings={assignedMeetings}
        currentConductedMeetings={conductedMeetings}
        clients={clients}
        onOpenAddClient={onOpenAddClient}
        seedKey={`assigned-${reportDate}`}
        onSaveItem={() => onSaveAction({ refreshAfterSave: false })}
        diggerProfiles={diggerProfiles}
        canSetDigger={canSetDigger}
      />
      <MeetingTable
        title="Проведено встреч (Факт)"
        icon={<CalendarCheck className="text-blue-400" />}
        data={conductedMeetings}
        setData={setConductedMeetings}
        reportDate={reportDate}
        type="conducted"
        allReports={allReports}
        currentAssignedMeetings={assignedMeetings}
        currentConductedMeetings={conductedMeetings}
        diggerProfiles={diggerProfiles}
        canSetDigger={canSetDigger}
        onResultClick={(idx) => {
          setActiveMeetingIndex(idx);
          setMeetingResultTemp(conductedMeetings[idx]?.result ?? '');
          setIsMeetingModalOpen(true);
        }}
        clients={clients}
        onOpenAddClient={onOpenAddClient}
        seedKey={`conducted-${reportDate}`}
        onSaveItem={() => onSaveAction({ refreshAfterSave: false })}
      />
      {isSalesManager ? (
        <ManagerEnterpriseLeadsPanel
          onChanged={async () => {
            await onSaveAction({ refreshAfterSave: true });
          }}
        />
      ) : null}
      {isLeadDigger ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 order-2 lg:order-1">
            <LeadDiggerLeadsPanel mode="returns" creatorId={sessionUserId ?? undefined} />
          </div>
          <div className="order-1 lg:order-2">
            <LeadDiggerLeadsPanel
              mode="status"
              dateFrom={reportDate}
              dateTo={reportDate}
              creatorId={sessionUserId ?? undefined}
            />
          </div>
        </div>
      ) : null}
      <OrdersBlock
        data={
          isLeadDigger
            ? confirmedOrders.filter((o) => clients.find((c) => c.bin === o.bin)?.businessScale !== 'enterprise')
            : confirmedOrders
        }
        setData={setConfirmedOrders}
        clients={isLeadDigger ? clients.filter((c) => c.businessScale !== 'enterprise') : clients}
        onOpenAddClient={onOpenAddClient}
        seedKey={`orders-${reportDate}`}
        mrpKzt={mrpKzt}
        onSaveItem={() => onSaveAction({ refreshAfterSave: false })}
      />
      <div className="flex justify-end pt-4">
        {saving && <span className="text-xs text-gray-400 font-bold">Сохранение...</span>}
      </div>

      {isLeadDigger ? (
        <DiggerTransferModal
          open={transferModalOpen}
          rowCount={transferModalCount}
          reportDate={reportDate}
          clients={clients.filter(
            (c) =>
              (sessionUserId && c.diggerId === sessionUserId) ||
              (sessionUserId && !c.diggerId && c.managerId === sessionUserId) ||
              (!c.diggerId && !c.managerId),
          )}
          onClose={() => {
            setTransferModalOpen(false);
            setTransferDraft('');
          }}
          onSuccess={async ({ items, meetingRows, skippedExisting }) => {
            for (const item of items) {
              if (!item.created || item.skipped_existing) continue;
              void notifyEnterpriseLeadTelegram({
                clientName: item.name,
                bin: item.bin,
                creatorName: creatorName || 'Лидоруб',
              }).catch((e) => console.error(e));
            }

            const existingBins = new Set(
              assignedMeetings.map((m) => m.bin.replace(/\D/g, '')).filter(Boolean),
            );
            const extras: UiAssigned[] = meetingRows
              .filter((r) => r.bin && !existingBins.has(r.bin))
              .map((r) => ({
                entityName: r.name,
                bin: r.bin,
                date: reportDate,
                type: 'Крупный лид',
              }));
            const merged = extras.length > 0 ? [...assignedMeetings, ...extras] : assignedMeetings;
            if (extras.length > 0) {
              setAssignedMeetings(merged);
              await onSaveAction({
                assignedMeetingsOverride: merged,
                refreshAfterSave: true,
              });
            }

            setTransferDraft('');
            await refreshTransferredCount();
            if (skippedExisting > 0) {
              alert(`${skippedExisting} уже в воронке, пропущено`);
            }
          }}
        />
      ) : null}
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
  const normalizeName = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  const normalizeBin = (s: string) => s.replace(/\D/g, '');
  const valueName = normalizeName(value);
  const valueBin = normalizeBin(value);

  const currentClient = clients.find(
    (c) => normalizeName(c.name) === valueName || normalizeBin(c.bin) === valueBin,
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
              const found = clients.find(
                (c) => normalizeName(c.name) === normalizeName(val) || normalizeBin(c.bin) === normalizeBin(val),
              );
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
        <div className="flex items-center gap-1 text-[10px] text-amber-600 font-bold uppercase tracking-tighter ml-2">
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
  seedKey,
  mrpKzt,
  onSaveItem,
}: {
  data: UiOrder[];
  setData: SetState<UiOrder[]>;
  clients: UiClient[];
  onOpenAddClient: (input: string, cb: (c: UiClient) => void) => void;
  seedKey: string;
  mrpKzt: number;
  onSaveItem: () => Promise<boolean>;
}) => {
  const orderSig = (o: UiOrder) =>
    `${o.entityName.trim().toLowerCase()}|${o.bin}|${o.viaEntityName.trim().toLowerCase()}|${o.viaBin}|${o.orderCount}|${o.amounts.map((x) => Number(x || 0)).join(',')}|${o.totalAmount}`;
  const [savedOrders, setSavedOrders] = useState<Set<string>>(() => new Set(data.map(orderSig)));
  useEffect(() => {
    setSavedOrders(new Set(data.map(orderSig)));
  }, [seedKey]);

  const orderAmountError = (amounts: number[], total: number) => {
    const v = validateOrderLinesAmount(amounts, total, mrpKzt);
    return v.ok ? null : v.message;
  };
  const orderViaError = (viaEntityName: string, viaBin: string) => {
    const v = validateOrderViaLegalEntity(viaEntityName, viaBin);
    return v.ok ? null : v.message;
  };

  const addOrder = () =>
    setData([...data, { entityName: '', bin: '', viaEntityName: '', viaBin: '', orderCount: 1, amounts: [0], totalAmount: 0 }]);
  const updateOrder = (idx: number, field: keyof UiOrder, val: string | number) => {
    const updated = [...data];
    const prevSig = orderSig(updated[idx]);
    if (field === 'orderCount') {
      const count = Math.max(1, parseInt(String(val), 10) || 1);
      const newAmounts = [...updated[idx].amounts];
      while (newAmounts.length < count) newAmounts.push(0);
      newAmounts.length = count;
      updated[idx] = { ...updated[idx], orderCount: count, amounts: newAmounts, totalAmount: newAmounts.reduce((a, b) => a + b, 0) };
    } else {
      updated[idx] = { ...updated[idx], [field]: val } as UiOrder;
    }
    const newSig = orderSig(updated[idx]);
    setSavedOrders((prev) => {
      const n = new Set(prev);
      n.delete(prevSig);
      n.delete(newSig);
      return n;
    });
    setData(updated);
  };
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-4 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 text-left min-w-0">
          <CheckCircle size={18} className="text-emerald-500 shrink-0" />
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide truncate">Подтвержденные заказы</h2>
        </div>
        <button
          type="button"
          onClick={addOrder}
          className="shrink-0 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 font-bold px-3 sm:px-4 py-2 rounded-xl text-sm transition shadow-sm min-h-10"
        >
          <span className="sm:hidden">+ ЮЛ</span>
          <span className="hidden sm:inline">Добавить ЮЛ</span>
        </button>
      </div>
      <div className="space-y-4 sm:space-y-6 text-left">
        {data.map((order, oIdx) => {
          const amountErr =
            order.totalAmount > 0 || order.amounts.some((a) => a > 0)
              ? orderAmountError(order.amounts, order.totalAmount)
              : null;
          const viaErr = orderViaError(order.viaEntityName, order.viaBin);
          const canSaveOrder = Boolean(order.entityName.trim() && order.bin.trim() && !amountErr && !viaErr);
          return (
          <div key={oIdx} className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 space-y-4 relative">
            <button
              type="button"
              onClick={() => setData(data.filter((_, i) => i !== oIdx))}
              className="absolute top-4 right-4 text-gray-300 hover:text-red-500"
            >
              <Trash2 size={20} />
            </button>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 text-left">
                <label className="text-[9px] font-bold text-gray-400 uppercase ml-2">Контрагент</label>
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
                <label className="text-[9px] font-bold text-gray-400 uppercase ml-2">К-во заказов</label>
                <input
                  type="number"
                  min={1}
                  className="w-full bg-white border-none p-3 rounded-2xl text-sm font-bold shadow-sm h-[46px]"
                  value={order.orderCount}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => updateOrder(oIdx, 'orderCount', e.target.value)}
                />
              </div>
              <div className="space-y-1.5 text-left md:col-span-2">
                <label className="text-[9px] font-bold text-gray-400 uppercase ml-2">Юр. лицо через которое был заказ</label>
                <p className="text-[9px] text-blue-700/80 ml-2 leading-snug">
                  Если заполнено — КТП и комиссия считаются по этому юрлицу, не по контрагенту
                </p>
                <ContractorLookup
                  value={order.viaEntityName}
                  onSelect={(name, bin) => {
                    const u = [...data];
                    u[oIdx] = { ...u[oIdx], viaEntityName: name, viaBin: bin };
                    setData(u);
                  }}
                  clients={clients}
                  onOpenAddClient={onOpenAddClient}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
              {order.amounts.map((sum, sIdx) => (
                <div key={sIdx} className="space-y-1 text-left">
                  <label className="text-[8px] font-bold text-gray-500 uppercase ml-1">Сумма #{sIdx + 1}</label>
                  <input
                    type="text"
                    className="w-full bg-gray-50 border border-gray-200 p-2 rounded-xl text-xs font-bold text-right text-gray-900 shadow-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
                    value={sum || ''}
                    placeholder="0"
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
            {amountErr ? (
              <p className="text-[10px] font-bold text-red-600 flex items-center gap-1">
                <AlertTriangle size={12} />
                {amountErr}
              </p>
            ) : null}
            {viaErr ? (
              <p className="text-[10px] font-bold text-red-600 flex items-center gap-1">
                <AlertTriangle size={12} />
                {viaErr}
              </p>
            ) : null}
            <div className="flex justify-end">
              {savedOrders.has(orderSig(order)) ? (
                <span className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100">
                  Сохранено
                </span>
              ) : (
                <button
                  type="button"
                  disabled={!canSaveOrder}
                  onClick={async () => {
                    if (amountErr) {
                      alert(amountErr);
                      return;
                    }
                    const currentOrderSig = orderSig(order);
                    const ok = await onSaveItem();
                    if (ok) {
                      setSavedOrders((prev) => {
                        const n = new Set(prev);
                        n.add(currentOrderSig);
                        return n;
                      });
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-100 hover:bg-blue-100 disabled:opacity-40 disabled:pointer-events-none"
                >
                  Сохранить
                </button>
              )}
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
};

const MeetingTable = ({
  title,
  icon,
  data,
  setData,
  reportDate,
  type,
  allReports,
  currentAssignedMeetings,
  currentConductedMeetings,
  onResultClick,
  clients,
  onOpenAddClient,
  seedKey,
  onSaveItem,
  diggerProfiles = [],
  canSetDigger = false,
}: {
  title: string;
  icon: ReactNode;
  data: (UiAssigned | UiConducted)[];
  setData: SetState<UiAssigned[]> | SetState<UiConducted[]>;
  reportDate: string;
  type: 'assigned' | 'conducted';
  allReports: FullReport[];
  currentAssignedMeetings: UiAssigned[];
  currentConductedMeetings: UiConducted[];
  onResultClick?: (idx: number) => void;
  clients: UiClient[];
  onOpenAddClient: (input: string, cb: (c: UiClient) => void) => void;
  seedKey: string;
  onSaveItem: () => Promise<boolean>;
  diggerProfiles?: Array<{ id: string; fullName: string; role: string }>;
  canSetDigger?: boolean;
}) => {
  const normalizeText = (value: string) => value.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  const normalizeBin = (value: string) => value.replace(/\D/g, '');
  const isKrupType = (t: string) => normalizeKpiMeetingType(t).includes('крупн');
  const [diggerPickByIdx, setDiggerPickByIdx] = useState<Record<number, string>>({});

  const hasAnyNewMeetingForCounterparty = (entityName: string, bin: string, selfIdx?: number): boolean => {
    const targetBin = normalizeBin(bin);
    const targetName = normalizeText(entityName);
    const isSameCounterparty = (name: string, b: string) => {
      const bNorm = normalizeBin(b);
      if (targetBin && bNorm) return bNorm === targetBin;
      return normalizeText(name) === targetName;
    };

    for (const report of allReports) {
      if (report.assignedMeetings.some((m) => isNewMeetingType(m.type) && isSameCounterparty(m.entityName, m.bin))) return true;
      if (report.conductedMeetings.some((m) => isNewMeetingType(m.type) && isSameCounterparty(m.entityName, m.bin))) return true;
    }

    for (let i = 0; i < currentAssignedMeetings.length; i++) {
      if (type === 'assigned' && selfIdx != null && i === selfIdx) continue;
      const m = currentAssignedMeetings[i];
      if (isNewMeetingType(m.type) && isSameCounterparty(m.entityName, m.bin)) return true;
    }
    for (const m of currentConductedMeetings) {
      if (isNewMeetingType(m.type) && isSameCounterparty(m.entityName, m.bin)) return true;
    }
    return false;
  };

  const isSameCounterparty = (name: string, bin: string, targetName: string, targetBin: string): boolean => {
    const bNorm = normalizeBin(bin);
    const targetBNorm = normalizeBin(targetBin);
    if (bNorm && targetBNorm) return bNorm === targetBNorm;
    return normalizeText(name) === normalizeText(targetName);
  };

  const toComparableYmd = (raw: string): string => {
    const t = String(raw || '').trim();
    const ymd = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
    const dot = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dot) return `${dot[3]}-${dot[2].padStart(2, '0')}-${dot[1].padStart(2, '0')}`;
    const dash = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dash) return `${dash[3]}-${dash[2].padStart(2, '0')}-${dash[1].padStart(2, '0')}`;
    return t;
  };

  const conductedMatchesAssigned = (conducted: UiConducted, assigned: UiAssigned): boolean => {
    if (!isSameCounterparty(conducted.entityName, conducted.bin, assigned.entityName, assigned.bin)) return false;
    if (normalizeKpiMeetingType(conducted.type) !== normalizeKpiMeetingType(assigned.type)) return false;
    return toComparableYmd(conducted.date) >= toComparableYmd(assigned.date);
  };

  const hasEvidenceForAssignedInAllSources = (assigned: UiAssigned, skipCurrentConductedIdx?: number): boolean => {
    for (const report of allReports) {
      for (const cm of report.conductedMeetings) {
        if (conductedMatchesAssigned(cm, assigned)) return true;
      }
    }
    for (let i = 0; i < currentConductedMeetings.length; i++) {
      if (skipCurrentConductedIdx != null && i === skipCurrentConductedIdx) continue;
      const cm = currentConductedMeetings[i];
      if (conductedMatchesAssigned(cm, assigned)) return true;
    }
    return false;
  };

  const getForcedConductedTypeForCounterparty = (
    entityName: string,
    bin: string,
    currentConductedIdx: number,
  ): 'Новая' | 'Повторная' | null => {
    const assignedPool: UiAssigned[] = [
      ...allReports.flatMap((report) => report.assignedMeetings),
      ...currentAssignedMeetings,
    ];
    let hasPendingNew = false;
    let hasPendingRepeat = false;
    for (const assigned of assignedPool) {
      if (!isSameCounterparty(assigned.entityName, assigned.bin, entityName, bin)) continue;
      const stillPending = !hasEvidenceForAssignedInAllSources(assigned, currentConductedIdx);
      if (!stillPending) continue;
      if (isNewMeetingType(assigned.type)) hasPendingNew = true;
      if (isRepeatMeetingType(assigned.type)) hasPendingRepeat = true;
    }
    if (hasPendingNew && !hasPendingRepeat) return 'Новая';
    if (hasPendingRepeat && !hasPendingNew) return 'Повторная';
    return null;
  };

  const rowSig = (row: UiAssigned | UiConducted) => {
    const name = row.entityName.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
    const bin = row.bin.replace(/\D/g, '');
    const date = String(row.date || '').trim();
    const meetType = String(row.type || '').trim().toLowerCase().replace(/ё/g, 'е');
    const result =
      type === 'conducted' ? String((row as UiConducted).result || '').trim().toLowerCase().replace(/ё/g, 'е') : '';
    if (type === 'conducted') {
      const c = row as UiConducted;
      return `${name}|${bin}|${date}|${meetType}|${result}|${c.cpSent ? 1 : 0}|${c.cpQuantity}`;
    }
    return `${name}|${bin}|${date}|${meetType}|${result}`;
  };
  const [cpQtyModal, setCpQtyModal] = useState<{ idx: number; input: string } | null>(null);
  const [savedRows, setSavedRows] = useState<Set<string>>(() => new Set(data.map(rowSig)));
  useEffect(() => {
    setSavedRows(new Set(data.map(rowSig)));
  }, [seedKey]);

  useEffect(() => {
    if (!reportDate) return;
    const needsSync = data.some((row) => row.date !== reportDate);
    if (!needsSync) return;
    const synced = data.map((row) => ({ ...row, date: reportDate }));
    if (type === 'assigned') {
      (setData as SetState<UiAssigned[]>)(synced as UiAssigned[]);
    } else {
      (setData as SetState<UiConducted[]>)(synced as UiConducted[]);
    }
  }, [data, reportDate, setData, type]);

  const addRow = () => {
    if (type === 'assigned') {
      (setData as SetState<UiAssigned[]>)([
        ...(data as UiAssigned[]),
        { entityName: '', bin: '', date: reportDate, type: 'Новая' },
      ]);
    } else {
      (setData as SetState<UiConducted[]>)([
        ...(data as UiConducted[]),
        { entityName: '', bin: '', date: reportDate, type: 'Новая', result: '', cpSent: false, cpQuantity: 0, cpPaid: false },
      ]);
    }
  };
  const removeRow = (idx: number) => {
    const removedSig = rowSig(data[idx]);
    setSavedRows((prev) => {
      const n = new Set(prev);
      n.delete(removedSig);
      return n;
    });
    const next = data.filter((_, i) => i !== idx);
    if (type === 'assigned') (setData as SetState<UiAssigned[]>)(next as UiAssigned[]);
    else (setData as SetState<UiConducted[]>)(next as UiConducted[]);
  };
  const updateEntityAndBin = (idx: number, entityName: string, bin: string) => {
    const updated = [...data] as Record<string, unknown>[];
    const prevSig = rowSig(data[idx]);
    updated[idx].entityName = entityName;
    updated[idx].bin = bin;
    if (
      type === 'assigned' &&
      hasAnyNewMeetingForCounterparty(entityName, bin, idx) &&
      isNewMeetingType(String(updated[idx].type ?? ''))
    ) {
      updated[idx].type = 'Повторная';
    }
    if (type === 'conducted') {
      const forcedType = getForcedConductedTypeForCounterparty(entityName, bin, idx);
      if (forcedType) {
        updated[idx].type = forcedType;
      }
    }
    const nextSig = rowSig(updated[idx] as UiAssigned | UiConducted);
    setSavedRows((prev) => {
      const n = new Set(prev);
      n.delete(prevSig);
      n.delete(nextSig);
      return n;
    });
    (setData as (u: (UiAssigned | UiConducted)[]) => void)(updated as never);
  };
  const updateRow = (idx: number, field: string, val: string) => {
    const updated = [...data] as Record<string, unknown>[];
    const prevSig = rowSig(data[idx]);
    updated[idx][field] = val;
    const nextSig = rowSig(updated[idx] as UiAssigned | UiConducted);
    setSavedRows((prev) => {
      const n = new Set(prev);
      n.delete(prevSig);
      n.delete(nextSig);
      return n;
    });
    (setData as (u: (UiAssigned | UiConducted)[]) => void)(updated as never);
  };

  const patchConductedRow = (idx: number, patch: Partial<Pick<UiConducted, 'cpSent' | 'cpQuantity'>>) => {
    if (type !== 'conducted') return;
    const list = [...(data as UiConducted[])];
    const prevSig = rowSig(list[idx]);
    list[idx] = { ...list[idx], ...patch };
    const nextSig = rowSig(list[idx]);
    setSavedRows((prev) => {
      const n = new Set(prev);
      n.delete(prevSig);
      n.delete(nextSig);
      return n;
    });
    (setData as SetState<UiConducted[]>)(list);
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-4 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 text-left min-w-0">
          {icon}
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide truncate">{title}</h2>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="shrink-0 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 font-bold px-3 sm:px-4 py-2 rounded-xl text-sm transition flex items-center shadow-sm min-h-10"
        >
          <Plus size={16} className="sm:mr-1.5" /> <span className="hidden sm:inline">Добавить</span>
        </button>
      </div>
      {data.length > 0 ? (
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 om-scroll">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="text-[9px] font-bold text-gray-400 uppercase border-b border-gray-50 tracking-widest">
                <th className="pb-4">Контрагент / БИН</th>
                <th className="pb-4 w-36 px-4 text-center">Тип</th>
                {type === 'conducted' && (
                  <th className="pb-4 w-44 px-2 text-center text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                    ЦП
                  </th>
                )}
                {type === 'conducted' && <th className="pb-4 min-w-[220px] max-w-[320px] px-2 text-left">Итог</th>}
                <th className="pb-4 w-36 text-center">Сохранить</th>
                <th className="pb-4 w-10" />
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => {
                if (
                  type === 'assigned' &&
                  shouldHidePlannedEnterpriseLead(row, [
                    ...currentConductedMeetings,
                    ...allReports.flatMap((r) => r.conductedMeetings),
                  ])
                ) {
                  return null;
                }
                return (
                <tr key={idx}>
                  <td className="py-4 pr-2 min-w-[300px]">
                    <ContractorLookup
                      value={row.entityName}
                      onSelect={(name, bin) => {
                        updateEntityAndBin(idx, name, bin);
                      }}
                      clients={clients}
                      onOpenAddClient={onOpenAddClient}
                    />
                  </td>
                  <td className="py-4 px-4">
                    <div className="relative">
                      {type === 'conducted' && (() => {
                        const forcedType = getForcedConductedTypeForCounterparty(row.entityName, row.bin, idx);
                        return forcedType ? (
                          <p className="pointer-events-none absolute -top-4 left-1 text-[9px] font-bold uppercase tracking-wide text-blue-600 whitespace-nowrap">
                            Только «{forcedType}»
                          </p>
                        ) : null;
                      })()}
                      {type === 'assigned' &&
                        hasAnyNewMeetingForCounterparty(row.entityName, row.bin, idx) &&
                        isNewMeetingType(row.type) && (
                          <p className="pointer-events-none absolute -top-4 left-1 text-[9px] font-bold uppercase tracking-wide text-amber-600 whitespace-nowrap">
                            Только «Повторная»
                          </p>
                        )}
                    <select
                      className="w-full bg-gray-50/50 p-3 rounded-2xl text-sm font-bold text-center h-[46px] outline-none cursor-pointer"
                      value={row.type}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        if (type === 'conducted') {
                          const forcedType = getForcedConductedTypeForCounterparty(row.entityName, row.bin, idx);
                          if (forcedType && nextType !== forcedType && !isKrupType(nextType)) {
                            alert(`С этим контрагентом есть непроведенная назначенная «${forcedType}». Доступен только этот тип.`);
                            updateRow(idx, 'type', forcedType);
                            return;
                          }
                        }
                        if (
                          type === 'assigned' &&
                          isNewMeetingType(nextType) &&
                          hasAnyNewMeetingForCounterparty(row.entityName, row.bin, idx)
                        ) {
                          alert('С этим контрагентом уже была «Новая» встреча. Доступен только статус «Повторная».');
                          updateRow(idx, 'type', 'Повторная');
                          return;
                        }
                        updateRow(idx, 'type', nextType);
                        if (!isKrupType(nextType)) {
                          setDiggerPickByIdx((prev) => {
                            const n = { ...prev };
                            delete n[idx];
                            return n;
                          });
                        } else if (canSetDigger) {
                          const bin = normalizeBin(row.bin);
                          const existing = clients.find((c) => normalizeBin(c.bin) === bin)?.diggerId;
                          if (existing) {
                            setDiggerPickByIdx((prev) => ({ ...prev, [idx]: existing }));
                          }
                        }
                      }}
                    >
                      {type === 'conducted'
                        ? (() => {
                            const forcedType = getForcedConductedTypeForCounterparty(row.entityName, row.bin, idx);
                            if (forcedType) {
                              return (
                                <>
                                  <option>{forcedType}</option>
                                  <option>Крупный лид</option>
                                </>
                              );
                            }
                            return (
                              <>
                                <option>Новая</option>
                                <option>Повторная</option>
                                <option>Крупный лид</option>
                              </>
                            );
                          })()
                        : null}
                      {type !== 'conducted' &&
                        !(type === 'assigned' && hasAnyNewMeetingForCounterparty(row.entityName, row.bin, idx)) && (
                          <option>Новая</option>
                        )}
                      {type !== 'conducted' && <option>Повторная</option>}
                      {type !== 'conducted' && <option>Крупный лид</option>}
                    </select>
                    {canSetDigger && isKrupType(row.type) && diggerProfiles.length > 0 ? (
                      <select
                        className="mt-1.5 w-full bg-white border border-gray-200 p-2 rounded-xl text-[11px] font-bold outline-none"
                        value={
                          diggerPickByIdx[idx] ||
                          clients.find((c) => normalizeBin(c.bin) === normalizeBin(row.bin))?.diggerId ||
                          ''
                        }
                        onChange={(e) =>
                          setDiggerPickByIdx((prev) => ({ ...prev, [idx]: e.target.value }))
                        }
                      >
                        <option value="">Лидоруб…</option>
                        {diggerProfiles.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.fullName || d.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    </div>
                  </td>
                  {type === 'conducted' && (
                    <td className="py-4 px-2 align-top w-44">
                      <select
                        className="w-full bg-gray-50/50 p-2 rounded-2xl text-xs font-bold h-[46px] outline-none cursor-pointer"
                        value={(row as UiConducted).cpSent ? 'yes' : 'no'}
                        onChange={(e) => {
                          if (e.target.value === 'no') {
                            patchConductedRow(idx, { cpSent: false, cpQuantity: 0 });
                          } else {
                            setCpQtyModal({
                              idx,
                              input:
                                (row as UiConducted).cpQuantity >= 1 ? String((row as UiConducted).cpQuantity) : '',
                            });
                          }
                        }}
                      >
                        <option value="no">Нет</option>
                        <option value="yes">Да, ЦП выставлено</option>
                      </select>
                      {(row as UiConducted).cpSent && (row as UiConducted).cpQuantity >= 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setCpQtyModal({
                              idx,
                              input: String((row as UiConducted).cpQuantity),
                            })
                          }
                          className="mt-1.5 w-full text-[9px] font-bold uppercase text-blue-600 hover:underline"
                        >
                          Изменить кол-во
                        </button>
                      ) : null}
                    </td>
                  )}
                  {type === 'conducted' && (
                    <td className="py-4 px-2 align-top min-w-[220px] max-w-[320px]">
                      <button
                        type="button"
                        onClick={() => onResultClick?.(idx)}
                        title={(row as UiConducted).result?.trim() ? 'Редактировать итог' : 'Ввести итог'}
                        className={`w-full min-h-[46px] text-left rounded-2xl border px-3 py-2.5 transition-all ${
                          (row as UiConducted).result?.trim()
                            ? 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-300'
                            : 'border-dashed border-gray-200 bg-gray-50/80 hover:border-gray-300'
                        }`}
                      >
                        {(row as UiConducted).result?.trim() ? (
                          <span className="text-[11px] font-medium text-gray-800 whitespace-pre-wrap break-words line-clamp-6">
                            {(row as UiConducted).result}
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Нажмите, чтобы ввести итог</span>
                        )}
                      </button>
                    </td>
                  )}
                  <td className="py-4 px-2 text-center">
                    {savedRows.has(rowSig(row as UiAssigned | UiConducted)) ? (
                      <span className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100">
                        Сохранено
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          if (type === 'conducted') {
                            const current = row as UiConducted;
                            if (!current.result || !current.result.trim()) {
                              alert('Заполните результат встречи перед сохранением.');
                              return;
                            }
                            if (current.cpSent && (!current.cpQuantity || current.cpQuantity < 1)) {
                              alert('Если ЦП отправлено — укажите количество (целое число от 1) или выберите «Нет».');
                              return;
                            }
                          }
                          const currentSig = rowSig(row as UiAssigned | UiConducted);
                          const ok = await onSaveItem();
                          if (ok) {
                            if (canSetDigger && isKrupType(row.type)) {
                              const diggerId = diggerPickByIdx[idx];
                              const bin = normalizeBin(row.bin);
                              if (diggerId && bin.length === 12) {
                                try {
                                  await setClientDigger(bin, diggerId);
                                } catch (e) {
                                  alert(e instanceof Error ? e.message : 'Не удалось сохранить лидоруба');
                                }
                              }
                            }
                            setSavedRows((prev) => {
                              const n = new Set(prev);
                              n.add(currentSig);
                              // После успешного сохранения помечаем текущий срез таблицы как сохранённый.
                              // Это делает UI предсказуемым: кнопка сразу меняется на "Сохранено".
                              for (const item of data) {
                                n.add(rowSig(item as UiAssigned | UiConducted));
                              }
                              return n;
                            });
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-100 hover:bg-blue-100"
                      >
                        Сохранить
                      </button>
                    )}
                  </td>
                  <td className="py-4 text-right">
                    <button type="button" onClick={() => removeRow(idx)} className="text-gray-200 hover:text-red-500">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 text-center text-gray-300 text-[10px] font-bold uppercase border-2 border-dashed border-gray-50 rounded-2xl">
          Нет записей
        </div>
      )}
      {cpQtyModal && type === 'conducted' && (
        <div
          className="fixed inset-0 bg-gray-900/40 z-[550] flex items-center justify-center p-4"
          onClick={() => {
            const r = (data as UiConducted[])[cpQtyModal.idx];
            if (!(r.cpSent && r.cpQuantity >= 1)) {
              patchConductedRow(cpQtyModal.idx, { cpSent: false, cpQuantity: 0 });
            }
            setCpQtyModal(null);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 max-w-sm w-full text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-widest mb-2">Количество ЦП</h4>
            <p className="text-[11px] text-gray-500 mb-3">Укажите, сколько единиц ЦП отправлено.</p>
            <input
              type="number"
              min={1}
              step={1}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold mb-4"
              autoFocus
              value={cpQtyModal.input}
              onChange={(e) => setCpQtyModal((m) => (m ? { ...m, input: e.target.value } : m))}
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase border border-gray-200 text-gray-600"
                onClick={() => {
                  const r = (data as UiConducted[])[cpQtyModal.idx];
                  if (!(r.cpSent && r.cpQuantity >= 1)) {
                    patchConductedRow(cpQtyModal.idx, { cpSent: false, cpQuantity: 0 });
                  }
                  setCpQtyModal(null);
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase bg-blue-600 text-white"
                onClick={() => {
                  const n = parseInt(cpQtyModal.input.trim(), 10);
                  if (!Number.isFinite(n) || n < 1) {
                    alert('Введите целое число от 1.');
                    return;
                  }
                  patchConductedRow(cpQtyModal.idx, { cpSent: true, cpQuantity: n });
                  setCpQtyModal(null);
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
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
  managerOptions,
  staffDept,
  setStaffDept,
  onOpenRealization,
}: {
  reports: FullReport[];
  filterManager: string;
  setFilterManager: SetState<string>;
  filterDateFrom: string;
  setFilterDateFrom: SetState<string>;
  filterDateTo: string;
  setFilterDateTo: SetState<string>;
  managerOptions: string[];
  staffDept: StaffDept;
  setStaffDept: (dept: StaffDept) => void;
  onOpenRealization: (
    title: string,
    rows: Array<{ manager: string; reportDate: string; entityName: string; bin: string; date: string; type: string }>,
  ) => void;
}) => {
  const normalizeText = (value: string) => value.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  const normalizeBin = (value: string) => value.replace(/\D/g, '');
  const buildCounterpartyKey = (name: string, bin: string) => `${normalizeBin(bin)}|${normalizeText(name)}`;

  const analyticsPeriod = useMemo(() => adminDateFilterBounds(filterDateFrom, filterDateTo), [filterDateFrom, filterDateTo]);
  const analyticsPeriodLabel = `${formatDisplayDate(analyticsPeriod.from)} — ${formatDisplayDate(analyticsPeriod.to)}${
    analyticsPeriod.isDefaultMonth ? ' · текущий месяц по умолчанию' : ''
  }`;

  const hasConductedEvidence = (planned: UiAssigned, manager: string) => {
    const plannedName = normalizeText(planned.entityName);
    const plannedBin = normalizeBin(planned.bin);
    const plannedType = normalizeText(planned.type);
    for (const report of reports) {
      if (report.manager !== manager) continue;
      const match = report.conductedMeetings.some(
        (cm) =>
          normalizeBin(cm.bin) === plannedBin &&
          normalizeText(cm.type) === plannedType &&
          normalizeText(cm.entityName) === plannedName &&
          cm.date >= planned.date,
      );
      if (match) return true;
    }
    return false;
  };

  const summaryTotals = useMemo(() => {
    let plan = 0;
    let fact = 0;
    let realized = 0;
    let revenue = 0;
    for (const report of reports) {
      plan += report.assignedMeetings.length;
      fact += report.conductedMeetings.length;
      revenue += report.confirmedOrders.reduce((sum, order) => sum + order.totalAmount, 0);
      for (const assigned of report.assignedMeetings) {
        if (hasConductedEvidence(assigned, report.manager)) realized += 1;
      }
    }
    return { plan, fact, realized, revenue };
  }, [reports]);

  const counterpartyRows = useMemo(() => {
    const rows = new Map<
      string,
      {
        key: string;
        name: string;
        bin: string;
        plan: number;
        fact: number;
        realized: number;
        realizedRows: Array<{ manager: string; reportDate: string; entityName: string; bin: string; date: string; type: string }>;
        revenue: number;
        managers: Set<string>;
        minDate: string;
        maxDate: string;
      }
    >();

    const ensureRow = (name: string, bin: string, manager: string, reportDate: string) => {
      const cleanName = name.trim();
      const cleanBin = bin.trim();
      if (!cleanName) return null;
      const key = buildCounterpartyKey(cleanName, cleanBin);
      const existing = rows.get(key);
      if (existing) {
        existing.managers.add(manager);
        if (reportDate < existing.minDate) existing.minDate = reportDate;
        if (reportDate > existing.maxDate) existing.maxDate = reportDate;
        return existing;
      }
      const created = {
        key,
        name: cleanName,
        bin: cleanBin,
        plan: 0,
        fact: 0,
        realized: 0,
        realizedRows: [],
        revenue: 0,
        managers: new Set([manager]),
        minDate: reportDate,
        maxDate: reportDate,
      };
      rows.set(key, created);
      return created;
    };

    for (const report of reports) {
      for (const assigned of report.assignedMeetings) {
        const row = ensureRow(assigned.entityName, assigned.bin, report.manager, report.date);
        if (!row) continue;
        row.plan += 1;
        if (hasConductedEvidence(assigned, report.manager)) {
          row.realized += 1;
          row.realizedRows.push({
            manager: report.manager,
            reportDate: report.date,
            entityName: assigned.entityName,
            bin: assigned.bin,
            date: assigned.date,
            type: assigned.type,
          });
        }
      }
      for (const conducted of report.conductedMeetings) {
        const row = ensureRow(conducted.entityName, conducted.bin, report.manager, report.date);
        if (!row) continue;
        row.fact += 1;
      }
      for (const order of report.confirmedOrders) {
        const row = ensureRow(order.entityName, order.bin, report.manager, report.date);
        if (!row) continue;
        row.revenue += order.totalAmount;
      }
    }

    return Array.from(rows.values())
      .sort((a, b) => b.revenue - a.revenue || b.plan - a.plan || a.name.localeCompare(b.name, 'ru'))
      .map((row) => ({
        ...row,
        managersText: Array.from(row.managers).sort((a, b) => a.localeCompare(b, 'ru')).join(', '),
      }));
  }, [reports]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
      <AdminFilters
        manager={filterManager}
        setManager={setFilterManager}
        from={filterDateFrom}
        setFrom={setFilterDateFrom}
        to={filterDateTo}
        setTo={setFilterDateTo}
        managerOptions={managerOptions}
        staffDept={staffDept}
        setStaffDept={setStaffDept}
        onReset={() => {
          setStaffDept('all');
          setFilterManager('Все');
          const b = adminDateFilterBounds('', '');
          setFilterDateFrom(b.from);
          setFilterDateTo(b.to);
        }}
      />
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-left">
        <p className="text-[11px] font-bold text-blue-900 uppercase tracking-wider mb-1">Как читать таблицу</p>
        <p className="text-xs text-blue-800">
          Сверху показан общий итог по отфильтрованным отчётам. Ниже — детализация по каждому контрагенту.
          <span className="font-bold"> План</span> — назначенные, <span className="font-bold">Факт</span> — проведённые,
          <span className="font-bold"> Реализация</span> — доведено до проведения.
        </p>
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Общая сводка</p>
        <p className="text-[10px] text-gray-500 mb-3">{analyticsPeriodLabel}</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3">
            <p className="text-[10px] text-indigo-700 font-bold uppercase">План</p>
            <p className="text-xl font-black text-indigo-900">{summaryTotals.plan}</p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
            <p className="text-[10px] text-blue-700 font-bold uppercase">Факт</p>
            <p className="text-xl font-black text-blue-900">{summaryTotals.fact}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
            <p className="text-[10px] text-emerald-700 font-bold uppercase">Реализация</p>
            <p className="text-xl font-black text-emerald-900">
              {summaryTotals.realized} <span className="text-sm opacity-60">/ {summaryTotals.plan}</span>
            </p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
            <p className="text-[10px] text-amber-700 font-bold uppercase">Выручка</p>
            <p className="text-xl font-black text-amber-900 whitespace-nowrap">{new Intl.NumberFormat('ru-RU').format(summaryTotals.revenue)} ₸</p>
          </div>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto text-left">
        <table className="w-full text-left border-collapse min-w-[1100px]">
          <thead>
            <tr className="bg-gray-50/50 text-[10px] font-bold text-gray-400 uppercase border-b border-gray-100">
              <th className="py-6 px-4">Контрагент</th>
              <th className="py-6 px-4">Менеджер(ы)</th>
              <th className="py-6 px-4">Период</th>
              <th className="py-6 px-4 text-center">План</th>
              <th className="py-6 px-4 text-center">Факт</th>
              <th className="py-6 px-4 text-center">Реализация</th>
              <th className="py-6 px-8 text-right">Выручка</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {counterpartyRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-gray-400">
                  Нет данных по контрагентам за выбранный период.
                </td>
              </tr>
            ) : (
              counterpartyRows.map((row) => (
                <tr key={row.key} className="hover:bg-gray-50/50">
                  <td className="py-5 px-4">
                    <div className="font-bold text-gray-800">{row.name}</div>
                    <div className="text-[11px] text-gray-400 font-mono">{row.bin || '—'}</div>
                  </td>
                  <td className="py-5 px-4 text-sm text-gray-700">{row.managersText}</td>
                  <td className="py-5 px-4 text-sm text-gray-600 whitespace-nowrap">
                    {formatDisplayDate(row.minDate)}
                    {row.maxDate !== row.minDate ? ` — ${formatDisplayDate(row.maxDate)}` : ''}
                  </td>
                  <td className="py-5 px-4 text-center">
                    <DashboardBadge icon={<Clock size={12} />} count={row.plan} color="indigo" />
                  </td>
                  <td className="py-5 px-4 text-center">
                    <DashboardBadge icon={<CalendarCheck size={12} />} count={row.fact} color="blue" />
                  </td>
                  <td className="py-5 px-4 text-center">
                    {row.realized > 0 ? (
                      <button
                        type="button"
                        onClick={() => onOpenRealization(`Реализация · ${row.name}`, row.realizedRows)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg font-black text-[10px] hover:bg-emerald-100"
                        title="Показать доведённые встречи"
                      >
                        <Target size={12} /> {row.realized} <span className="opacity-40">/ {row.plan}</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg font-black text-[10px]">
                        <Target size={12} /> {row.realized} <span className="opacity-40">/ {row.plan}</span>
                      </span>
                    )}
                  </td>
                  <td className="py-5 px-8 text-right font-black text-gray-900 whitespace-nowrap">
                    {new Intl.NumberFormat('ru-RU').format(row.revenue)} ₸
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const OrderSumCell = ({
  amount,
  commission,
  showCommission,
}: {
  amount: number;
  commission: number | null;
  showCommission: boolean;
}) => (
  <td className="py-5 px-8 text-right whitespace-nowrap">
    <span className="font-black text-emerald-600 block">
      {new Intl.NumberFormat('ru-RU').format(amount)} ₸
    </span>
    {showCommission && commission != null ? (
      <span className="text-[10px] font-bold text-blue-700 mt-0.5 block">
        Итого комиссия: {new Intl.NumberFormat('ru-RU').format(commission)} ₸
      </span>
    ) : null}
  </td>
);

const OrdersHistoryDashboard = ({
  isAdmin,
  orders,
  groupedOrders,
  viewMode,
  setViewMode,
  clientKtpByBin,
  totalOrdersCount,
  filterManager,
  setFilterManager,
  filterDateFrom,
  setFilterDateFrom,
  filterDateTo,
  setFilterDateTo,
  filterCounterparty,
  setFilterCounterparty,
  counterpartyOptions,
  managerOptions,
  openOrderDetails,
  openGroupedOrderDetails,
  onEditOrder,
  onCreateOrder,
}: {
  isAdmin: boolean;
  orders: OrderRow[];
  groupedOrders: GroupedCounterpartyOrder[];
  viewMode: 'records' | 'byCounterparty';
  setViewMode: SetState<'records' | 'byCounterparty'>;
  clientKtpByBin: Map<string, boolean>;
  totalOrdersCount: number;
  filterManager: string;
  setFilterManager: SetState<string>;
  filterDateFrom: string;
  setFilterDateFrom: SetState<string>;
  filterDateTo: string;
  setFilterDateTo: SetState<string>;
  filterCounterparty: string;
  setFilterCounterparty: SetState<string>;
  counterpartyOptions: string[];
  managerOptions: string[];
  openOrderDetails: (order: OrderRow) => void;
  openGroupedOrderDetails: (group: GroupedCounterpartyOrder) => void;
  onEditOrder?: (order: OrderRow) => void;
  onCreateOrder?: () => void;
}) => {
  type OrdersSortKey = 'orderCount' | 'totalAmount';

  const [sortConfig, setSortConfig] = useState<{ key: OrdersSortKey; direction: 'asc' | 'desc' } | null>(null);

  const isGroupedView = isAdmin && viewMode === 'byCounterparty';
  const displayRowCount = isGroupedView ? groupedOrders.length : orders.length;

  const handleSort = (key: OrdersSortKey) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  };

  const SortIcon = ({ col }: { col: OrdersSortKey }) =>
    sortConfig?.key === col ? (
      sortConfig.direction === 'asc' ? (
        <ChevronUp size={14} className="ml-1 text-blue-600" />
      ) : (
        <ChevronDown size={14} className="ml-1 text-blue-600" />
      )
    ) : null;

  const sortedOrders = useMemo(() => {
    if (!sortConfig) return orders;
    const { key, direction } = sortConfig;
    const mul = direction === 'asc' ? 1 : -1;
    return [...orders].sort((a, b) => {
      const av = key === 'orderCount' ? a.orderCount : a.totalAmount;
      const bv = key === 'orderCount' ? b.orderCount : b.totalAmount;
      if (av !== bv) return (av - bv) * mul;
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return a.entityName.localeCompare(b.entityName, 'ru');
    });
  }, [orders, sortConfig]);

  const sortedGroupedOrders = useMemo(() => {
    if (!sortConfig) return groupedOrders;
    const { key, direction } = sortConfig;
    const mul = direction === 'asc' ? 1 : -1;
    return [...groupedOrders].sort((a, b) => {
      const av = key === 'orderCount' ? a.orderCount : a.totalAmount;
      const bv = key === 'orderCount' ? b.orderCount : b.totalAmount;
      if (av !== bv) return (av - bv) * mul;
      return a.entityName.localeCompare(b.entityName, 'ru');
    });
  }, [groupedOrders, sortConfig]);

  const ordersTotalAmount = useMemo(
    () => orders.reduce((sum, o) => sum + o.totalAmount, 0),
    [orders],
  );

  const ordersCommissionTotal = useMemo(
    () =>
      orders.reduce((sum, o) => {
        const total = resolveOrderCommissionTotal(o, clientKtpByBin);
        if (total == null) return sum;
        return sum + total;
      }, 0),
    [orders, clientKtpByBin],
  );

  const ordersWithoutCommissionCount = useMemo(
    () => orders.reduce((sum, o) => sum + countOrderLinesWithoutCommission(o, clientKtpByBin), 0),
    [orders, clientKtpByBin],
  );

  const uniqueCounterpartiesCount = useMemo(() => {
    if (isGroupedView) return groupedOrders.length;
    const seen = new Set<string>();
    for (const o of orders) {
      seen.add(`${o.entityName.trim().toLowerCase()}|${o.bin.trim()}`);
    }
    return seen.size;
  }, [orders, groupedOrders, isGroupedView]);

  const commissionForGroup = useCallback(
    (group: GroupedCounterpartyOrder): number | null => {
      let sum = 0;
      let hasAny = false;
      for (const o of group.sourceOrders) {
        const total = resolveOrderCommissionTotal(o, clientKtpByBin);
        if (total != null) {
          sum += total;
          hasAny = true;
        }
      }
      return hasAny ? sum : null;
    },
    [clientKtpByBin],
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 text-left">
      {isAdmin ? (
        <AdminFilters
          manager={filterManager}
          setManager={setFilterManager}
          from={filterDateFrom}
          setFrom={setFilterDateFrom}
          to={filterDateTo}
          setTo={setFilterDateTo}
          managerOptions={managerOptions}
          onReset={() => {
            setFilterManager('Все');
            const b = adminDateFilterBounds('', '');
            setFilterDateFrom(b.from);
            setFilterDateTo(b.to);
            setFilterCounterparty('');
          }}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
          <PeriodFilterFields
            from={filterDateFrom}
            to={filterDateTo}
            setFrom={setFilterDateFrom}
            setTo={setFilterDateTo}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                const b = adminDateFilterBounds('', '');
                setFilterDateFrom(b.from);
                setFilterDateTo(b.to);
                setFilterCounterparty('');
              }}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold uppercase tracking-wider text-gray-600 hover:bg-gray-50"
            >
              Сбросить фильтр
            </button>
          </div>
        </div>
      )}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-end">
        <div className="w-full sm:flex-1 sm:min-w-[220px] space-y-1.5 text-left">
          <label className="text-[10px] font-bold text-gray-400 uppercase">Контрагент (название или БИН)</label>
          <input
            list="orders-counterparty-options"
            type="text"
            className="w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm"
            value={filterCounterparty}
            onChange={(e) => setFilterCounterparty(e.target.value)}
            placeholder="Например: Прогресс или 123456..."
          />
          <datalist id="orders-counterparty-options">
            {counterpartyOptions.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </div>
        <button
          type="button"
          onClick={() => setFilterCounterparty('')}
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold uppercase tracking-wider text-gray-600 hover:bg-gray-50"
        >
          Очистить контрагента
        </button>
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-wrap gap-6 items-center">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase">Количество записей</p>
          <p className="text-lg font-black text-gray-900">{displayRowCount}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase">Количество заказов</p>
          <p className="text-lg font-black text-gray-900">{totalOrdersCount}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase">Уникальных контрагентов</p>
          <p className="text-lg font-black text-gray-900">{uniqueCounterpartiesCount}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase">Итого сумма по заказам</p>
          <p className="text-lg font-black text-emerald-700 whitespace-nowrap">{new Intl.NumberFormat('ru-RU').format(ordersTotalAmount)} ₸</p>
        </div>
        {isAdmin ? (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase">Итого комиссия</p>
            <p className="text-lg font-black text-blue-700 whitespace-nowrap">
              {new Intl.NumberFormat('ru-RU').format(ordersCommissionTotal)} ₸
            </p>
            {ordersWithoutCommissionCount > 0 ? (
              <p className="text-[9px] text-gray-400 font-bold mt-0.5">
                без комиссии: {ordersWithoutCommissionCount}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Подтверждённые заказы</h2>
        <div className="flex flex-wrap items-center gap-2">
          {onCreateOrder ? (
            <button
              type="button"
              onClick={onCreateOrder}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-blue-500"
            >
              <Plus size={14} />
              Создать заказ
            </button>
          ) : null}
          {isAdmin ? (
            <button
              type="button"
              onClick={() =>
                exportOrdersToExcel(orders, {
                  clientKtpByBin,
                  includeCommission: true,
                })
              }
              disabled={orders.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-[10px] font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Download size={14} />
              Выгрузить в Excel
            </button>
          ) : null}
          {isAdmin ? (
            <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setViewMode('records')}
              className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                viewMode === 'records' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              По записям
            </button>
            <button
              type="button"
              onClick={() => setViewMode('byCounterparty')}
              className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                viewMode === 'byCounterparty' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              По контрагентам
            </button>
          </div>
          ) : null}
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto text-left">
        <table className="w-full text-left border-collapse min-w-[1120px]">
          <thead>
            <tr className="bg-gray-50/50 text-[10px] font-bold text-gray-400 border-b border-gray-100">
              <th className="py-6 px-8">Дата</th>
              {isAdmin && <th className="py-6 px-4">Менеджер</th>}
              <th className="py-6 px-4">БИН/ИИН</th>
              <th className="py-6 px-4">Контрагент</th>
              <th className="py-6 px-4">Заказ через (ЮЛ)</th>
              <th
                className="py-6 px-4 text-center cursor-pointer hover:bg-gray-100/80 select-none"
                onClick={() => handleSort('orderCount')}
              >
                <div className="flex items-center justify-center">
                  Кол-во
                  <SortIcon col="orderCount" />
                </div>
              </th>
              <th
                className="py-6 px-8 text-right cursor-pointer hover:bg-gray-100/80 select-none"
                onClick={() => handleSort('totalAmount')}
              >
                <div className="flex items-center justify-end">
                  Сумма
                  <SortIcon col="totalAmount" />
                </div>
              </th>
              {isAdmin && onEditOrder && !isGroupedView ? <th className="py-6 px-4 text-center w-16" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isGroupedView
              ? sortedGroupedOrders.map((group, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/50 text-sm">
                    <td className="py-5 px-8 text-gray-500 whitespace-nowrap">{formatDisplayDate(group.date)}</td>
                    {isAdmin && (
                      <td className="py-5 px-4 font-bold text-gray-800 whitespace-nowrap">{group.manager}</td>
                    )}
                    <td className="py-5 px-4 font-mono text-gray-400 text-[11px]">{group.bin}</td>
                    <td className="py-5 px-4 font-black text-gray-800">{group.entityName}</td>
                    <td className="py-5 px-4 text-gray-400">—</td>
                    <td className="py-5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => openGroupedOrderDetails(group)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl font-bold text-xs border border-blue-100"
                      >
                        <List size={14} /> {group.orderCount}
                      </button>
                    </td>
                    <OrderSumCell
                      amount={group.totalAmount}
                      commission={commissionForGroup(group)}
                      showCommission={isAdmin}
                    />
                  </tr>
                ))
              : sortedOrders.map((order, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/50 text-sm">
                    <td className="py-5 px-8 text-gray-500 whitespace-nowrap">{formatDisplayDate(order.date)}</td>
                    {isAdmin && (
                      <td className="py-5 px-4 font-bold text-gray-800 whitespace-nowrap">{order.manager}</td>
                    )}
                    <td className="py-5 px-4 font-mono text-gray-400 text-[11px]">{order.bin}</td>
                    <td className="py-5 px-4 font-black text-gray-800">{order.entityName}</td>
                    <td className="py-5 px-4 text-gray-800">
                      {order.viaEntityName.trim() ? (
                        <>
                          <span className="font-bold">{order.viaEntityName}</span>
                          {order.viaBin.trim() ? (
                            <div className="text-[10px] font-mono text-gray-400 mt-0.5">{order.viaBin}</div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => openOrderDetails(order)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl font-bold text-xs border border-blue-100"
                      >
                        <List size={14} /> {order.orderCount}
                      </button>
                    </td>
                    <OrderSumCell
                      amount={order.totalAmount}
                      commission={resolveOrderCommissionTotal(order, clientKtpByBin)}
                      showCommission={isAdmin}
                    />
                    {isAdmin && onEditOrder ? (
                      <td className="py-5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => onEditOrder(order)}
                          className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50"
                          title="Редактировать заказ"
                        >
                          <Edit2 size={15} />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

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
  <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[300] flex items-center justify-center p-4" onClick={onClose}>
    <div
      className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between p-5 border-b border-gray-100">
        <div>
          <h3 className="text-lg font-extrabold text-gray-900">{entityName}</h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Итоги встречи</p>
        </div>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
          <X size={20} />
        </button>
      </div>
      <div className="p-5 space-y-4 text-left">
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            Комментарий (обязательно)
          </label>
          <textarea
            className="w-full h-40 p-4 bg-white border border-gray-200 rounded-lg outline-none text-sm font-medium focus:border-green-500 transition om-scroll"
            placeholder="О чем договорились? Следующие шаги?"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </div>
      <div className="p-5 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-200 border border-gray-200 transition"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={onSave}
          className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-semibold shadow-sm transition"
        >
          Сохранить итог
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
  <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
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
            <tr className="text-[10px] font-bold text-gray-400 border-b">
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
                      className={`px-2 py-1 rounded text-[9px] font-bold uppercase ${item.type === 'Новая' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
                    >
                      {item.type}
                    </span>
                  </td>
                  <td className="py-5 px-4 text-center text-gray-500 font-bold text-xs">
                      {formatDisplayDate(item.date)}
                  </td>
                  <td className="py-5 text-right">
                    {isAssignedType ? (
                      ev ? (
                        <div className="flex flex-col items-end">
                          <span className="text-emerald-600 font-black text-[10px] bg-emerald-50 px-3 py-1.5 rounded-full uppercase">Выполнено</span>
                          <span className="text-[9px] text-gray-400 mt-1">Отчет от {formatDisplayDate(ev.reportDate)}</span>
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
        <button type="button" onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold text-xs uppercase">
          Закрыть
        </button>
      </div>
    </div>
  </div>
);

const OrderItemsModal = ({
  modal,
  isAdmin,
  clientKtpByBin,
  onEdit,
  onClose,
}: {
  modal: {
    isOpen: boolean;
    entity: string;
    bin: string;
    viaBin?: string;
    viaEntityName?: string;
    amounts: number[];
    totalAmount: number;
    mrpKztApplied?: number | null;
    isKtpApplied?: boolean | null;
    commissionAmount?: number | null;
    sourceOrders?: OrderCommissionFields[];
    editableOrder?: OrderRow | null;
  };
  isAdmin: boolean;
  clientKtpByBin: Map<string, boolean>;
  onEdit?: () => void;
  onClose: () => void;
}) => {
  const lineAmounts = orderLineAmounts(modal.amounts, modal.totalAmount);
  const commission =
    modal.sourceOrders && modal.sourceOrders.length > 0
      ? resolveMergedOrdersCommissionDisplay(modal.sourceOrders, clientKtpByBin)
      : resolveOrderCommissionDisplay(modal, clientKtpByBin);

  const ktpHint = (() => {
    if (modal.sourceOrders?.length) {
      const withVia = modal.sourceOrders.find(
        (o) => String(o.viaBin ?? '').replace(/\D/g, '').length === 12,
      );
      if (withVia) {
        return commissionKtpSourceHint(withVia.bin ?? modal.bin, withVia.viaBin, withVia.viaEntityName);
      }
    }
    return commissionKtpSourceHint(modal.bin, modal.viaBin, modal.viaEntityName);
  })();

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[400] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-8 border-b flex justify-between items-center bg-gray-50/50 text-left">
          <div>
            <h3 className="font-black text-gray-900 text-lg uppercase">{modal.entity}</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">БИН: {modal.bin}</p>
            {isAdmin && ktpHint ? (
              <p className="text-[10px] font-bold text-blue-700 mt-1 normal-case">{ktpHint}</p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="p-3 hover:bg-gray-100 rounded-full text-gray-400">
            <X size={24} />
          </button>
        </div>
        <div className="p-8 space-y-4 max-h-[50vh] overflow-y-auto text-left">
          {lineAmounts.map((amt, idx) => (
            <div key={idx} className="flex justify-between items-start gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <span className="text-[10px] font-bold text-gray-400 uppercase pt-1">Заказ №{idx + 1}</span>
              <div className="text-right">
                <span className="text-lg font-black text-gray-800 block">{formatMoneyKzt(amt)} ₸</span>
                {isAdmin ? (
                  <span className="text-[10px] font-bold text-blue-700 mt-1 block">
                    {commission.lines[idx] != null
                      ? `Комиссия: ${formatMoneyKzt(commission.lines[idx])} ₸`
                      : 'Комиссия: —'}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <div className="p-8 bg-gray-50 flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-right">
          <div className="text-left sm:text-right">
            <p className="text-[10px] font-bold text-gray-400 uppercase">Итого сумма</p>
            <span className="text-xl font-black text-emerald-600">
              {formatMoneyKzt(lineAmounts.reduce((a, b) => a + b, 0))} ₸
            </span>
            {isAdmin && commission.total != null ? (
              <p className="text-[10px] font-bold text-blue-700 mt-1">
                Итого комиссия: {formatMoneyKzt(commission.total)} ₸
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {isAdmin && onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-2xl text-xs font-bold uppercase shrink-0 hover:bg-blue-500"
              >
                <Edit2 size={14} />
                Редактировать
              </button>
            ) : null}
            <button type="button" onClick={onClose} className="bg-gray-900 text-white px-8 py-3 rounded-2xl text-xs font-bold uppercase shrink-0">
              Ок
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
