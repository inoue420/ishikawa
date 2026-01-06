import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Alert,
  ScrollView,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from 'react-native';
import tw from 'twrnc';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import {
  fetchProjects,
  setProject,
  fetchAllUsers,
  findEmployeeByIdOrEmail,
  fetchProjectsOverlappingRange,
  addEditLog,
  fetchVehicles,
  fetchVehicleBlocksOverlapping,
  fetchReservationsInRange,
  fetchReservationsForProject,
  setVehicleReservation,
  clearReservationsForProject,
  // ▼ 参加従業員（1日×1人）API
  fetchAssignmentsInRange,
  fetchAssignmentsForProject,
  setEmployeeAssignment,
  clearAssignmentsForProject,  
  // ▼ Txベースの一括保存API（Detail画面と統一）
  saveProjectVehiclePlan,
  saveProjectParticipantPlan,
  // ▼ 顧客マスタ
  fetchClients,
  ensureClientByName,
} from '../../firestoreService';
import { Timestamp } from 'firebase/firestore';

// --- 共通ボタン（Textで包む） ---
function PrimaryButton({ title, onPress, disabled, danger }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={tw.style(
        'rounded px-4 py-2 items-center',
        danger ? 'bg-red-600' : 'bg-blue-600',
        disabled && 'opacity-50'
      )}
    >
      <Text style={tw`text-white font-bold`}>{title}</Text>
    </TouchableOpacity>
  );
}


// --- 安全な日付ヘルパー群 ---
const toSafeDate = (v) => {
  if (!v) return null;
  const d = v?.toDate ? v.toDate() : new Date(v);
  return (d instanceof Date && !isNaN(d)) ? d : null;
};
const fmtTime = (d) => d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';

// 分=00, 秒=0, ミリ秒=0 に丸める
function roundToHour(d = new Date()) {
  const x = new Date(d);
  x.setHours(x.getHours(), 0, 0, 0);
  return x;
}

// "1,234" 等も許容して number へ。数値化できなければ null
const toNumberOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

