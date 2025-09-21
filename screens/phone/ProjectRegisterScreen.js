import React, { useEffect, useState, useCallback, useRef, useMemo  } from 'react';
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
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  fetchProjects,
  setProject,
  fetchAllUsers,
  findEmployeeByIdOrEmail,
  fetchProjectsOverlappingRange,
} from '../../firestoreService';
import {
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

  useEffect(() => {
    if (me) console.log('[PRS] me resolved:', { id: me?.id, email: me?.email, name: me?.name, loginId: me?.loginId });
  }, [me]);

  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [startDate, setStartDate] = useState(() => roundToHour());
  const [endDate, setEndDate] = useState(() => roundToHour());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  // 金額・面積など
  const [orderAmount, setOrderAmount] = useState('');
  const [travelCost, setTravelCost] = useState('');
  const [miscExpense, setMiscExpense] = useState('');
  const [areaSqm, setAreaSqm] = useState('');

  // 新規/既存
  const [projectType, setProjectType] = useState(null);


  // 従業員・担当
  const [employees, setEmployees] = useState([]);
  // 日毎の参加者選択 { 'YYYY-MM-DD': Set<employeeId> }
  const [participantSelectionsByDay, setParticipantSelectionsByDay] = useState({});
  // 使用不可マップ { 'YYYY-MM-DD': Set<employeeId> }
  const [unavailableEmpMap, setUnavailableEmpMap] = useState({});
  const [empAvailLoading, setEmpAvailLoading] = useState(false);
  const employeesById = useMemo(
    () => Object.fromEntries((employees || []).map(e => [e.id, e])),
    [employees]
  );
  // コスト算出等のため「全日合算の参加者」ユニオン配列を作る
  const participants = useMemo(() => {
    const s = new Set();
    Object.values(participantSelectionsByDay || {}).forEach(v => {
      const arr = Array.isArray(v) ? v : Array.from(v || []);
      arr.forEach(id => s.add(id));
    });
    return Array.from(s);
  }, [participantSelectionsByDay]);
  // 役員・部長のみを担当候補にする（従業員は除外）
  const managerCandidates = useMemo(() => {
    return (employees || []).filter(e => {
      const r = String(e?.role || '').toLowerCase();
      return r === 'executive' || r === 'manager';
    });
  }, [employees]);

  const leftScrollRef = useRef(null);
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

  const datesInRange = useMemo(() => {
    if (!startDate || !endDate) return [];
    const s0 = dateOnly(startDate), e0 = dateOnly(endDate);
    const arr = [];
    for (let d = new Date(s0); d <= e0; d.setDate(d.getDate() + 1)) {
      arr.push(new Date(d));
    }
    return arr;
  }, [startDate, endDate]);
  // 期間の「参加者」空き状況（他案件割当との時間帯オーバーラップ）
  useEffect(() => {
    (async () => {
      if (datesInRange.length === 0) {
        setUnavailableEmpMap({});
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

      const dayWindow = (d) => {
        const sd = startDate, ed = endDate;
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0);
        const dayEnd   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23,59,59,999);
        const clampStart =
          (sd <= dayStart && ed >= dayEnd) ? dayStart :
          (toYmd(sd) === toYmd(d)) ? sd : dayStart;
        const clampEnd =
          (sd <= dayStart && ed >= dayEnd) ? dayEnd :
          (toYmd(ed) === toYmd(d)) ? ed : dayEnd;
        return [clampStart, clampEnd];
      };
      const overlaps = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

      for (const a of assignments) {
        if (editingProjectId && a.projectId === editingProjectId) continue;
        const other = projMap[a.projectId];
        if (!other) continue;
        const oS = other.startDate?.toDate?.() ?? new Date(other.startDate);
        const oE = other.endDate?.toDate?.() ?? new Date(other.endDate || other.startDate);
        const dy = a.dateKey || toYmd(a.date?.toDate?.() ?? new Date(a.date));
        const d  = new Date(dy);
        if (!map[dy]) continue;
        const [meS, meE] = dayWindow(d);
        const oDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0);
        const oDayEnd   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23,59,59,999);
        const oClampS =
          (oS <= oDayStart && oE >= oDayEnd) ? oDayStart :
          (toYmd(oS) === dy) ? oS : oDayStart;
        const oClampE =
          (oS <= oDayStart && oE >= oDayEnd) ? oDayEnd :
          (toYmd(oE) === dy) ? oE : oDayEnd;
        if (overlaps(meS, meE, oClampS, oClampE)) {
          map[dy].add(a.employeeId);
        }
      }
      setUnavailableEmpMap(map);

      // 編集時は自案件の既存割当てをプリフィル
      if (editingProjectId) {
        const mine = await fetchAssignmentsForProject(editingProjectId);
        const next = {};
        for (const r of mine) {
          const dy = r.dateKey || toYmd(r.date?.toDate?.() ?? new Date(r.date));
          const set = new Set(next[dy] || []);
          set.add(r.employeeId);
          next[dy] = set;
        }
        setParticipantSelectionsByDay(next);
      } else {
        setParticipantSelectionsByDay({});
      }
      setEmpAvailLoading(false);
    })();
  }, [startDate.getTime(), endDate.getTime(), editingProjectId]);

  // 期間の空き状況（既予約・車検/修理）を算出
  useEffect(() => {
    (async () => {
      setAvailLoading(true);
      if (datesInRange.length === 0) { setUnavailableMap({}); setVehicleSelections({}); return; }
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
      // この画面で入力中の「自プロジェクトのその日ごとの時間窓」を求める
      const dayWindow = (d) => {
        const sd = startDate, ed = endDate;
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0);
        const dayEnd   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23,59,59,999);
        const clampStart =
          (sd <= dayStart && ed >= dayEnd) ? dayStart :
          (toYmd(sd) === toYmd(d)) ? sd : dayStart;
        const clampEnd =
          (sd <= dayStart && ed >= dayEnd) ? dayEnd :
          (toYmd(ed) === toYmd(d)) ? ed : dayEnd;
        return [clampStart, clampEnd];
      };
      const overlaps = (a1, a2, b1, b2) => a1 < b2 && b1 < a2; // 端がピッタリは非重複扱い

      // 使用不可：車検/修理ブロック
      for (const b of blocks) {
        const bs = b.startDate.toDate ? b.startDate.toDate() : new Date(b.startDate);
        const be = b.endDate.toDate ? b.endDate.toDate() : new Date(b.endDate);
        for (const d of datesInRange) {
          const [meS, meE] = dayWindow(d);
          if (overlaps(meS, meE, bs, be)) map[toYmd(d)].add(b.vehicleId);
        }
      }
      // 使用不可：他プロジェクト予約
      for (const r of reservations) {
        if (editingProjectId && r.projectId === editingProjectId) continue; // 自案件は除外
        const other = projMap[r.projectId];
        if (!other) continue;
        const oS = other.startDate?.toDate?.() ?? new Date(other.startDate);
        const oE = (other.endDate?.toDate?.() ?? new Date(other.endDate || other.startDate));
        const d  = (r.date?.toDate?.() ?? new Date(r.date));
        const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const [meS, meE] = dayWindow(day);
        // 相手プロジェクトのその日の時間窓
        const oDayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0,0,0,0);
        const oDayEnd   = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23,59,59,999);
        const oClampS =
          (oS <= oDayStart && oE >= oDayEnd) ? oDayStart :
          (toYmd(oS) === toYmd(day)) ? oS : oDayStart;
        const oClampE =
          (oS <= oDayStart && oE >= oDayEnd) ? oDayEnd :
          (toYmd(oE) === toYmd(day)) ? oE : oDayEnd;
        if (overlaps(meS, meE, oClampS, oClampE)) {
          const dy = toYmd(day);
          if (!map[dy]) map[dy] = new Set();
          map[dy].add(r.vehicleId);
        }
      }
      setUnavailableMap(map);

      // 編集時：自プロジェクトの既存予約でプリフィル
      if (editingProjectId) {
        const mine = await fetchReservationsForProject(editingProjectId);
        const next = {};
        for (const r of mine) {
          const dy = toYmd(r.date.toDate ? r.date.toDate() : new Date(r.date));
          const v  = vehiclesById[r.vehicleId];
          const t  = (v?.vehicleType || 'sales'); // 既存データは営業車扱いにフォールバック
          next[dy] = { ...(next[dy] || {}), [t]: r.vehicleId };
        }
        setVehicleSelections(next);
      } else {
        setVehicleSelections({});
      }
    })().finally(() => setAvailLoading(false));
 }, [startDate.getTime(), endDate.getTime(), editingProjectId, vehiclesById]);

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

  const prefillLeftForm = useCallback((src, { appendCopySuffix = false } = {}) => {
    // name から【場所】を分離（src.location があれば優先）
    const parsed = parseNameForLocation(src.name);
    const loc = src.location || parsed.loc;
    const plainName = src.location ? parsed.plain || parsed.plain === '' ? parsed.plain : src.name : parsed.plain;
    setName(plainName ? (appendCopySuffix ? `${plainName} (コピー)` : plainName) : '');
    setClientName(src.clientName ?? '');
    const s = toSafeDate(src.startDate) ?? roundToHour(new Date());
    const e = toSafeDate(src.endDate) ?? s;
    setStartDate(s);
    setEndDate(e);
    setProjectType(src.projectType ?? null);
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
    if (src.participantPlan && typeof src.participantPlan === 'object') {
      const next = {};
      Object.entries(src.participantPlan).forEach(([dy, arr]) => {
        next[dy] = new Set(arr || []);
      });
      setParticipantSelectionsByDay(next);
    }
  }, [employeesById]); 

  // ─────────────────────────────────────────────
  // 事前入力（コピー / 編集）:
  // - copy: 左フォームに流し込む
  // - edit: 左フォームにも流し込み、送信で上書き保存できるようにする
  //   （従来の右リストのインライン編集も動くが、左フォーム編集を優先）
  // ─────────────────────────────────────────────

