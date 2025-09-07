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

    setLoading(true);
    try {
      const actor = {
        by:     me?.id ?? route?.params?.userEmail ?? null,
        byName: me?.name ?? null,
      };
      if (editingProjectId) {
        // ← 編集：上書き更新
        await setProject(editingProjectId, payload, actor);
        await loadProjects();
        Alert.alert('成功', 'プロジェクトを更新しました');
        setEditingProjectId(null);
      } else {
        // ← 新規追加
        await setProject(null, payload, actor);
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