// 入力中から3桁区切り
const formatThousandsInput = (text) => {
  const digits = String(text).replace(/[^\d]/g, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// ── 追加: コスト計算用の定数
const EMPLOYEE_HOURLY = 2000;
const EXTERNAL_HOURLY  = 2800;
const RENTAL_PER_SQM   = 7;

// ── プロジェクトステータス
// Firestore には value を保存、画面では label を表示
export const STATUS_OPTIONS = [
  { value: 'prospect',    label: '見込み' },
  { value: 'quoted',      label: '見積提出済' },
  { value: 'ordered',     label: '受注確定' },
  { value: 'preparing',   label: '準備中' },
  { value: 'in_progress', label: '施工中' },
  { value: 'completed',   label: '完了' },
  { value: 'billed',      label: '請求済' },
  { value: 'cancelled',   label: '中止' },
];

// ── 工程ステータス（組立・解体など）
// Firestore には workStatuses フィールドとして保存
const WORK_STATUS_TYPES = [
  { key: 'assembly',   label: '組立' },
  { key: 'dismantle',  label: '解体' },
  { key: 'additional', label: '追加工事' },
  { key: 'regular',    label: '常用' },
  { key: 'correction', label: '是正' },
  { key: 'pickup',     label: '引き上げ' },
];

// 作業ステータスごとの「日程状態」フラグ
const WORK_SCHEDULE_STATUS_OPTIONS = [
  { value: 'fixed', label: '確定' },
  { value: 'pending', label: '未設定' },
];

// 日付のみ（00:00）に正規化
const dateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// 包含日数
const diffDaysInclusive = (start, end) =>
  Math.floor((dateOnly(end) - dateOnly(start)) / 86400000) + 1;
// YYYY-MM-DD
const toYmd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

// YYYY-MM-DD を「ローカル日付(00:00)」として Date 化（UTC解釈を避ける）
const parseYmdToDateLocal = (ymd) => {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

// start〜end の各日を 'YYYY-MM-DD' 配列で返す（両端含む）
const eachDateKeyInclusive = (start, end) => {
  if (!start || !end) return [];
  const s = dateOnly(start);
  const e = dateOnly(end);
  const res = [];
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    res.push(toYmd(d));
  }
  return res;
};


// 稼働時間: 同日=実時間 / 複数日=日数×8h
const calcWorkHours = (start, end) => {
  if (!start || !end) return 0;
  const multi = start.toDateString() !== end.toDateString();
  if (multi) {
    const days = Math.max(1, diffDaysInclusive(start, end));
    return days * 8;
  }
  const ms = end - start;
  return ms > 0 ? (ms / 3600000) : 0;
};

// ─────────────────────────────────────────
// 事業部（department）グルーピング設定
// UserRegisterScreen.js の DEPT_OPTIONS と同順
// const DEPT_OPTIONS = ['イベント事業','飲食事業','ライフサポート事業','安全管理','ASHIBAのコンビニ事業','office','サービス','仮設・足場事業','役員'];
// ─────────────────────────────────────────
const ALL_DEPT_OPTIONS = [
  'イベント事業',
  '飲食事業',
  'ライフサポート事業',
  '安全管理',
  'ASHIBAのコンビニ事業',
  'office',
  'サービス',
  '仮設・足場事業',
  '役員',
];
// 表示対象をこの4部門に固定
const ALLOWED_DEPTS = ['仮設・足場事業','イベント事業','ASHIBAのコンビニ事業','サービス'];
const FALLBACK_DEPT = '(未設定)'; // 旧データ救済用

export default function ProjectRegisterScreen({ route }) {
  // ===== 場所（ロケーション）定義 =====
  const LOCATION_CITIES = ['富山市', '高岡市', '射水市', '砺波市', '氷見市', '南砺市'];
  const LOCATION_OTHER = '__OTHER__';
  const [locationChoice, setLocationChoice] = useState(null); // 都市名 or LOCATION_OTHER
  const [locationOtherText, setLocationOtherText] = useState('');
  const chosenLocation = useMemo(
    () => (locationChoice === LOCATION_OTHER ? locationOtherText.trim() : (locationChoice || '')),
    [locationChoice, locationOtherText]
  );

  // ===== 役割（担当）用：チップ選択 + その他手入力 =====
  const OTHER_ROLE = '__OTHER_ROLE__';
  // 4役割ごとの選択状態（選択中ID or OTHER_ROLE）と「その他」入力
  const [salesChoice, setSalesChoice] = useState(null);
  const [salesOtherName, setSalesOtherName] = useState('');
  const [surveyChoice, setSurveyChoice] = useState(null);
  const [surveyOtherName, setSurveyOtherName] = useState('');
  const [designChoice, setDesignChoice] = useState(null);
  const [designOtherName, setDesignOtherName] = useState('');
  const [managementChoice, setManagementChoice] = useState(null);
  const [managementOtherName, setManagementOtherName] = useState('');
  // 選択値の「表示名」を取得（ID→社員名 / その他→入力テキスト）
  // （表示名が必要になったらここで使用）
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState(null);

  // ★ ログイン中の自分（Auth未使用でも userEmail から特定）
  const [me, setMe] = useState(null);
  useEffect(() => {
    (async () => {
      const emailFromRoute =
        route?.params?.userEmail ? String(route.params.userEmail).toLowerCase() : null;
      if (!emailFromRoute) return;
      const emp = await findEmployeeByIdOrEmail(emailFromRoute);
      if (emp) setMe(emp);
    })();
  }, [route?.params?.userEmail]);

  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [clients, setClients] = useState([]);
  const [clientCloseType, setClientCloseType] = useState('day'); // 'day' | 'eom'
  const [clientCloseDay, setClientCloseDay] = useState('25');
  const [startDate, setStartDate] = useState(() => roundToHour());
  const [endDate, setEndDate] = useState(() => roundToHour());

  // ログに使う日付（PDSから来たdate > なければ開始日のYMD）
  const dateForLog = useMemo(() => {
    const d = route?.params?.date;
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    return startDate ? toYmd(startDate) : null;
  }, [route?.params?.date, startDate]);

  // 金額・面積など
  const [orderAmount, setOrderAmount] = useState('');
  const [travelCost, setTravelCost] = useState('');
  const [miscExpense, setMiscExpense] = useState('');
  const [areaSqm, setAreaSqm] = useState('');

  // 新規/既存
  const [projectType, setProjectType] = useState(null);
  // 限定公開フラグ
  const [visibilityLimited, setVisibilityLimited] = useState(false);

  // ステータス（デフォルト：見込み）
  const [status, setStatus] = useState('prospect');

  // 従業員・担当
  const [employees, setEmployees] = useState([]);
  // 表示する事業部（4部門のみをトグル選択）
  const [visibleDeptSet, setVisibleDeptSet] = useState(new Set(['仮設・足場事業']));

  // 事業部→従業員 のグルーピング（division === '社員' のみ事業部に分類）
  const deptEmployeesOrdered = useMemo(() => {
    const map = {};
    for (const e of (employees || [])) {
      const div = (e?.division || '').trim();
      if (div === '社員') {
        const dept = (e?.department || '').trim() || FALLBACK_DEPT;
        if (!map[dept]) map[dept] = [];
        map[dept].push(e);
      }
    }
    // 表示順は ALL_DEPT_OPTIONS → その他（未設定等）
    const ordered = {};
    for (const d of ALL_DEPT_OPTIONS) if (map[d]?.length) ordered[d] = map[d];
    for (const d of Object.keys(map)) if (!ordered[d]) ordered[d] = map[d];
    return ordered;
  }, [employees]);  
  // 日毎の参加者選択 { 'YYYY-MM-DD': Set<employeeId> }
  const [participantSelectionsByDay, setParticipantSelectionsByDay] = useState({});
  // 使用不可マップ { 'YYYY-MM-DD': Set<employeeId> }
  const [unavailableEmpMap, setUnavailableEmpMap] = useState({});
  const [empAvailLoading, setEmpAvailLoading] = useState(false);

  // コスト算出等のため「全日合算の参加者」ユニオン配列を作る
  const participants = useMemo(() => {
    const s = new Set();
    Object.values(participantSelectionsByDay || {}).forEach(v => {
      const arr = Array.isArray(v) ? v : Array.from(v || []);
      arr.forEach(id => s.add(id));
    });
    return Array.from(s);
  }, [participantSelectionsByDay]);

  // ── 作業ステータス（工程）用 state ──
  const [workStatuses, setWorkStatuses] = useState([]); // {id,type,label,startDate,endDate,employeeIds,vehicleIds,expanded} の配列

  const vehiclePlanPrefilledRef = useRef(false);
  const participantPlanPrefilledRef = useRef(false);

 // ★追加: 作業ステータスの開始・終了からプロジェクト全体の開始・終了を自動反映
 useEffect(() => {
   const dated = (workStatuses || []).filter(ws => ws?.startDate && ws?.endDate);
   if (dated.length === 0) return;
   let minStart = dated[0].startDate;
   let maxEnd = dated[0].endDate;
   for (const ws of dated) {
     if (ws.startDate < minStart) minStart = ws.startDate;
     if (ws.endDate > maxEnd) maxEnd = ws.endDate;
   }
   setStartDate(prev => (prev?.getTime?.() === minStart.getTime() ? prev : minStart));
   setEndDate(prev => (prev?.getTime?.() === maxEnd.getTime() ? prev : maxEnd));
 }, [workStatuses]);
  
  // 作業ステータス用の Date/Time ピッカー
  const [statusPickerState, setStatusPickerState] = useState({
    visible: false,
    targetId: null,      // どのステータス行か
    field: null,         // 'start' | 'end'
    mode: 'date',        // 'date' | 'time'
  });

  // ピッカー対象ステータス
  const statusPickerTarget = useMemo(() => {
    if (!statusPickerState.targetId) return null;
    return workStatuses.find(ws => ws.id === statusPickerState.targetId) || null;
  }, [statusPickerState.targetId, workStatuses]);

  // ピッカーに表示する日時
  const statusPickerDate = useMemo(() => {
    if (!statusPickerTarget) return new Date();
    const field = statusPickerState.field === 'start' ? 'startDate' : 'endDate';
    return statusPickerTarget[field] || new Date();
  }, [statusPickerTarget, statusPickerState.field]);

   // 作業ステータス1件を生成
  const createWorkStatusUnit = useCallback((type, existingCount = 0) => {
    const base = WORK_STATUS_TYPES.find(t => t.key === type);
    const labelBase = base?.label || '工程';
    const label =
      type === 'additional' && existingCount > 0
        ? `${labelBase}${existingCount + 1}` // 追加工事2,3,...
        : labelBase;
    const now = roundToHour(new Date());
    return {
      id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type,
      label,
      startDate: now,
      endDate: now,
      employeeIds: [],
      vehicleIds: [],
      scheduleStatus: 'pending',
      expanded: true,
    };
  }, []);
 
  // 役員・部長のみを担当候補にする（従業員は除外）
  const managerCandidates = useMemo(() => {
    return (employees || []).filter(e => {
      const r = String(e?.role || '').toLowerCase();
      return r === 'executive' || r === 'manager';
    });
  }, [employees]);

  // 表示対象は「選択された4部門 ∩ 従業員がいる部門」
  const visibleDeptArray = useMemo(
    () => ALLOWED_DEPTS.filter(
      d => visibleDeptSet.has(d) && (deptEmployeesOrdered[d]?.length ?? 0) > 0
    ),
    [visibleDeptSet, deptEmployeesOrdered]
  );


  const leftBottomPadding = Platform.OS === 'ios' ? 160 : 160;

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchProjects();
      setProjects(list);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', 'プロジェクト一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadProjects(); }, [loadProjects]);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchAllUsers();
        setEmployees(list);
      } catch {
        Alert.alert('エラー', '従業員一覧の取得に失敗しました');
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cs = await fetchClients();
        setClients(cs);
      } catch (e) {
        console.warn(e);
      }
    })();
  }, []);

  const normalizedClientName = useMemo(
    () => String(clientName || '').trim().replace(/\s+/g, ' '),
    [clientName]
  );

  const clientSuggestions = useMemo(() => {
    const q = normalizedClientName.toLowerCase();
    if (!q) return [];
    return (clients || [])
      .filter(c => String(c.nameLower || c.name || '').toLowerCase().includes(q))
      .slice(0, 5);
  }, [clients, normalizedClientName]);

  const formatCloseLabel = useCallback((c) => {
    if (!c) return '';
    if (c.closeType === 'eom') return '末締め';
    const d = Number(c.closeDay);
    if (Number.isFinite(d) && d >= 1 && d <= 31) return `毎月${d}日`;
    return '未設定';
  }, []);

  useEffect(() => {
    const lower = normalizedClientName.toLowerCase();
    if (!lower) return;
    const hit = (clients || []).find(c => String(c.nameLower || c.name || '').toLowerCase() === lower);
    if (!hit) return;
    const ct = hit.closeType === 'eom' ? 'eom' : 'day';
    setClientCloseType(ct);
    if (ct === 'day') setClientCloseDay(hit.closeDay != null ? String(hit.closeDay) : '25');
  }, [normalizedClientName, clients]);

  // ===== 車両関連 =====
  const [vehicles, setVehicles] = useState([]);
  // { 'YYYY-MM-DD': { sales?: vehicleId, cargo?: vehicleId } }
  const [vehicleSelections, setVehicleSelections] = useState({});
  // { 'YYYY-MM-DD': Set(vehicleId) }
  const [unavailableMap, setUnavailableMap] = useState({});
  const [availLoading, setAvailLoading] = useState(false);
  const vehiclesById = useMemo(
    () => Object.fromEntries((vehicles || []).map(v => [v.id, v])),
    [vehicles]
  );

  useEffect(() => {
    (async () => {
      const vs = await fetchVehicles();
      setVehicles(vs);
    })();
  }, []);

  // ─────────────────────────────────────────────
  // ★重要: 「入力すべき日付」を、プロジェクト(start/end)の連続日ではなく
  //   workStatuses の日付集合（union）にする（飛び日OK）
  //   ※ workStatuses が無い場合のみ startDate〜endDate にフォールバック
  // ─────────────────────────────────────────────

  const datesInRange = useMemo(() => {
    const keySet = new Set();
    (workStatuses || []).forEach(ws => {
      if (!ws?.startDate || !ws?.endDate) return;
      eachDateKeyInclusive(ws.startDate, ws.endDate).forEach(k => keySet.add(k));
    });

    const keys = keySet.size
      ? Array.from(keySet).sort() // YYYY-MM-DD なので文字列sortでOK
      : (startDate && endDate ? eachDateKeyInclusive(startDate, endDate) : []);

    // "YYYY-MM-DD" を必ずローカル 00:00 として扱う（UTC解釈でのズレ防止）
    return keys.map(k => parseYmdToDateLocal(k)).filter(Boolean);
  }, [workStatuses, startDate?.getTime?.(), endDate?.getTime?.()]);


  // 当日の「自プロジェクトの時間窓」を返す（workStatuses優先 / 無ければ startDate,endDate の封筒）
  const getMyDayWindow = useCallback((d) => {
    const dy = toYmd(d);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const dayEnd   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

    // 1) workStatuses から当日の最小開始〜最大終了を作る（複数工程が同日にあってもOK）
    let minS = null;
    let maxE = null;
    for (const ws of (workStatuses || [])) {
      if (!ws?.startDate || !ws?.endDate) continue;
      const wsS = ws.startDate;
      const wsE = ws.endDate;
      const wsStartDy = toYmd(wsS);
      const wsEndDy   = toYmd(wsE);
      if (dy < wsStartDy || dy > wsEndDy) continue;

      const clampStart =
        (wsS <= dayStart && wsE >= dayEnd) ? dayStart :
        (wsStartDy === dy) ? wsS : dayStart;
      const clampEnd =
        (wsS <= dayStart && wsE >= dayEnd) ? dayEnd :
        (wsEndDy === dy) ? wsE : dayEnd;

      if (!minS || clampStart < minS) minS = clampStart;
      if (!maxE || clampEnd > maxE)   maxE = clampEnd;
    }
    if (minS && maxE) return [minS, maxE];

    // 2) フォールバック：従来通り startDate/endDate の封筒
    const sd = startDate, ed = endDate;
    const clampStart =
      (sd <= dayStart && ed >= dayEnd) ? dayStart :
      (toYmd(sd) === dy) ? sd : dayStart;
    const clampEnd =
      (sd <= dayStart && ed >= dayEnd) ? dayEnd :
      (toYmd(ed) === dy) ? ed : dayEnd;
    return [clampStart, clampEnd];
  }, [workStatuses, startDate, endDate]);

  // 期間の「参加者」空き状況（他案件割当との時間帯オーバーラップ）
  useEffect(() => {
    (async () => {
      try {
      if (datesInRange.length === 0) {
        setUnavailableEmpMap({});
        // 範囲が無いときだけ全クリア
        setParticipantSelectionsByDay({});
        return;
      }
      setEmpAvailLoading(true);
      const s = datesInRange[0];
      const e = datesInRange[datesInRange.length - 1];
      const startTs = Timestamp.fromDate(new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0,0,0,0));
      const endTs   = Timestamp.fromDate(new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23,59,59,999));

      const [assignments] = await Promise.all([
        fetchAssignmentsInRange(startTs, endTs),
      ]);
      const overlappedProjects = await fetchProjectsOverlappingRange(
        new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0,0,0,0),
        new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23,59,59,999)
      );
      const projMap = Object.fromEntries((overlappedProjects || []).map(p => [p.id, p]));

      const map = {};
      datesInRange.forEach(d => { map[toYmd(d)] = new Set(); });

      const overlaps = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;
      // 相手プロジェクトの当日窓（workStatusesがあればそれ優先）
      const getOtherDayWindow = (other, day) => {
        const dy = toYmd(day);
        const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
        const dayEnd   = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);

        let minS = null;
        let maxE = null;
        const arr = Array.isArray(other?.workStatuses) ? other.workStatuses : [];
        for (const raw of arr) {
          const wsS = toSafeDate(raw?.startDate);
          const wsE = toSafeDate(raw?.endDate);
          if (!wsS || !wsE) continue;
          const wsStartDy = toYmd(wsS);
          const wsEndDy   = toYmd(wsE);
          if (dy < wsStartDy || dy > wsEndDy) continue;

          const clampStart =
            (wsS <= dayStart && wsE >= dayEnd) ? dayStart :
            (wsStartDy === dy) ? wsS : dayStart;
          const clampEnd =
            (wsS <= dayStart && wsE >= dayEnd) ? dayEnd :
            (wsEndDy === dy) ? wsE : dayEnd;

          if (!minS || clampStart < minS) minS = clampStart;
          if (!maxE || clampEnd > maxE)   maxE = clampEnd;
        }
        if (minS && maxE) return [minS, maxE];

        const oS = toSafeDate(other?.startDate);
        const oE = toSafeDate(other?.endDate) || oS;
        if (!oS || !oE) return [dayStart, dayEnd];

        const clampStart =
          (oS <= dayStart && oE >= dayEnd) ? dayStart :
          (toYmd(oS) === dy) ? oS : dayStart;
        const clampEnd =
          (oS <= dayStart && oE >= dayEnd) ? dayEnd :
          (toYmd(oE) === dy) ? oE : dayEnd;
        return [clampStart, clampEnd];
      };

      for (const a of assignments) {
        if (editingProjectId && a.projectId === editingProjectId) continue;
        const other = projMap[a.projectId];
        if (!other) continue;
        const dy = a.dateKey || toYmd(a.date?.toDate?.() ?? new Date(a.date));
        if (!map[dy]) continue;
        const day = parseYmdToDateLocal(dy) || new Date(dy);
        const [meS, meE] = getMyDayWindow(day);
        const [oClampS, oClampE] = getOtherDayWindow(other, day);
        if (overlaps(meS, meE, oClampS, oClampE)) {
          map[dy].add(a.employeeId);
        }
      }
      setUnavailableEmpMap(map);

      // 編集時は自案件の既存割当てをプリフィル
      if (editingProjectId) {
        // ★ participantPlan でプリフィル済みなら assignments で上書きしない
        if (participantPlanPrefilledRef.current) {
          setParticipantSelectionsByDay((prev) => {
            const next = {};
            const allowed = new Set(Object.keys(map));
            for (const [k, v] of Object.entries(prev || {})) {
              if (allowed.has(k)) next[k] = v;
            }
            return next;
          });
          return;
        }
        const mine = await fetchAssignmentsForProject(editingProjectId);
        const next = {};
        for (const r of mine) {
          const dy = r.dateKey || toYmd(r.date?.toDate?.() ?? new Date(r.date));
          if (!map[dy]) continue; // 現在の入力対象日に限定
          const set = new Set(next[dy] || []);
          set.add(r.employeeId);
          next[dy] = set;
        }
        setParticipantSelectionsByDay(next);
      } else {
        // ★範囲が変わっても、既存の選択は「対象日のみ」残す（全クリアしない）
        setParticipantSelectionsByDay((prev) => {
          const next = {};
          const allowed = new Set(Object.keys(map));
          for (const [k, v] of Object.entries(prev || {})) {
            if (allowed.has(k)) next[k] = v;
          }
          return next;
        });
      }

      } catch (e) {
        console.log('[emp availability] error', e);
      } finally {
        setEmpAvailLoading(false);
      }
    })();
  }, [datesInRange, editingProjectId, fetchProjectsOverlappingRange, getMyDayWindow]);

  // 期間の空き状況（既予約・車検/修理）を算出
  useEffect(() => {
    (async () => {
      setAvailLoading(true);
      if (datesInRange.length === 0) {
        setUnavailableMap({});
        setVehicleSelections({});
        return;
      }
      const s = datesInRange[0];
      const e = datesInRange[datesInRange.length - 1];
      const startTs = Timestamp.fromDate(new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0,0,0,0));
      const endTs   = Timestamp.fromDate(new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23,59,59,999));

      const [blocks, reservations] = await Promise.all([
        fetchVehicleBlocksOverlapping(startTs, endTs),
        fetchReservationsInRange(startTs, endTs),
      ]);
      // 予約の相手プロジェクト群（期間にかすっているものだけ）をまとめて取得
      const overlappedProjects = await fetchProjectsOverlappingRange(
        new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0,0,0,0),
        new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23,59,59,999)
      );
      const projMap = Object.fromEntries((overlappedProjects || []).map(p => [p.id, p]));

      const map = {};
      datesInRange.forEach(d => { map[toYmd(d)] = new Set(); });
      const overlaps = (a1, a2, b1, b2) => a1 < b2 && b1 < a2; // 端がピッタリは非重複扱い

      const getOtherDayWindow = (other, day) => {
        const dy = toYmd(day);
        const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
        const dayEnd   = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);

        let minS = null;
        let maxE = null;
        const arr = Array.isArray(other?.workStatuses) ? other.workStatuses : [];
        for (const raw of arr) {
          const wsS = toSafeDate(raw?.startDate);
          const wsE = toSafeDate(raw?.endDate);
          if (!wsS || !wsE) continue;
          const wsStartDy = toYmd(wsS);
          const wsEndDy   = toYmd(wsE);
          if (dy < wsStartDy || dy > wsEndDy) continue;

          const clampStart =
            (wsS <= dayStart && wsE >= dayEnd) ? dayStart :
            (wsStartDy === dy) ? wsS : dayStart;
          const clampEnd =
            (wsS <= dayStart && wsE >= dayEnd) ? dayEnd :
            (wsEndDy === dy) ? wsE : dayEnd;

          if (!minS || clampStart < minS) minS = clampStart;
          if (!maxE || clampEnd > maxE)   maxE = clampEnd;
        }
        if (minS && maxE) return [minS, maxE];

        const oS = toSafeDate(other?.startDate);
        const oE = toSafeDate(other?.endDate) || oS;
        if (!oS || !oE) return [dayStart, dayEnd];

        const clampStart =
          (oS <= dayStart && oE >= dayEnd) ? dayStart :
          (toYmd(oS) === dy) ? oS : dayStart;
        const clampEnd =
          (oS <= dayStart && oE >= dayEnd) ? dayEnd :
          (toYmd(oE) === dy) ? oE : dayEnd;
        return [clampStart, clampEnd];
      };
      
      // 使用不可：車検/修理ブロック
      for (const b of blocks) {
        const bs = b.startDate.toDate ? b.startDate.toDate() : new Date(b.startDate);
        const be = b.endDate.toDate ? b.endDate.toDate() : new Date(b.endDate);
        for (const d of datesInRange) {
          const [meS, meE] = getMyDayWindow(d);
          if (overlaps(meS, meE, bs, be)) map[toYmd(d)].add(b.vehicleId);
        }
      }
      // 使用不可：他プロジェクト予約
      for (const r of reservations) {
        if (editingProjectId && r.projectId === editingProjectId) continue; // 自案件は除外
        const other = projMap[r.projectId];
        if (!other) continue;
        const d  = (r.date?.toDate?.() ?? new Date(r.date));
        const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const [meS, meE] = getMyDayWindow(day);
        const [oClampS, oClampE] = getOtherDayWindow(other, day);
        if (overlaps(meS, meE, oClampS, oClampE)) {
          const dy = toYmd(day);
          if (!map[dy]) map[dy] = new Set();
          map[dy].add(r.vehicleId);
        }
      }
      setUnavailableMap(map);

      // 編集時：自プロジェクトの既存予約でプリフィル
      if (editingProjectId) {
      // ★ vehiclePlan でプリフィル済みなら予約からの上書きを禁止
      if (vehiclePlanPrefilledRef.current) {
        return;
      }
        const mine = await fetchReservationsForProject(editingProjectId);
        const next = {};
        for (const r of mine) {
          const dy = toYmd(r.date.toDate ? r.date.toDate() : new Date(r.date));
          if (!map[dy]) continue; // 現在の入力対象日に限定
          const v  = vehiclesById[r.vehicleId];
          const t  = (v?.vehicleType || 'sales'); // 既存データは営業車扱いにフォールバック
          next[dy] = { ...(next[dy] || {}), [t]: r.vehicleId };
        }
        setVehicleSelections(next);
      } else {
        // ★範囲が変わっても、既存の選択は「対象日のみ」残す（全クリアしない）
        setVehicleSelections((prev) => {
          const next = {};
          const allowed = new Set(Object.keys(map));
          for (const [k, v] of Object.entries(prev || {})) {
            if (allowed.has(k)) next[k] = v;
          }
          return next;
        });
      }
    })().finally(() => setAvailLoading(false));
}, [datesInRange, editingProjectId, vehiclesById, getMyDayWindow]);

  const onPickVehicle = (ymd, type, vehicleId) => {
    const blocked = !!vehicleId && unavailableMap[ymd]?.has(vehicleId);
    if (blocked) {
      Alert.alert('選択不可', 'この日は選択した車両を使用できません（既予約／車検・修理）');
      return;
    }
    setVehicleSelections(prev => ({
      ...prev,
      [ymd]: { ...(prev[ymd] || {}), [type]: vehicleId || undefined }
    }));
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProjects();
    setRefreshing(false);
  }, [loadProjects]);

  // --- 保存前・競合チェック（日単位） ---
  const checkVehicleConflicts = useCallback(async (selections, dates, selfProjectId) => {
    if (!dates?.length) return [];
    const s = dates[0];
    const e = dates[dates.length - 1];
    const startTs = Timestamp.fromDate(new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0,0,0,0));
    const endTs   = Timestamp.fromDate(new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23,59,59,999));
    const reservations = await fetchReservationsInRange(startTs, endTs);
    const conflicts = [];
    for (const d of dates) {
      const ymd = toYmd(d);
      const sel = selections[ymd] || {};
      for (const t of ['sales','cargo']) {
        const vid = sel[t];
        if (!vid) continue;
        const hit = reservations.find(r => {
          const rYmd = toYmd(r.date?.toDate?.() ?? new Date(r.date));
          const other = !selfProjectId || r.projectId !== selfProjectId;
          return other && r.vehicleId === vid && rYmd === ymd;
        });
        if (hit) conflicts.push({ date: ymd, vehicleId: vid });
      }
    }
    return conflicts;
  }, []);

  // ─────────────────────────────
  // 左フォームに値を流し込むヘルパー
  // ─────────────────────────────
  // 先頭の【場所】をパース
  const parseNameForLocation = (fullName) => {
    const m = String(fullName || '').match(/^【([^】]+)】(.*)$/);
    if (m) return { loc: m[1], plain: (m[2] || '').trim() };
    return { loc: null, plain: String(fullName || '') };
  };

  // ★ 旧データ救済： "限定公開　富山市" -> { limited:true, location:"富山市" }
  const normalizeBracketLoc = (locRaw) => {
    const s = String(locRaw || '').trim();
    // 半角/全角スペース両対応
    const m = s.match(/^限定公開[\s　]+(.+)$/);
    if (m) return { limited: true, location: (m[1] || '').trim() };
    return { limited: false, location: s || null };
  };

  const prefillLeftForm = useCallback((src, { appendCopySuffix = false } = {}) => {
    // name から【場所】を分離（src.location があれば優先）
    const parsed = parseNameForLocation(src.name);
    const fromName = normalizeBracketLoc(parsed.loc);
    const loc = src.location || fromName.location;
    const plainName = parsed.plain ?? '';
    setName(plainName ? (appendCopySuffix ? `${plainName} (コピー)` : plainName) : '');
    setClientName(src.clientName ?? '');
    const s = toSafeDate(src.startDate) ?? roundToHour(new Date());
    const e = toSafeDate(src.endDate) ?? s;
    setStartDate(s);
    setEndDate(e);
    setProjectType(src.projectType ?? null);

    // ステータス（保存されていなければ「見込み」で初期化）
    if (src.status && STATUS_OPTIONS.some(o => o.value === src.status)) {
      setStatus(src.status);
    } else {
      setStatus('prospect');
    }

    // visibility が無い旧データは name 側の "限定公開" を尊重
    const vis =
      (src.visibility ? (src.visibility === 'limited') : fromName.limited);
    setVisibilityLimited(!!vis);
    setOrderAmount(src.orderAmount != null ? formatThousandsInput(String(src.orderAmount)) : '');
    setTravelCost(src.travelCost != null ? formatThousandsInput(String(src.travelCost)) : '');
    setMiscExpense(src.miscExpense != null ? formatThousandsInput(String(src.miscExpense)) : '');
    setAreaSqm(src.areaSqm != null ? String(src.areaSqm) : '');
    // 役割プリフィル（ID か その他文字列）
    const fillRole = (idValue, otherValue, setChoice, setOther) => {
      const id = idValue || null;
      const other = (otherValue || '').trim();
      if (id) { // 従業員一覧未ロードでもIDを尊重
        setChoice(id); setOther('');
      } else if (other) {
        setChoice(OTHER_ROLE); setOther(other);
      } else {
        setChoice(null); setOther('');
      }
    };
    fillRole(src.sales, src.salesOtherName, setSalesChoice, setSalesOtherName);
    fillRole(src.survey, src.surveyOtherName, setSurveyChoice, setSurveyOtherName);
    fillRole(src.design, src.designOtherName, setDesignChoice, setDesignOtherName);
    fillRole(src.management, src.managementOtherName, setManagementChoice, setManagementOtherName);
    // ロケーションのプリフィル
    if (loc) {
      if (LOCATION_CITIES.includes(loc)) {
        setLocationChoice(loc);
        setLocationOtherText('');
     } else {
        setLocationChoice(LOCATION_OTHER);
        setLocationOtherText(loc);
      }
    } else {
      setLocationChoice(null);
      setLocationOtherText('');
    }
    // participantPlan が来ていれば日毎選択に展開

    // 作業ステータスのプリフィル（任意）
    if (Array.isArray(src.workStatuses)) {
      setWorkStatuses(
        src.workStatuses.map((ws) => {
          const s = toSafeDate(ws.startDate);
          const e = toSafeDate(ws.endDate);
          const employeeIds = Array.isArray(ws.employeeIds) ? ws.employeeIds : [];
          const vehicleIds  = Array.isArray(ws.vehicleIds) ? ws.vehicleIds : [];

          const hasDates     = !!(s && e);
          const hasEmployees = employeeIds.length > 0;
          const hasVehicles  = vehicleIds.length > 0;
          const scheduleStatus =
            hasDates && hasEmployees && hasVehicles ? 'fixed' : 'pending';

          return {
            id:
              ws.id ||
              `${ws.type || 'phase'}_${Math.random()
                .toString(36)
                .slice(2)}`,
            type: ws.type || 'additional',
            label:
              ws.label ||
              (WORK_STATUS_TYPES.find((t) => t.key === ws.type)?.label ||
                '工程'),
            startDate: s ?? roundToHour(new Date()),
            endDate: e ?? s ?? roundToHour(new Date()),
            employeeIds,
            vehicleIds,
            scheduleStatus,
            expanded: false, // 既存データから来た場合は最初は閉じておく
          };
        })
      );
    } else {
      // 旧データ（workStatuses 未保存）の場合は空で初期化
      setWorkStatuses([]);
    }

    if (src.participantPlan && typeof src.participantPlan === 'object') {
      participantPlanPrefilledRef.current = true;
      const next = {};
      Object.entries(src.participantPlan).forEach(([dy, arr]) => {
        next[dy] = new Set(arr || []);
      });
      setParticipantSelectionsByDay(next);
    }
  // ★ vehiclePlan があれば編集/コピー時の車両選択を正確に復元
  if (src.vehiclePlan && typeof src.vehiclePlan === 'object') {
    vehiclePlanPrefilledRef.current = true;
    const nextV = {};
    for (const [dy, v] of Object.entries(src.vehiclePlan)) {
      if (!v) continue;
      const sales = v.sales ?? undefined;
      const cargo = v.cargo ?? undefined;
      if (sales || cargo) nextV[dy] = { sales, cargo };
    }
    setVehicleSelections(nextV);
  }    
  }, []); 


  // ─────────────────────────────────────────────
  // 事前入力（コピー / 編集）:
  // - copy: 左フォームに流し込む
  // - edit: 左フォームにも流し込み、送信で上書き保存できるようにする
  //   （従来の右リストのインライン編集も動くが、左フォーム編集を優先）
  // ─────────────────────────────────────────────

