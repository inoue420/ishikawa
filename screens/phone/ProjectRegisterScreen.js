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
} from '../../firestoreService';
import { Picker } from '@react-native-picker/picker';
import {
  fetchVehicles,
  fetchVehicleBlocksOverlapping,
  fetchReservationsInRange,
  fetchReservationsForProject,
  setVehicleReservation,
  clearReservationsForProject,
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
const RENTAL_PER_SQM   = 70000;

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

// Picker のプレースホルダー値
const PH = '__placeholder__';

export default function ProjectRegisterScreen({ route }) {
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
  const [sales, setSales] = useState(PH);
  const [survey, setSurvey] = useState(PH);
  const [design, setDesign] = useState(PH);
  const [management, setManagement] = useState(PH);
  const [participants, setParticipants] = useState([]);

  const toggleParticipant = useCallback((empId) => {
    setParticipants(prev =>
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  }, []);
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

  // 期間の空き状況（既予約・車検/修理）を算出
  useEffect(() => {
    (async () => {
      if (datesInRange.length === 0) { setUnavailableMap({}); setVehicleSelections({}); return; }
      const s = datesInRange[0];
      const e = datesInRange[datesInRange.length - 1];
      const startTs = Timestamp.fromDate(new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0,0,0,0));
      const endTs   = Timestamp.fromDate(new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23,59,59,999));

      const blocks = await fetchVehicleBlocksOverlapping(startTs, endTs);
      const reservations = await fetchReservationsInRange(startTs, endTs);

      const map = {};
      datesInRange.forEach(d => { map[toYmd(d)] = new Set(); });

      // 使用不可：車検/修理ブロック
      for (const b of blocks) {
        const bs = b.startDate.toDate ? b.startDate.toDate() : new Date(b.startDate);
        const be = b.endDate.toDate ? b.endDate.toDate() : new Date(b.endDate);
        for (const d of datesInRange) {
          const dd = dateOnly(d);
          if (dd >= dateOnly(bs) && dd <= dateOnly(be)) {
            map[toYmd(d)].add(b.vehicleId);
          }
        }
      }
      // 使用不可：他プロジェクト予約
      for (const r of reservations) {
        const dy = toYmd(r.date.toDate ? r.date.toDate() : new Date(r.date));
        if (!map[dy]) map[dy] = new Set();
        map[dy].add(r.vehicleId);
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
    })();
  }, [datesInRange.length, editingProjectId, vehiclesById]);

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

  // ─────────────────────────────
  // 左フォームに値を流し込むヘルパー
  // ─────────────────────────────
  const prefillLeftForm = useCallback((src, { appendCopySuffix = false } = {}) => {
    setName(src.name ? (appendCopySuffix ? `${src.name} (コピー)` : src.name) : '');
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
    setSales(src.sales ?? PH);
    setSurvey(src.survey ?? PH);
    setDesign(src.design ?? PH);
    setManagement(src.management ?? PH);
    setParticipants(Array.isArray(src.participants) ? src.participants : []);
  }, []);  

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
    if ([sales, survey, design, management].some(v => v === PH)) {
      return Alert.alert('入力エラー', 'すべての役割を「選択してください」以外に設定してください');
    }
    if (!name.trim()) return Alert.alert('入力エラー', 'プロジェクト名を入力してください');
    if (!clientName.trim()) return Alert.alert('入力エラー', '顧客名を入力してください');

    const participantObjs = employees.filter(e => participants.includes(e.id));
    const externalCount = participantObjs.filter(e => (e?.division === '外注')).length;
    const internalCount = participantObjs.length - externalCount;

    const hours = calcWorkHours(startDate, endDate);

    const laborCost = Math.round(
      internalCount * EMPLOYEE_HOURLY * hours + externalCount * EXTERNAL_HOURLY * hours
    );
    const rentalResourceCost = Math.round((toNumberOrNull(areaSqm) || 0) * RENTAL_PER_SQM);

    const payload = {
      name: name.trim(),
      clientName: clientName.trim(),
      startDate,
      endDate,
      sales,
      survey,
      design,
      management,
      participants,
      isMilestoneBilling: false,

      orderAmount: toNumberOrNull(orderAmount),
      travelCost: toNumberOrNull(travelCost),
      miscExpense: toNumberOrNull(miscExpense),
      areaSqm: toNumberOrNull(areaSqm),
      projectType: projectType,

      laborCost,
      rentalResourceCost,

      workLogs: [],
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
      const actor = {
        by:     me?.id ?? route?.params?.userEmail ?? null,
        byName: me?.name ?? null,
      };
      if (editingProjectId) {
        // ← 編集：上書き更新
        await setProject(editingProjectId, payload, actor);
        await clearReservationsForProject(editingProjectId);
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
        }
        // クリア
        setName('');
        setClientName('');
        setStartDate(roundToHour(new Date()));
        setEndDate(roundToHour(new Date()));
        setParticipants([]);
        setOrderAmount('');
        setTravelCost('');
        setMiscExpense('');
        setAreaSqm('');
        setProjectType(null);
        setSales(PH);
        setSurvey(PH);
        setDesign(PH);
        setManagement(PH);
        setVehicleSelections({});
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

        {/* 各担当（役員・部長のみ） */}
        <Text>営業担当</Text>
        <View style={tw`border rounded mb-2 overflow-hidden`}>
          <Picker selectedValue={sales} onValueChange={setSales}>
            <Picker.Item label="選択してください" value={PH} color="#9ca3af" />
            {managerCandidates.map(emp => (
              <Picker.Item key={emp.id} label={emp.name} value={emp.id} />
            ))}
          </Picker>
        </View>

        <Text>現場調査担当</Text>
        <View style={tw`border rounded mb-2 overflow-hidden`}>
          <Picker selectedValue={survey} onValueChange={setSurvey}>
            <Picker.Item label="選択してください" value={PH} color="#9ca3af" />
            {managerCandidates.map(emp => (
              <Picker.Item key={emp.id} label={emp.name} value={emp.id} />
            ))}
          </Picker>
        </View>

        <Text>設計担当</Text>
        <View style={tw`border rounded mb-2 overflow-hidden`}>
          <Picker selectedValue={design} onValueChange={setDesign}>
            <Picker.Item label="選択してください" value={PH} color="#9ca3af" />
            {managerCandidates.map(emp => (
              <Picker.Item key={emp.id} label={emp.name} value={emp.id} />
            ))}
          </Picker>
        </View>

        <Text>管理担当</Text>
        <View style={tw`border rounded mb-2 overflow-hidden`}>
          <Picker selectedValue={management} onValueChange={setManagement}>
            <Picker.Item label="選択してください" value={PH} color="#9ca3af" />
            {managerCandidates.map(emp => (
              <Picker.Item key={emp.id} label={emp.name} value={emp.id} />
            ))}
          </Picker>
        </View>

        {/* 参加従業員（複数選択） */}
        <Text style={tw`mt-2`}>参加従業員</Text>
        <Text style={tw`mb-1`}>選択中: {participants.length}名</Text>
        {employees.map((emp) => {
          const checked = participants.includes(emp.id);
          return (
            <TouchableOpacity
              key={emp.id}
              onPress={() => toggleParticipant(emp.id)}
              style={tw`bg-white border border-gray-300 rounded p-2 mb-2`}
              activeOpacity={0.7}
            >
              <Text>{checked ? '☑ ' : '☐ '}{emp.name}</Text>
            </TouchableOpacity>
          );
        })}

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
                setEndDate(merged);
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
                setEndDate(d);
              }
            }}
          />
        )}

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
              <Text style={tw`mb-1`}>{title}</Text>
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
                        disabled={isBlocked}
                        onPress={() => onPickVehicle(ymd, type, isSelected ? undefined : v.id)}
                        activeOpacity={0.7}
                        style={tw.style(
                          'm-1 px-3 py-2 rounded border',
                          isBlocked
                            ? 'bg-gray-200 border-gray-300 opacity-50'
                            : (isSelected
                                ? 'bg-blue-100 border-blue-400'
                                : 'bg-white border-gray-300'
                              )
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