useEffect(() => {
  const params = route?.params ?? {};

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
}, [route?.params, projects, prefillLeftForm]);



  // ─────────────────────────────────────────────
  // 時刻ピッカー：ボックスタップですぐ選択 → 選択と同時に即閉じる
  // iOS: spinner, Android: clock（24h）
  // ─────────────────────────────────────────────
  const timePickerProps = {
    mode: 'time',
    display: Platform.OS === 'ios' ? 'spinner' : 'clock',
    is24Hour: true,
  };

  const handleSubmit = async () => {
    // 担当の未選択チェック
    // 役割バリデーション：ID選択 or その他テキスト必須
    const roleOk = (choice, other) => choice && (choice !== OTHER_ROLE || (OTHER_ROLE && other.trim()));
    if (!roleOk(salesChoice, salesOtherName)
      || !roleOk(surveyChoice, surveyOtherName)
      || !roleOk(designChoice, designOtherName)
      || !roleOk(managementChoice, managementOtherName)) {
      return Alert.alert('入力エラー', '各担当は「社員の選択」か「その他テキスト」のいずれかを入力してください');
    }
    if (!name.trim()) return Alert.alert('入力エラー', 'プロジェクト名を入力してください');
    if (!locationChoice) return Alert.alert('入力エラー', '場所を選択してください');
    if (locationChoice === LOCATION_OTHER && !locationOtherText.trim()) {
      return Alert.alert('入力エラー', 'その他地域名を入力してください');
    } 
    if (!clientName.trim()) return Alert.alert('入力エラー', '顧客名を入力してください');

    const participantObjs = employees.filter(e => participants.includes(e.id));
    const externalCount = participantObjs.filter(e => (e?.division === '外注')).length;
    const internalCount = participantObjs.length - externalCount;

    const hours = calcWorkHours(startDate, endDate);

    const laborCost = Math.round(
      internalCount * EMPLOYEE_HOURLY * hours + externalCount * EXTERNAL_HOURLY * hours
    );
    const rentalResourceCost = Math.round((toNumberOrNull(areaSqm) || 0) * RENTAL_PER_SQM);

    // --- 追加: プロジェクトに保存する車両プランを生成 ---

   const vehiclePlan = {};
   for (const d of datesInRange) {
     const ymd = toYmd(d);
     const sel = vehicleSelections[ymd] || {};
     const salesId = sel.sales || null;
     const cargoId = sel.cargo || null;
     if (salesId || cargoId) vehiclePlan[ymd] = { sales: salesId, cargo: cargoId };
   }
    const hasAnySelection = Object.keys(vehiclePlan).length > 0;    

    // 参加者（日毎）
    const participantPlan = {};
    for (const d of datesInRange) {
      const y = toYmd(d);
      const set = participantSelectionsByDay[y];
      const arr = Array.isArray(set) ? set : Array.from(set || []);
      if (arr.length) participantPlan[y] = arr;
    }
    const hasAnyParticipants = Object.keys(participantPlan).length > 0;
    // 表示名は【場所】プロジェクト名 で保存
    const finalName = `【${chosenLocation}】${name.trim()}`;
    const payload = {
      name: finalName,
      clientName: clientName.trim(),
      startDate,
      endDate,
      // 役割は ID（社員選択時のみ）を保存、その他は *_OtherName に保存
      sales:      (salesChoice      && salesChoice      !== OTHER_ROLE) ? salesChoice      : null,
      survey:     (surveyChoice     && surveyChoice     !== OTHER_ROLE) ? surveyChoice     : null,
      design:     (designChoice     && designChoice     !== OTHER_ROLE) ? designChoice     : null,
      management: (managementChoice && managementChoice !== OTHER_ROLE) ? managementChoice : null,
      salesOtherName:      salesChoice      === OTHER_ROLE ? salesOtherName.trim()      : null,
      surveyOtherName:     surveyChoice     === OTHER_ROLE ? surveyOtherName.trim()     : null,
      designOtherName:     designChoice     === OTHER_ROLE ? designOtherName.trim()     : null,
      managementOtherName: managementChoice === OTHER_ROLE ? managementOtherName.trim() : null,
      participants,
      isMilestoneBilling: false,

      orderAmount: toNumberOrNull(orderAmount),
      travelCost: toNumberOrNull(travelCost),
      miscExpense: toNumberOrNull(miscExpense),
      areaSqm: toNumberOrNull(areaSqm),
      location: chosenLocation, // ★ 検索や集計用に別フィールドも保存

      laborCost,
      rentalResourceCost,
      ...(hasAnySelection ? { vehiclePlan } : {}),
      ...(hasAnyParticipants ? { participantPlan } : {}),

    };

    // （任意）未選択の注意喚起（ここではログのみ）
    const missing = datesInRange.filter(d => {
      const sel = vehicleSelections[toYmd(d)] || {};
      return !sel.sales && !sel.cargo;
    }).length;
    if (datesInRange.length > 0 && missing > 0) {
      // 必須にしたい場合は Alert 後 return してください
      console.log('[PRS] vehicle not selected for', missing, 'days');
    }    
    setLoading(true);
    try {
      // 1) 競合の最終チェック（日単位）
      const conflicts = await checkVehicleConflicts(vehicleSelections, datesInRange, editingProjectId);
      if (conflicts.length) {
        const lines = conflicts.map(c => `・${c.date} / vehicleId=${c.vehicleId}`).join('\n');
        Alert.alert('車両の競合', `以下の日は他案件で使用中です。\n${lines}`);
        setLoading(false);
        return;
      }
      const actor = {
        by:     me?.id ?? route?.params?.userEmail ?? null,
        byName: me?.name ?? null,
      };
      if (editingProjectId) {
        // ← 編集：上書き更新
        await setProject(editingProjectId, payload, actor);
        await clearReservationsForProject(editingProjectId);
        await clearAssignmentsForProject(editingProjectId);
        for (const d of datesInRange) {
          const ymd = toYmd(d);
          const sel = vehicleSelections[ymd] || {};
          for (const t of ['sales','cargo']) {
            const vid = sel[t];
            if (!vid) continue;
            await setVehicleReservation(
              editingProjectId,
              new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0),
              vid
            );
          }
          // 参加者の保存
          const set = participantSelectionsByDay[ymd];
          const arr = Array.isArray(set) ? set : Array.from(set || []);
          for (const empId of arr) {
            await setEmployeeAssignment(
              editingProjectId,
              new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0),
              empId
            );
          }
        }
        await loadProjects();
        Alert.alert('成功', 'プロジェクトを更新しました');
        setEditingProjectId(null);
      } else {
        // ← 新規追加
        const newProjectId = await setProject(null, payload, actor);
        // 予約作成
        for (const d of datesInRange) {
          const ymd = toYmd(d);
          const sel = vehicleSelections[ymd] || {};
          for (const t of ['sales','cargo']) {
            const vid = sel[t];
            if (!vid) continue;
            await setVehicleReservation(
              newProjectId,
              new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0),
              vid
            );
          }
          const set = participantSelectionsByDay[ymd];
          const arr = Array.isArray(set) ? set : Array.from(set || []);
          for (const empId of arr) {
            await setEmployeeAssignment(
              newProjectId,
              new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0),
              empId
            );
          }
        }
        // クリア
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
        setSalesChoice(null); setSalesOtherName('');
        setSurveyChoice(null); setSurveyOtherName('');
        setDesignChoice(null); setDesignOtherName('');
        setManagementChoice(null); setManagementOtherName('');
        setLocationChoice(null);
        setLocationOtherText('');
        await loadProjects();
        Alert.alert('成功', 'プロジェクトを追加しました');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', editingProjectId ? 'プロジェクトの更新に失敗しました' : 'プロジェクトの追加に失敗しました');
    } finally {
      setLoading(false);
    }
  };


  // --- UI（右カラム廃止 → 単一カラム） ---
  return (
    <View style={tw`flex-1`}>
      {/* 単一カラム：新規/編集フォーム */}
      <ScrollView
        ref={leftScrollRef}
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


        {/* 日付・時刻 */}
        <Text>開始予定日</Text>
        <TouchableOpacity
          onPress={() => setShowStartPicker(true)}
          activeOpacity={0.7}
          style={tw`border p-2 mb-2 rounded`}
        >
          <Text>{startDate.toLocaleDateString()}</Text>
        </TouchableOpacity>
        {showStartPicker && (
          <DateTimePicker
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
            value={startDate}
            onChange={(_e, d) => {
              setShowStartPicker(false);
              if (d) {
                const merged = new Date(d);
                merged.setHours(startDate.getHours(), 0, 0, 0);
                setStartDate(merged);
                // 終了日が開始日より前なら引き上げる
                if (dateOnly(endDate) < dateOnly(merged)) {
                  setEndDate(new Date(merged)); // 同日・同時刻に合わせる
                }
              }
            }}
          />
        )}

        <Text>開始予定時刻</Text>
        <TouchableOpacity
          onPress={() => setShowStartTimePicker(true)}
          style={tw`border p-2 mb-2 rounded`}
          activeOpacity={0.7}
        >
          <Text>{fmtTime(startDate)}</Text>
        </TouchableOpacity>
        {showStartTimePicker && (
          <DateTimePicker
            {...timePickerProps}
            value={startDate}
            onChange={(e, t) => {
              // Android: e.type === 'dismissed' or 'set'
              setShowStartTimePicker(false);
              if (t) {
                const d = new Date(startDate);
                d.setHours(t.getHours(), t.getMinutes(), 0, 0);
                setStartDate(d);
              // 同じ日で終了時刻が開始より前なら引き上げる
              if (toYmd(endDate) === toYmd(d) && endDate < d) {
                setEndDate(new Date(d));
              }
              }
            }}
          />
        )}

        <Text>終了予定日</Text>
        <TouchableOpacity
          onPress={() => setShowEndPicker(true)}
          activeOpacity={0.7}
          style={tw`border p-2 mb-2 rounded`}
        >
          <Text>{endDate.toLocaleDateString()}</Text>
        </TouchableOpacity>
        {showEndPicker && (
          <DateTimePicker
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
            value={endDate}
            onChange={(_e, d) => {
              setShowEndPicker(false);
              if (d) {
                const merged = new Date(d);
                merged.setHours(endDate.getHours(), 0, 0, 0);
                setEndDate(dateOnly(merged) < dateOnly(startDate) ? new Date(startDate) : merged);
              }
            }}
          />
        )}

        <Text>終了予定時刻</Text>
        <TouchableOpacity
          onPress={() => setShowEndTimePicker(true)}
          style={tw`border p-2 mb-2 rounded`}
          activeOpacity={0.7}
        >
          <Text>{fmtTime(endDate)}</Text>
        </TouchableOpacity>
        {showEndTimePicker && (
          <DateTimePicker
            {...timePickerProps}
            value={endDate}
            onChange={(e, t) => {
              setShowEndTimePicker(false);
              if (t) {
                const d = new Date(endDate);
                d.setHours(t.getHours(), t.getMinutes(), 0, 0);
                setEndDate(d < startDate ? new Date(startDate) : d);
              }
            }}
          />
        )}

        {/* ===== 参加従業員（開始〜終了の各日） ===== */}
        <Text style={tw`text-lg font-bold mt-4 mb-2`}>参加従業員（各日）</Text>
        {datesInRange.length === 0 && <Text>日付範囲を設定してください。</Text>}
        {datesInRange.map((d) => {
          const y = toYmd(d);
          const blocked = unavailableEmpMap[y] || new Set();
          const cur = participantSelectionsByDay[y] || new Set();
          const onToggle = (empId) => {
            if (empAvailLoading) return;
            if (blocked.has(empId)) {
              Alert.alert('選択不可', 'この日は他プロジェクトで割当済みの従業員です');
              return;
            }
            setParticipantSelectionsByDay(prev => {
              const s = new Set(Array.from(prev[y] || []));
              if (s.has(empId)) s.delete(empId); else s.add(empId);
              return { ...prev, [y]: s };
            });
          };
          return (
            <View key={y} style={tw`mb-4 p-2 border rounded`}>
              <Text style={tw`font-bold mb-2`}>{d.toLocaleDateString()}</Text>
              <View style={tw`flex-row flex-wrap -mx-1`}>
                {employees.map(emp => {
                  const isSel = cur.has?.(emp.id) || cur.includes?.(emp.id);
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
                          : (empAvailLoading
                              ? 'bg-gray-100 border-gray-300 opacity-60'
                              : (isSel ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'))
                      )}
                    >
                      <Text>{(isSel ? '☑ ' : '☐ ') + (emp.name || '—')}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}

        {/* ===== 車両選択（開始〜終了の各日：営業車／積載車） ===== */}
        <Text style={tw`text-lg font-bold mt-4 mb-2`}>車両選択</Text>
        {datesInRange.length === 0 && <Text>日付範囲を設定してください。</Text>}
        {datesInRange.map((d) => {
          const ymd = toYmd(d);
          const unavailable = unavailableMap[ymd] || new Set();
          const sel = vehicleSelections[ymd] || {};
          const salesList = vehicles.filter(v => (v?.vehicleType || 'sales') === 'sales');
          const cargoList = vehicles.filter(v => (v?.vehicleType || 'sales') === 'cargo');
          const RenderGroup = ({ title, type, list }) => (
            <View style={tw`mb-3`}>
              <Text style={tw`mb-1`}>{title}{availLoading ? '（判定中…）' : ''}</Text>
              {list.length === 0 ? (
                <Text style={tw`text-gray-500`}>該当車両なし</Text>
              ) : (
                <View style={tw`flex-row flex-wrap -mx-1`}>
                  {list.map(v => {
                    const isBlocked = unavailable.has(v.id);
                    const isSelected = sel[type] === v.id;
                    return (
                      <TouchableOpacity
                        key={v.id}
                        disabled={isBlocked || availLoading}
                        onPress={() => onPickVehicle(ymd, type, isSelected ? undefined : v.id)}
                        activeOpacity={0.7}
                        style={tw.style(
                          'm-1 px-3 py-2 rounded border',
                           (isBlocked
                              ? 'bg-gray-200 border-gray-300 opacity-50'
                              : (availLoading
                                  ? 'bg-gray-100 border-gray-300 opacity-60'
                                  : (isSelected
                                      ? 'bg-blue-100 border-blue-400'
                                      : 'bg-white border-gray-300')))
                        )}
                      >
                        <Text>{isSelected ? '☑ ' : '☐ '}{v.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
          return (
            <View key={ymd} style={tw`mb-4 p-2 border rounded`}>
              <Text style={tw`font-bold mb-2`}>{d.toLocaleDateString()}</Text>
              <RenderGroup title="営業車枠" type="sales" list={salesList} />
              <RenderGroup title="積載車枠" type="cargo" list={cargoList} />
            </View>
          );
        })}

        <PrimaryButton
          title={
            loading
              ? (editingProjectId ? '更新中...' : '処理中...')
              : (editingProjectId ? '更新' : '追加')
          }
          onPress={handleSubmit}
          disabled={loading}
        />
      </ScrollView>
    </View>
  );
}