useEffect(() => {
  const params = route?.params ?? {};

  // ★重要：copy/new で入った時に以前の編集IDが残っていると「上書き編集」になってしまう
  // mode が edit 以外なら編集状態を必ず解除する
  if (params.mode !== 'edit') {
    setEditingProjectId(null);
  }

  // 1) コピー → 左フォームへ反映
  if (params.mode === 'copy' && params.initialValues) {
    prefillLeftForm(params.initialValues, { appendCopySuffix: true });
  }

    // 2) 編集：左フォームを既存値でプリフィルして、上書き保存できるようにする
    if (params.mode === 'edit' && params.projectId) {
      setEditingProjectId(params.projectId);
      if (params.initialValues) {
        // Detail から初期値が来ている場合はそれを採用
        prefillLeftForm(params.initialValues);
      } else if (projects.length > 0) {
        // プロジェクト一覧ロード後に埋める
        const proj = projects.find(p => p.id === params.projectId);
        if (proj) prefillLeftForm(proj);
      }
    }
}, [route?.params, projects, prefillLeftForm, setEditingProjectId]);


  // ── ピルUI（タップすると picker を出す） ──
  const Pill = React.memo(function Pill({ label, onPress, mr = true }) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={tw.style(
          'flex-1 rounded-full px-4 py-3 border items-center justify-center',
          'bg-gray-100 border-gray-300',
          mr && 'mr-2'
        )}
      >
        {/* タップ要素の中身は必ず<Text>で包む */}
        <Text style={tw`text-base`}>{label}</Text>
      </TouchableOpacity>
    );
  });

  // ── 作業ステータス1件ぶんの入力を反映する（カードの下に付ける「確定」ボタン用） ──
  const handleWorkStatusConfirm = useCallback(
    (wsId) => {
      const target = workStatuses.find((w) => w.id === wsId);
      if (!target) return;

      if (!target.startDate || !target.endDate) {
        Alert.alert('入力エラー', 'このステータスの開始・終了日時を設定してください');
        return;
      }

      // このステータスがカバーする日付（YYYY-MM-DD）配列
      const dateKeys = eachDateKeyInclusive(target.startDate, target.endDate);

      // その日付範囲における「参加従業員」と「車両」のユニオンを作る
      const empSet = new Set();
      const vehicleSet = new Set();

      for (const dy of dateKeys) {
        // 従業員（日毎）
        const empSel = participantSelectionsByDay[dy];
        const empArr = Array.isArray(empSel)
          ? empSel
          : Array.from(empSel || []);
        empArr.forEach((id) => empSet.add(id));

        // 車両（日毎）
        const vSel = vehicleSelections[dy] || {};
        if (vSel.sales) vehicleSet.add(vSel.sales);
        if (vSel.cargo) vehicleSet.add(vSel.cargo);
      }

      const employeeIds = Array.from(empSet);
      const vehicleIds = Array.from(vehicleSet);

      const hasDates     = !!(target.startDate && target.endDate);
      const hasEmployees = employeeIds.length > 0;
      const hasVehicles  = vehicleIds.length > 0;

      const scheduleStatus =
        hasDates && hasEmployees && hasVehicles ? 'fixed' : 'pending';

      // 対象ステータスだけに反映
      setWorkStatuses((prev) =>
        prev.map((ws) =>
          ws.id === wsId
            ? {
                ...ws,
                employeeIds,
                vehicleIds,
                scheduleStatus,
                dateKeys,
              }
            : ws
        )
      );

      Alert.alert(
        'ステータス反映',
        'このステータスの設定を反映しました。画面下の「確定」で保存してください。'
      );
    },
    [workStatuses, participantSelectionsByDay, vehicleSelections]
  );


  const handleSubmit = async () => {
    // 担当の未選択チェック（ID選択 or その他テキスト必須）
    const roleOk = (choice, other) =>
      choice && (choice !== OTHER_ROLE || (OTHER_ROLE && other.trim()));

    if (
      !roleOk(salesChoice, salesOtherName) ||
      !roleOk(surveyChoice, surveyOtherName) ||
      !roleOk(designChoice, designOtherName) ||
      !roleOk(managementChoice, managementOtherName)
    ) {
      return Alert.alert(
        '入力エラー',
        '各担当は「社員の選択」か「その他テキスト」のいずれかを入力してください'
      );
    }
    if (!name.trim()) {
      return Alert.alert('入力エラー', 'プロジェクト名を入力してください');
    }
    if (!locationChoice) {
      return Alert.alert('入力エラー', '場所を選択してください');
    }
    if (locationChoice === LOCATION_OTHER && !locationOtherText.trim()) {
      return Alert.alert('入力エラー', 'その他地域名を入力してください');
    }
    if (!clientName.trim()) {
      return Alert.alert('入力エラー', '顧客名を入力してください');
    }
    if (clientCloseType === 'day') {
      const d = Number(clientCloseDay);
      if (!Number.isInteger(d) || d < 1 || d > 31) {
        return Alert.alert('入力エラー', '顧客の締め日は 1〜31 の数値で入力してください');
      }
    }

    // コスト計算用
    const participantObjs = employees.filter((e) =>
      participants.includes(e.id)
    );
    const externalCount = participantObjs.filter(
      (e) => e?.division === '外注'
    ).length;
    const internalCount = participantObjs.length - externalCount;

    // ★飛び日対応：workStatuses がある場合は工程の合算時間を使う（封筒(start/end)による過大計上を避ける）
    //   ※工程が重なる場合は合算で増える（必要なら後で「日単位union」に改善可能）
    const hours = (() => {
      const dated = (workStatuses || []).filter(ws => ws?.startDate && ws?.endDate);
      if (dated.length === 0) return calcWorkHours(startDate, endDate);
      return dated.reduce((sum, ws) => sum + calcWorkHours(ws.startDate, ws.endDate), 0);
    })();

    const laborCost = Math.round(
      internalCount * EMPLOYEE_HOURLY * hours +
        externalCount * EXTERNAL_HOURLY * hours
    );
    const rentalResourceCost = Math.round(
      (toNumberOrNull(areaSqm) || 0) * RENTAL_PER_SQM
    );

    // --- プロジェクトに保存する車両プラン（day × {sales,cargo}） ---
    const vehiclePlan = {};
    for (const d of datesInRange) {
      const ymd = toYmd(d);
      const sel = vehicleSelections[ymd] || {};
      const salesId = sel.sales || null;
      const cargoId = sel.cargo || null;
      if (salesId || cargoId) {
        vehiclePlan[ymd] = { sales: salesId, cargo: cargoId };
      }
    }

    // ステータス用に「車両IDのユニオン」を作っておく
    const vehicleIdSet = new Set();
    Object.values(vehiclePlan).forEach((v) => {
      if (!v) return;
      if (v.sales) vehicleIdSet.add(v.sales);
      if (v.cargo) vehicleIdSet.add(v.cargo);
    });
    const vehicleIdsUnion = Array.from(vehicleIdSet);

    // 参加者（日毎）
    const participantPlan = {};
    for (const d of datesInRange) {
      const y = toYmd(d);
      const set = participantSelectionsByDay[y];
      const arr = Array.isArray(set) ? set : Array.from(set || []);
      if (arr.length) {
        participantPlan[y] = arr;
      }
    }

    const hasAnySelection = Object.keys(vehiclePlan).length > 0;
    const hasAnyParticipants = Object.keys(participantPlan).length > 0;

    // 表示名は【（限定公開なら'限定公開　'）場所】プロジェクト名 で保存
    const bracket = visibilityLimited
      ? `限定公開　${chosenLocation}`
      : chosenLocation;
    const finalName = `【${bracket}】${name.trim()}`;

    // 作業ステータス（工程）の保存用整形
    // 各ステータスごとに employeeIds / vehicleIds / scheduleStatus が
    // 未設定の場合だけ、ここで最低限の値を補完する
    const workStatusesForSave =
      workStatuses.length > 0
        ? workStatuses.map((ws) => {
          const hasDates = !!(ws.startDate && ws.endDate);

          // ✅ 「未確定(pending)」の工程を勝手に fixed にしない
          // - 新規作成/未反映の工程は employeeIds/vehicleIds を空のまま保持して pending を維持
          // - 旧データ救済：すでに fixed だったのに employeeIds/vehicleIds が空のケースだけ、
          //   日別プラン（participants / vehicleIdsUnion）から補完する
          const legacyFixed = ws?.scheduleStatus === 'fixed';

          const employeeIdsRaw = Array.isArray(ws.employeeIds) ? ws.employeeIds : [];
          const vehicleIdsRaw  = Array.isArray(ws.vehicleIds) ? ws.vehicleIds : [];

          const employeeIds =
            employeeIdsRaw.length ? employeeIdsRaw : (legacyFixed ? participants : []);
          const vehicleIds =
            vehicleIdsRaw.length ? vehicleIdsRaw : (legacyFixed ? vehicleIdsUnion : []);

          const hasEmployees = employeeIds.length > 0;
          const hasVehicles  = vehicleIds.length > 0;

          const scheduleStatus =
            hasDates && hasEmployees && hasVehicles ? 'fixed' : 'pending';

          // ✅ dateKeys は「現在の start/end から毎回生成」して保存（古い dateKeys が残る事故を防ぐ）
          const dateKeys = hasDates ? eachDateKeyInclusive(ws.startDate, ws.endDate) : [];

            return {
              ...ws,
              employeeIds,
              vehicleIds,
              scheduleStatus,
              dateKeys,
            };
          })
        : [];

    if (workStatusesForSave.length) {
      setWorkStatuses(workStatusesForSave);
    }

    const workStatusesPayload = workStatusesForSave.length
      ? workStatusesForSave.map((ws) => ({
          id: ws.id,
          type: ws.type,
          label: ws.label,
          startDate: ws.startDate,
          endDate: ws.endDate,
          employeeIds: ws.employeeIds || [],
          vehicleIds: ws.vehicleIds || [],
          scheduleStatus: ws.scheduleStatus || 'pending',
          dateKeys: ws.dateKeys || [],
        }))
      : null;



    
    const payload = {
      name: finalName,
      clientName: clientName.trim(),
      startDate,
      endDate,
      // 役割は ID（社員選択時のみ）を保存、その他は *_OtherName に保存
      sales:
        salesChoice && salesChoice !== OTHER_ROLE ? salesChoice : null,
      survey:
        surveyChoice && surveyChoice !== OTHER_ROLE ? surveyChoice : null,
      design:
        designChoice && designChoice !== OTHER_ROLE ? designChoice : null,
      management:
        managementChoice && managementChoice !== OTHER_ROLE
          ? managementChoice
          : null,
      salesOtherName:
        salesChoice === OTHER_ROLE ? salesOtherName.trim() : null,
      surveyOtherName:
        surveyChoice === OTHER_ROLE ? surveyOtherName.trim() : null,
      designOtherName:
        designChoice === OTHER_ROLE ? designOtherName.trim() : null,
      managementOtherName:
        managementChoice === OTHER_ROLE
          ? managementOtherName.trim()
          : null,
      participants,
      isMilestoneBilling: false,
      projectType,
      status,

      orderAmount: toNumberOrNull(orderAmount),
      travelCost: toNumberOrNull(travelCost),
      miscExpense: toNumberOrNull(miscExpense),
      areaSqm: toNumberOrNull(areaSqm),
      location: chosenLocation,
      visibility: visibilityLimited ? 'limited' : 'public',

      laborCost,
      rentalResourceCost,
    // ★ 空でも送って「旧データ残り」を防ぐ（merge:true 対策）
    vehiclePlan: hasAnySelection ? vehiclePlan : {},
    participantPlan: hasAnyParticipants ? participantPlan : {},
    workStatuses: workStatusesPayload ? workStatusesPayload : [],
    };


    setLoading(true);
    try {
      // 1) 競合の最終チェック（日単位）
      const conflicts = await checkVehicleConflicts(
        vehicleSelections,
        datesInRange,
        editingProjectId
      );
      if (conflicts.length) {
        const lines = conflicts
          .map((c) => `・${c.date} / vehicleId=${c.vehicleId}`)
          .join('\n');
        Alert.alert(
          '車両の競合',
          `以下の日は他案件で使用中です。\n${lines}`
        );
        return; // finally で loading は落ちる
      }

      const actor = {
        by: me?.id ?? route?.params?.userEmail ?? null,
        byName: me?.name ?? null,
      };
      const isEdit = !!editingProjectId;

      // 顧客マスタを確実に作成（新規顧客の場合のみ）し、project に clientId を付与
      try {
        const ensured = await ensureClientByName(
          clientName.trim(),
          { closeType: clientCloseType === 'eom' ? 'eom' : 'day', closeDay: clientCloseType === 'day' ? Number(clientCloseDay) : null },
          actor
        );
        if (ensured?.id) payload.clientId = ensured.id;
      } catch (e) {
        console.warn('[ensureClientByName] failed', e);
      }

      // 2) プロジェクト本体を保存（新規 / 編集）
      const projectId = isEdit
        ? await setProject(editingProjectId, payload, actor)
        : await setProject(null, payload, actor);

      // 3) 車両予約を Tx で保存（失敗時は従来フローにフォールバック）
      try {
        await saveProjectVehiclePlan(projectId, vehiclePlan, datesInRange);
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg.startsWith('CONFLICT')) {
          // 他プロジェクトとバッティング
          throw err;
        }
        // フォールバック：この案件の予約を一旦全削除 → 期間分だけ再作成
        await clearReservationsForProject(projectId);
        for (const d of datesInRange) {
          const ymd = toYmd(d);
          const sel = vehicleSelections[ymd] || {};
          for (const t of ['sales', 'cargo']) {
            const vid = sel[t];
            if (!vid) continue;
            await setVehicleReservation(
              projectId,
              new Date(
                d.getFullYear(),
                d.getMonth(),
                d.getDate(),
                0,
                0,
                0,
                0
              ),
              vid
            );
          }
        }
      }

      // 4) 参加者割当てを Tx で保存（失敗時は従来フローにフォールバック）
      try {
        await saveProjectParticipantPlan(
          projectId,
          participantPlan,
          datesInRange
        );
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg.startsWith('CONFLICT')) {
          throw err;
        }
        await clearAssignmentsForProject(projectId);
        for (const [dy, arr] of Object.entries(participantPlan)) {
          for (const empId of arr) {
            const dateMidnight =
              parseYmdToDateLocal(dy) || new Date(`${dy}T00:00:00`);
            await setEmployeeAssignment(projectId, dateMidnight, empId);
          }
        }
      }

      // 5) 編集履歴（vehicles / participants）
      const logDate = dateForLog;
      try {
        if (logDate && Object.keys(vehiclePlan).length) {
          await addEditLog({
            projectId,
            date: logDate,
            dateKey: logDate,
            action: 'update',
            target: 'vehicles',
            targetId: null,
            by: actor.by,
            byName: actor.byName,
          });
        }
        if (logDate && Object.keys(participantPlan).length) {
          await addEditLog({
            projectId,
            date: logDate,
            dateKey: logDate,
            action: 'update',
            target: 'participants',
            targetId: null,
            by: actor.by,
            byName: actor.byName,
          });
        }
      } catch (logErr) {
        console.log('[ProjectRegister addEditLog] error', logErr);
      }

      await loadProjects();

      if (isEdit) {
        // 編集時：従来どおり「更新しました」+ 編集モード解除
        Alert.alert('成功', 'プロジェクトを更新しました');
        setEditingProjectId(null);
      } else {
        // 新規時：フォームクリア（従来動作を維持しつつ車両もクリア）
        setName('');
        setClientName('');
        setStartDate(roundToHour(new Date()));
        setEndDate(roundToHour(new Date()));
        setParticipantSelectionsByDay({});
        setOrderAmount('');
        setTravelCost('');
        setMiscExpense('');
        setAreaSqm('');
        setProjectType(null);
        setSalesChoice(null);
        setSalesOtherName('');
        setSurveyChoice(null);
        setSurveyOtherName('');
        setDesignChoice(null);
        setDesignOtherName('');
        setManagementChoice(null);
        setManagementOtherName('');
        setLocationChoice(null);
        setLocationOtherText('');
        setVisibilityLimited(false);
        setVehicleSelections({});
        setWorkStatuses([]); // ★ 作業ステータスもクリア
        vehiclePlanPrefilledRef.current = false;
        participantPlanPrefilledRef.current = false;
        Alert.alert('成功', 'プロジェクトを追加しました');
      }
    } catch (e) {
      console.error('[handleSubmit] error', e);
      console.log('[PRS] handleSubmit error', String(e?.message || e));
      const msg = String(e?.message || e);
      if (msg.startsWith('CONFLICT')) {
        Alert.alert(
          '競合エラー',
          '他のプロジェクトが同じ日・同じ車両/従業員を予約しています。\n期間や車両・参加者を見直してください。'
        );
      } else {
        Alert.alert(
          'エラー',
          editingProjectId
            ? 'プロジェクトの更新に失敗しました'
            : 'プロジェクトの追加に失敗しました'
        );
      }
    } finally {
      setLoading(false);
    }
  };


  // --- UI（右カラム廃止 → 単一カラム） ---
  return (
    <View style={tw`flex-1`}>
      {/* 単一カラム：新規/編集フォーム */}
      <ScrollView
        style={tw`w-full p-3`}
        contentContainerStyle={{ paddingBottom: leftBottomPadding }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={tw`text-lg font-bold mb-2`}>
          {editingProjectId ? 'プロジェクト編集' : 'プロジェクト追加'}
        </Text>

        {/* ===== 場所（プロジェクト名の前） ===== */}
        <Text style={tw`mt-1`}>場所</Text>
        <View style={tw`flex-row flex-wrap -mx-1 mb-2`}>
          {LOCATION_CITIES.map(city => {
            const selected = locationChoice === city;
            return (
              <TouchableOpacity
                key={city}
                activeOpacity={0.7}
                onPress={() => { setLocationChoice(city); setLocationOtherText(''); }}
                style={tw.style(
                  'm-1 px-3 py-2 rounded border',
                  selected ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'
                )}
              >
                <Text>{(selected ? '☑ ' : '☐ ') + city}</Text>
              </TouchableOpacity>
            );
          })}
          {/* その他ボタン */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setLocationChoice(LOCATION_OTHER)}
            style={tw.style(
              'm-1 px-3 py-2 rounded border',
              locationChoice === LOCATION_OTHER ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'
            )}
          >
            <Text>{(locationChoice === LOCATION_OTHER ? '☑ ' : '☐ ') + 'その他地域'}</Text>
          </TouchableOpacity>
        </View>
        {locationChoice === LOCATION_OTHER && (
          <View style={tw`mb-2`}>
            <Text>その他地域名を入力</Text>
           <TextInput
              value={locationOtherText}
              onChangeText={setLocationOtherText}
              placeholder="例: 小矢部市、舟橋村 など"
              style={tw`border p-2 rounded`}
            />
          </View>
        )}

        {/* ★ 限定公開（場所の下／プロジェクト名の上） */}
        <Text>限定公開登録</Text>
        <View style={tw`mb-3`}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setVisibilityLimited(v => !v)}
            style={tw.style(
              'px-3 py-2 rounded border self-start',
              visibilityLimited ? 'bg-amber-100 border-amber-400' : 'bg-white border-gray-300'
            )}
          >
            <Text>{visibilityLimited ? '☑ 限定公開（役員・部長・事務のみ）' : '☐ 限定公開（役員・部長・事務のみ）'}</Text>
          </TouchableOpacity>
          <Text style={tw`text-xs text-gray-600 mt-1`}>
            {visibilityLimited
              ? '限定公開にすると、スケジュールや一覧で【限定公開　場所】と表示され、一般社員は詳細を開けません。'
              : '未選択の場合は通常公開です。'}
          </Text>
        </View>

        <Text>プロジェクト名</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={tw`border p-2 mb-2 rounded`}
        />

        <Text>顧客名</Text>
        <TextInput
          value={clientName}
          onChangeText={setClientName}
          style={tw`border p-2 mb-2 rounded`}
        />

        {clientSuggestions.length > 0 && normalizedClientName.length > 0 && (
          <View style={tw`mb-2`}>
            <Text style={tw`text-xs text-gray-600 mb-1`}>既存顧客候補（タップで反映）</Text>
            {clientSuggestions.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => {
                  setClientName(c.name || '');
                  const ct = c.closeType === 'eom' ? 'eom' : 'day';
                  setClientCloseType(ct);
                  if (ct === 'day') setClientCloseDay(c.closeDay != null ? String(c.closeDay) : '25');
                }}
                activeOpacity={0.7}
                style={tw`px-3 py-2 bg-gray-100 rounded mb-1`}
              >
                <Text>{c.name}（締め日: {formatCloseLabel(c)}）</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text>顧客締め日（顧客情報）</Text>
        <View style={tw`flex-row mb-2`}>
          <TouchableOpacity
            onPress={() => setClientCloseType('day')}
            style={tw`${clientCloseType === 'day' ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'} border rounded px-4 py-2 mr-2`}
            activeOpacity={0.7}
          >
            <Text>{clientCloseType === 'day' ? '● ' : '○ '}毎月◯日</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setClientCloseType('eom')}
            style={tw`${clientCloseType === 'eom' ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'} border rounded px-4 py-2`}
            activeOpacity={0.7}
          >
            <Text>{clientCloseType === 'eom' ? '● ' : '○ '}末締め</Text>
          </TouchableOpacity>
        </View>
        {clientCloseType === 'day' && (
          <View style={tw`flex-row items-center mb-2`}>
            <TextInput
              value={clientCloseDay}
              onChangeText={setClientCloseDay}
              keyboardType="numeric"
              placeholder="25"
              style={tw`border p-2 rounded w-24`}
            />
            <Text style={tw`ml-2`}>日</Text>
          </View>
        )}
        <Text style={tw`text-xs text-gray-600 mb-3`}>
          ※新規顧客として登録される場合のみ、ここで設定した締め日が「顧客情報」に保存されます。既存顧客の変更はプロフィール＞顧客情報から行ってください。
        </Text>

        {/* 新規/既存 トグル */}
        <Text>案件区分</Text>
        <View style={tw`flex-row mb-2`}>
          <TouchableOpacity
            onPress={() => setProjectType('new')}
            style={tw`${projectType === 'new' ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'} border rounded px-4 py-2 mr-2`}
            activeOpacity={0.7}
          >
            <Text>{projectType === 'new' ? '● ' : '○ '}新規</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setProjectType('existing')}
            style={tw`${projectType === 'existing' ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'} border rounded px-4 py-2`}
            activeOpacity={0.7}
          >
            <Text>{projectType === 'existing' ? '● ' : '○ '}既存</Text>
          </TouchableOpacity>
        </View>


        {/* 金額・面積 */}
        <Text>受注金額 [円]</Text>
        <TextInput
          value={orderAmount}
          onChangeText={(v) => setOrderAmount(formatThousandsInput(v))}
          placeholder="例: 1,200,000"
          keyboardType="numeric"
          style={tw`border p-2 mb-2 rounded`}
        />

        <Text>交通費 [円]</Text>
        <TextInput
          value={travelCost}
          onChangeText={(v) => setTravelCost(formatThousandsInput(v))}
          placeholder="例: 30,000"
          keyboardType="numeric"
          style={tw`border p-2 mb-2 rounded`}
        />

        <Text>諸経費 [円]</Text>
        <TextInput
          value={miscExpense}
          onChangeText={(v) => setMiscExpense(formatThousandsInput(v))}
          placeholder="例: 50,000"
          keyboardType="numeric"
          style={tw`border p-2 mb-2 rounded`}
        />

        <Text>平米 [m²]</Text>
        <TextInput
          value={areaSqm}
          onChangeText={setAreaSqm}
          placeholder="例: 50"
          keyboardType="numeric"
          style={tw`border p-2 mb-2 rounded`}
        />

        {/* 各担当（役員・部長のみ） → チップUI + その他 */}
        {(() => {
          const RoleChips = ({ label, choice, setChoice, otherName, setOtherName }) => (
            <View style={tw`mb-3`}>
              <Text>{label}</Text>
              <View style={tw`flex-row flex-wrap -mx-1 mt-1`}>
                {managerCandidates.map(emp => {
                  const selected = choice === emp.id;
                  return (
                    <TouchableOpacity
                      key={emp.id}
                      activeOpacity={0.7}
                      onPress={() => { setChoice(emp.id); setOtherName(''); }}
                      style={tw.style(
                        'm-1 px-3 py-2 rounded border',
                        selected ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'
                      )}
                    >
                      <Text>{(selected ? '☑ ' : '☐ ') + (emp.name || '—')}</Text>
                    </TouchableOpacity>
                  );
                })}
                {/* その他 */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setChoice(OTHER_ROLE)}
                  style={tw.style(
                    'm-1 px-3 py-2 rounded border',
                    choice === OTHER_ROLE ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'
                  )}
                >
                  <Text>{(choice === OTHER_ROLE ? '☑ ' : '☐ ') + 'その他'}</Text>
                </TouchableOpacity>
              </View>
              {choice === OTHER_ROLE && (
                <View style={tw`mt-2`}>
                  <Text>担当者名（テキスト入力）</Text>
                  <TextInput
                    value={otherName}
                    onChangeText={setOtherName}
                    placeholder="例: 協力会社A 田中さん"
                    style={tw`border p-2 rounded`}
                  />
                </View>
              )}
            </View>
          );
          return (
            <View>
              <RoleChips label="営業担当"       choice={salesChoice}       setChoice={setSalesChoice}       otherName={salesOtherName}       setOtherName={setSalesOtherName} />
              <RoleChips label="現場調査担当"   choice={surveyChoice}      setChoice={setSurveyChoice}      otherName={surveyOtherName}      setOtherName={setSurveyOtherName} />
              <RoleChips label="設計担当"       choice={designChoice}      setChoice={setDesignChoice}      otherName={designOtherName}      setOtherName={setDesignOtherName} />
              <RoleChips label="管理担当"       choice={managementChoice}  setChoice={setManagementChoice}  otherName={managementOtherName}  setOtherName={setManagementOtherName} />
            </View>
          );
        })()}

        {/* ===== 作業ステータス（工程） ===== */}
        <View style={tw`mt-4 mb-3`}>
          <Text style={tw`text-lg font-bold mb-1`}>作業ステータス</Text>
          <Text style={tw`text-xs text-gray-600 mb-2`}>
            下のボタンを押すと、それぞれのステータス用の設定フォームが展開されます。
            ステータスを未設定のままでもプロジェクト登録は可能です。
          </Text>
          <View style={tw`flex-row flex-wrap -mx-1`}>
            {WORK_STATUS_TYPES.map((st) => {
              const selected = workStatuses.some(
                (ws) => ws.type === st.key && ws.expanded
              );
              return (
                <TouchableOpacity
                  key={st.key}
                  activeOpacity={0.7}
                  onPress={() => {
                    setWorkStatuses((prev) => {
                      // 追加工事は必要に応じて増やせる：押すたびに新規追加し、その行だけ編集・表示
                      if (st.key === 'additional') {
                        const count = prev.filter(
                          (ws) => ws.type === st.key
                        ).length;
                        const unit = createWorkStatusUnit(st.key, count);
                        const collapsed = prev.map((ws) => ({
                          ...ws,
                          expanded: false,
                        }));
                        return [...collapsed, unit];
                      }
                      // その他のステータスは 1 件だけ持ち、押したものだけ編集・表示
                      const idx = prev.findIndex(
                        (ws) => ws.type === st.key
                      );
                      if (idx >= 0) {
                        return prev.map((ws, i) => ({
                          ...ws,
                          expanded: i === idx,
                        }));
                      }
                      const count = prev.filter(
                        (ws) => ws.type === st.key
                      ).length;
                      const unit = createWorkStatusUnit(st.key, count);
                      const collapsed = prev.map((ws) => ({
                        ...ws,
                        expanded: false,
                      }));
                      return [...collapsed, unit];
                    });
                  }}
                  style={tw.style(
                    'm-1 px-3 py-2 rounded border',
                    selected
                      ? 'bg-blue-100 border-blue-400'
                      : 'bg-white border-gray-300'
                  )}
                >
                  <Text>{(selected ? '☑ ' : '☐ ') + st.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ステータスごとの詳細フォーム（ボタン押下で展開） */}
        {workStatuses.filter((ws) => ws.expanded).map((ws) => {

          // ★このステータスがカバーする日付だけを表示する（飛び日を強制しない）
          const statusDates = (() => {
            if (!ws.startDate || !ws.endDate) return [];
            const s0 = dateOnly(ws.startDate), e0 = dateOnly(ws.endDate);
            const arr = [];
            for (let d = new Date(s0); d <= e0; d.setDate(d.getDate() + 1)) arr.push(new Date(d));
            return arr;
          })();

          return (
            <View
              key={ws.id}
              style={tw`mb-4 p-3 border rounded bg-gray-50`}
            >
              <View style={tw`flex-row items-center justify-between mb-2`}>
                <View>
                  <Text style={tw`font-bold`}>{ws.label}</Text>
                  <View style={tw`flex-row mt-1`}>
                {WORK_SCHEDULE_STATUS_OPTIONS.map((opt) => {
                  const hasDates = !!(ws.startDate && ws.endDate);
                  const hasEmployees =
                    Array.isArray(ws.employeeIds) && ws.employeeIds.length > 0;
                  const hasVehicles =
                    Array.isArray(ws.vehicleIds) && ws.vehicleIds.length > 0;
                  const derived =
                    hasDates && hasEmployees && hasVehicles
                      ? 'fixed'
                      : 'pending';

                  const selected = derived === opt.value;

                  return (
                    <View
                      key={opt.value}
                      style={tw.style(
                        'mr-2 px-2 py-1 rounded border',
                        selected
                          ? 'bg-green-100 border-green-400'
                          : 'bg-white border-gray-300'
                      )}
                    >
                      <Text style={tw`text-xs`}>
                        {(selected ? '● ' : '○ ') + opt.label}
                      </Text>
                    </View>
                  );
                })}
                  </View>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    setWorkStatuses((prev) =>
                      prev.filter((p) => p.id !== ws.id)
                    );
                 }}
                  style={tw`px-2 py-1 rounded bg-red-100 border border-red-300`}
                >
                  <Text style={tw`text-xs text-red-700`}>このステータスを削除</Text>
                </TouchableOpacity>
              </View>

              {/* ステータスごとの開始・終了 */}
              <View style={tw`mb-3`}>
                <Text style={tw`mb-1`}>開始</Text>
                <View style={tw`flex-row`}>
                  <Pill
                    label={
                      ws.startDate
                        ? ws.startDate.toLocaleDateString()
                        : '未設定'
                    }
                    onPress={() =>
                      setStatusPickerState({
                        visible: true,
                        targetId: ws.id,
                        field: 'start',
                        mode: 'date',
                      })
                    }
                  />
                  <Pill
                    label={ws.startDate ? fmtTime(ws.startDate) : '--:--'}
                    onPress={() =>
                      setStatusPickerState({
                        visible: true,
                        targetId: ws.id,
                        field: 'start',
                        mode: 'time',
                      })
                    }
                    mr={false}
                  />
                </View>
              </View>

              <View style={tw`mb-3`}>
                <Text style={tw`mb-1`}>終了</Text>
                <View style={tw`flex-row`}>
                  <Pill
                    label={
                      ws.endDate ? ws.endDate.toLocaleDateString() : '未設定'
                    }
                    onPress={() =>
                      setStatusPickerState({
                        visible: true,
                        targetId: ws.id,
                        field: 'end',
                        mode: 'date',
                      })
                    }
                  />
                  <Pill
                    label={ws.endDate ? fmtTime(ws.endDate) : '--:--'}
                    onPress={() =>
                      setStatusPickerState({
                        visible: true,
                        targetId: ws.id,
                        field: 'end',
                        mode: 'time',
                      })
                    }
                    mr={false}
                  />
                </View>
              </View>

              {/* ステータスごとの参加従業員（開始〜終了の各日） */}
              <Text style={tw`mt-2 mb-1`}>参加従業員（各日）</Text>

              {/* 表示する事業部（4部門のみ） */}
              <View style={tw`mb-3 p-2 border rounded`}>
                <Text style={tw`mb-1`}>表示する事業部</Text>
                <View style={tw`flex-row flex-wrap -mx-1`}>
                  {ALLOWED_DEPTS.map((dept) => {
                    const selected = visibleDeptSet.has(dept);
                    return (
                      <TouchableOpacity
                        key={dept}
                        activeOpacity={0.7}
                        onPress={() => {
                          setVisibleDeptSet((prev) => {
                            const next = new Set(prev);
                            if (next.has(dept)) next.delete(dept);
                            else next.add(dept);
                            return next;
                          });
                        }}
                        style={tw.style(
                          'm-1 px-3 py-2 rounded border',
                          selected
                            ? 'bg-blue-100 border-blue-400'
                            : 'bg-white border-gray-300'
                        )}
                      >
                        <Text>{(selected ? '☑ ' : '☐ ') + dept}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={tw`text-xs text-gray-600 mt-1`}>
                  ※ チェックした事業部のみ、下の従業員一覧に表示されます。
                </Text>
              </View>

              {statusDates.length === 0 && (
                <Text>このステータスの開始・終了を設定してください。</Text>
              )}

              {statusDates.map((d) => {
                const y = toYmd(d);
                const blocked = unavailableEmpMap[y] || new Set();
                const cur = participantSelectionsByDay[y] || new Set();

                const onToggle = (empId) => {
                  if (empAvailLoading) return;
                  if (blocked.has(empId)) {
                    Alert.alert(
                      '選択不可',
                      'この日は他プロジェクトで割当済みの従業員です'
                    );
                    return;
                  }
                  setParticipantSelectionsByDay((prev) => {
                    const s = new Set(Array.from(prev[y] || []));
                    if (s.has(empId)) s.delete(empId);
                    else s.add(empId);
                    return { ...prev, [y]: s };
                  });
                };

                return (
                  <View key={y} style={tw`mb-4 p-2 border rounded`}>
                    <Text style={tw`font-bold mb-2`}>
                      {d.toLocaleDateString()}
                    </Text>

                    {/* 事業部ごとの従業員セクション（社員） */}
                    {visibleDeptArray.length === 0 && (
                      <Text style={tw`text-gray-500`}>
                        表示対象の事業部が選択されていません。
                      </Text>
                    )}

                    {visibleDeptArray.map((dept) => {
                      const list = deptEmployeesOrdered[dept] || [];
                      return (
                        <View key={`${y}-${dept}`} style={tw`mb-3`}>
                          <Text style={tw`mb-1`}></Text>
                          {list.length === 0 ? (
                            <Text style={tw`text-gray-500`}>
                              該当従業員なし
                            </Text>
                          ) : (
                            <View style={tw`flex-row flex-wrap -mx-1`}>
                              {list.map((emp) => {
                                const isSel =
                                  cur.has?.(emp.id) ||
                                  cur.includes?.(emp.id);
                                const isBlocked = blocked.has(emp.id);
                                return (
                                  <TouchableOpacity
                                    key={emp.id}
                                    disabled={isBlocked || empAvailLoading}
                                    onPress={() => onToggle(emp.id)}
                                    activeOpacity={0.7}
                                    style={tw.style(
                                      'm-1 px-3 py-2 rounded border',
                                      isBlocked
                                        ? 'bg-gray-200 border-gray-300 opacity-50'
                                        : empAvailLoading
                                        ? 'bg-gray-100 border-gray-300 opacity-60'
                                        : isSel
                                        ? 'bg-blue-100 border-blue-400'
                                        : 'bg-white border-gray-300'
                                    )}
                                  >
                                    <Text>
                                      {(isSel ? '☑ ' : '☐ ') +
                                        (emp.name || '—')}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })}

              {/* ステータスごとの車両選択（開始〜終了の各日：営業車／積載車） */}
              <Text style={tw`mt-2 mb-1`}>車両選択</Text>
              {statusDates.length === 0 && (
                <Text>このステータスの開始・終了を設定してください。</Text>
              )}

              {statusDates.map((d) => {
                const ymd = toYmd(d);
                const unavailable = unavailableMap[ymd] || new Set();
                const sel = vehicleSelections[ymd] || {};
                const salesList = vehicles.filter(
                  (v) => (v?.vehicleType || 'sales') === 'sales'
                );
                const cargoList = vehicles.filter(
                  (v) => (v?.vehicleType || 'sales') === 'cargo'
                );

                const RenderGroup = ({ title, type, list }) => (
                  <View style={tw`mb-3`}>
                    <Text style={tw`mb-1`}>
                      {title}
                      {availLoading ? '（判定中…）' : ''}
                    </Text>
                    {list.length === 0 ? (
                      <Text style={tw`text-gray-500`}>該当車両なし</Text>
                    ) : (
                      <View style={tw`flex-row flex-wrap -mx-1`}>
                        {list.map((v) => {
                          const isBlocked = unavailable.has(v.id);
                          const isSelected = sel[type] === v.id;
                          return (
                            <TouchableOpacity
                              key={v.id}
                              disabled={isBlocked || availLoading}
                              onPress={() =>
                                onPickVehicle(
                                  ymd,
                                  type,
                                  isSelected ? undefined : v.id
                                )
                              }
                              activeOpacity={0.7}
                              style={tw.style(
                                'm-1 px-3 py-2 rounded border',
                                isBlocked
                                  ? 'bg-gray-200 border-gray-300 opacity-50'
                                  : availLoading
                                  ? 'bg-gray-100 border-gray-300 opacity-60'
                                  : isSelected
                                  ? 'bg-blue-100 border-blue-400'
                                  : 'bg-white border-gray-300'
                              )}
                            >
                              <Text>
                                {isSelected ? '☑ ' : '☐ '}
                                {v.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );

                return (
                  <View key={ymd} style={tw`mb-4 p-2 border rounded`}>
                    <Text style={tw`font-bold mb-2`}>
                      {d.toLocaleDateString()}
                    </Text>
                    <RenderGroup
                      title="営業車枠"
                      type="sales"
                      list={salesList}
                    />
                    <RenderGroup
                      title="積載車枠"
                      type="cargo"
                      list={cargoList}
                    />
                  </View>
                );
              })}


              {/* このステータス専用の確定ボタン */}
              <PrimaryButton
                title="このステータスの入力を反映"
                onPress={() => handleWorkStatusConfirm(ws.id)}
                disabled={loading}
              />
            </View>
          );
        })}




        {/* 作業ステータス用 日付/時刻ピッカー */}
        <DateTimePickerModal
          isVisible={statusPickerState.visible}
          mode={statusPickerState.mode === 'time' ? 'time' : 'date'}
          display={
            Platform.OS === 'ios'
              ? statusPickerState.mode === 'time'
                ? 'spinner'
                : 'inline'
              : 'default'
          }
          date={statusPickerDate}
          locale="ja"
          confirmTextIOS="決定"
          cancelTextIOS="キャンセル"
          onConfirm={(d) => {
            setStatusPickerState((prev) => ({ ...prev, visible: false }));
            if (!d || !statusPickerState.targetId || !statusPickerState.field) {
              return;
            }
            setWorkStatuses((prev) =>
              prev.map((ws) => {
                if (ws.id !== statusPickerState.targetId) return ws;

                let start = ws.startDate || roundToHour(new Date());
                let end = ws.endDate || roundToHour(new Date());

                if (statusPickerState.mode === 'date') {
                  if (statusPickerState.field === 'start') {
                    const merged = new Date(d);
                    merged.setHours(start.getHours(), start.getMinutes(), 0, 0);
                    start = merged;
                  } else {
                    const merged = new Date(d);
                    merged.setHours(end.getHours(), end.getMinutes(), 0, 0);
                    end = merged;
                  }
                } else {
                  // time
                  if (statusPickerState.field === 'start') {
                    const merged = new Date(start);
                    merged.setHours(d.getHours(), d.getMinutes(), 0, 0);
                    start = merged;
                  } else {
                    const merged = new Date(end);
                    merged.setHours(d.getHours(), d.getMinutes(), 0, 0);
                    end = merged;
                  }
                }

                // start <= end に補正
                if (end < start) {
                  if (statusPickerState.field === 'start') {
                    end = start;
                  } else {
                    start = end;
                  }
                }

                return { ...ws, startDate: start, endDate: end };
              })
            );
          }}
          onCancel={() =>
            setStatusPickerState((prev) => ({ ...prev, visible: false }))
          }
        />

        <PrimaryButton
          title={loading ? '確定中...' : '確定'}
          onPress={handleSubmit}
          disabled={loading}
        />
      </ScrollView>
    </View>
  );
}
