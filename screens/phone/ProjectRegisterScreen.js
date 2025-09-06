// screens/phone/ProjectRegisterScreen.js
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  Alert,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from 'react-native';
import tw from 'twrnc';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  fetchProjects,
  setProject,
  deleteProject,
  fetchAllUsers,
  resolveEmployeeForAuth,   // ★ 既存：Auth 利用時の解決
  findEmployeeByIdOrEmail,  // ★ 追加：userEmail からの解決に使う
} from '../../firestoreService';
import { Picker } from '@react-native-picker/picker';
import { auth } from '../../firebaseConfig';

// --- 安全な日付ヘルパー群（追加） ---
const toSafeDate = (v) => {
  if (!v) return null;
  const d = v?.toDate ? v.toDate() : new Date(v);
  return (d instanceof Date && !isNaN(d)) ? d : null;
};
const fmtDate = (d) => d ? d.toLocaleDateString() : '-';
const fmtTime = (d) => d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';

const { width } = Dimensions.get('window');

// 分=00, 秒=0, ミリ秒=0 に丸める（“時”は維持）
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

// 入力中から3桁区切りに整形（数字以外を除去してカンマ付与）
const formatThousandsInput = (text) => {
  const digits = String(text).replace(/[^\d]/g, ''); // 半角数字以外を除去
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// ── 追加: コスト計算用の定数（式に埋め込み）
const EMPLOYEE_HOURLY = 3000;  // 社員時給[円]
const EXTERNAL_HOURLY  = 3500; // 外注時給[円]
const RENTAL_PER_SQM   = 70000; // レンタル・リソース費用 単価[円/m²]

// 日付のみ（00:00）に正規化
const dateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// 包含日数（start～end を両端含む）
const diffDaysInclusive = (start, end) =>
  Math.floor((dateOnly(end) - dateOnly(start)) / 86400000) + 1;

// 稼働時間の計算:
// ・同一日の場合 … end-start の実時間（時間）
// ・複数日の場合 … 日数×8時間
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
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ★ 追加：ログイン中の自分（Auth 未使用でも userEmail から特定）
  const [me, setMe] = useState(null);
  useEffect(() => {
    (async () => {
      const emailFromRoute =
        route?.params?.userEmail ? String(route.params.userEmail).toLowerCase() : null;
      console.log('[PRS] route.params.userEmail =', emailFromRoute);
      if (emailFromRoute) {
        const emp = await findEmployeeByIdOrEmail(emailFromRoute);
        console.log('[PRS] findEmployeeByIdOrEmail ->', emp);
        if (emp) {
          setMe(emp);
          return;
        }
      }
      try {
        // ★ 直に getAuth() せず、firebaseConfig から import した auth を使う
        const u = auth?.currentUser || null;
        console.log('[PRS] auth.currentUser =', u?.email || u?.uid || null);
        if (u) {
          const emp = await resolveEmployeeForAuth(u);
          console.log('[PRS] resolveEmployeeForAuth ->', emp);
          if (emp) setMe(emp);
        }
      } catch (e) {
        console.log('[PRS] resolve me failed:', e);
      }
    })();
  }, [route?.params?.userEmail]);

  // me が入ったかを確認
  useEffect(() => {
    if (me) console.log('[PRS] me resolved:', { id: me?.id, email: me?.email, name: me?.name, loginId: me?.loginId });
  }, [me]);

  // me が変わったら中身を確認
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

  // 追加: 新しい業務フィールド
  const [orderAmount, setOrderAmount] = useState(''); // 受注金額[円]
  const [travelCost, setTravelCost] = useState('');   // 交通費[円]
  const [miscExpense, setMiscExpense] = useState(''); // 諸経費[円]
  const [areaSqm, setAreaSqm] = useState('');        // 平米[m^2]

  // 新規/既存（トグル）
  // null=未選択, 'new'=新規, 'existing'=既存
  const [projectType, setProjectType] = useState(null);

  const [editingIndex, setEditingIndex] = useState(-1);
  const [editClient, setEditClient] = useState('');
  const [editStart, setEditStart] = useState(new Date());
  const [editEnd, setEditEnd] = useState(new Date());
  const [showEditStart, setShowEditStart] = useState(false);
  const [showEditEnd, setShowEditEnd] = useState(false);
  const [showEditStartTimePicker, setShowEditStartTimePicker] = useState(false);
  const [showEditEndTimePicker, setShowEditEndTimePicker] = useState(false);

  const [employees, setEmployees] = useState([]);
  const [sales, setSales] = useState(null);
  const [survey, setSurvey] = useState(null);
  const [design, setDesign] = useState(null);
  const [management, setManagement] = useState(null);
  const [participants, setParticipants] = useState([]);

  const toggleParticipant = useCallback((empId) => {
    setParticipants(prev =>
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  }, []);

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

  const handleAdd = async () => {
    if (!sales || !survey || !design || !management) {
      return Alert.alert('入力エラー', 'すべての役割を選択してください');
    }
    if (!name.trim()) return Alert.alert('入力エラー', 'プロジェクト名を入力してください');
    if (!clientName.trim()) return Alert.alert('入力エラー', '顧客名を入力してください');

    // ── 追加: 参加メンバーの内訳（外注/社員）
    const participantObjs = employees.filter(e => participants.includes(e.id));
    const externalCount = participantObjs.filter(e => (e?.division === '外注')).length;
    const internalCount = participantObjs.length - externalCount;

    // 稼働時間（複数日→日数×8h、同一日→実時間）
    const hours = calcWorkHours(startDate, endDate);

    // 人件費 = 社員×3000×h + 外注×3500×h（円）
    const laborCost = Math.round(
      internalCount * EMPLOYEE_HOURLY * hours + externalCount * EXTERNAL_HOURLY * hours
    );

    // レンタル・リソース費用 = 平米 × 7万円（円）
    const rentalResourceCost = Math.round((toNumberOrNull(areaSqm) || 0) * RENTAL_PER_SQM);

    // 数値化
    const payload = {
      name: name.trim(),
      clientName: clientName.trim(),
      startDate,
      endDate,
      // 役割
      sales,
      survey,
      design,
      management,
      participants,
      isMilestoneBilling: false,

      // 追加: 金額・面積・新規/既存
      orderAmount: toNumberOrNull(orderAmount), // 受注金額[円]
      travelCost: toNumberOrNull(travelCost),   // 交通費[円]
      miscExpense: toNumberOrNull(miscExpense), // 諸経費[円]
      areaSqm: toNumberOrNull(areaSqm),         // 平米[m^2]
      projectType: projectType,                 // 'new' | 'existing' | null

      // 追加: 内部保持用の計算フィールド
      laborCost,            // 人件費[円]（非表示/内部保持）
      rentalResourceCost,   // レンタル・リソース費用[円]（非表示/内部保持）

      // 将来「どの日に誰が何時間か」を入力するための箱（他画面で編集可能）
      workLogs: [], // 例: [{date:'2025-09-04', employeeId:'a@x', hours:4}]
    };

    setLoading(true);
    try {
      // ★ 重要：actor を冗長に作る（name が欠けたら従業員一覧から補完）
      const fallbackNameFromList =
        employees.find(e => e?.id === (me?.id ?? route?.params?.userEmail))?.name ?? null;
      const actor = {
        by:     me?.id ?? me?.email ?? route?.params?.userEmail ?? null,
        byName: me?.name ?? me?.loginId ?? fallbackNameFromList ?? null, // ← employees.name を最優先
      };
      console.log('[PRS] actor to setProject =', actor);

      await setProject(
        null,
        payload,
        { ...actor, actor } // ← 実装差異に強くするため両形式で渡す
      );

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

      await loadProjects();
      Alert.alert('成功', 'プロジェクトを追加しました');
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', 'プロジェクトの追加に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (idx) => {
    const proj = projects[idx];
    if (!proj) return;
    if (!editClient.trim()) return Alert.alert('入力エラー', '顧客名を入力してください');

    setLoading(true);
    try {
      // 既存フィールドのみ編集（※ setProject が merge:true であれば新フィールドは保持されます）
      await setProject(proj.id, {
        name: proj.name,
        clientName: editClient.trim(),
        startDate: editStart,
        endDate: editEnd,
        isMilestoneBilling: proj.isMilestoneBilling,
      },
      // ★ 更新時も actor を付与（編集者を残す）
      { by: me?.id ?? null, byName: me?.name ?? null });

      setEditingIndex(-1);
      await loadProjects();
      Alert.alert('成功', 'プロジェクトを更新しました');
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', 'プロジェクトの更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (idx) => {
    const proj = projects[idx];
    if (!proj) return;

    Alert.alert('確認', 'プロジェクトを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            // ★ 追加：削除ログにも作成者/実行者を残す
            await deleteProject(proj.id, { by: me?.id ?? null, byName: me?.name ?? null });
            setEditingIndex(-1);
            await loadProjects();
            Alert.alert('削除完了', 'プロジェクトを削除しました');
          } catch (e) {
            console.error(e);
            Alert.alert('エラー', '削除に失敗しました');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  // --- UI ---
  return (
    <View style={tw`flex-row`}>
      {/* 左カラム：新規追加フォーム (60%) */}
      <ScrollView
        ref={leftScrollRef}
        style={{ width: width * 0.6, padding: 12 }}
        contentContainerStyle={{ paddingBottom: leftBottomPadding }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={tw`text-lg font-bold mb-2`}>プロジェクト追加</Text>

        <Text>プロジェクト名</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={tw`border p-2 mb-2`}
        />

        <Text>顧客名</Text>
        <TextInput
          value={clientName}
          onChangeText={setClientName}
          style={tw`border p-2 mb-2`}
        />

        {/* 新規/既存 トグル（Text で包む） */}
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
          placeholder="例: 1200000"
          keyboardType="numeric"
          style={tw`border p-2 mb-2`}
        />

        <Text>交通費 [円]</Text>
        <TextInput
          value={travelCost}
          onChangeText={(v) => setTravelCost(formatThousandsInput(v))}
          placeholder="例: 30000"
          keyboardType="numeric"
          style={tw`border p-2 mb-2`}
        />

        <Text>諸経費 [円]</Text>
        <TextInput
          value={miscExpense}
          onChangeText={(v) => setMiscExpense(formatThousandsInput(v))}
          placeholder="例: 50000"
          keyboardType="numeric"
          style={tw`border p-2 mb-2`}
        />

        <Text>平米 [m²]</Text>
        <TextInput
          value={areaSqm}
          onChangeText={setAreaSqm}
          placeholder="例: 50"
          keyboardType="numeric"
          style={tw`border p-2 mb-2`}
        />

        {/* 各担当 */}
        <Text>営業担当</Text>
        <Picker selectedValue={sales} onValueChange={setSales} style={tw`border mb-2`}>
          {employees.map(emp => (
            <Picker.Item key={emp.id} label={emp.name} value={emp.id} />
          ))}
        </Picker>

        <Text>現場調査担当</Text>
        <Picker selectedValue={survey} onValueChange={setSurvey} style={tw`border mb-2`}>
          {employees.map(emp => (
            <Picker.Item key={emp.id} label={emp.name} value={emp.id} />
          ))}
        </Picker>

        <Text>設計担当</Text>
        <Picker selectedValue={design} onValueChange={setDesign} style={tw`border mb-2`}>
          {employees.map(emp => (
            <Picker.Item key={emp.id} label={emp.name} value={emp.id} />
          ))}
        </Picker>

        <Text>管理担当</Text>
        <Picker selectedValue={management} onValueChange={setManagement} style={tw`border mb-2`}>
          {employees.map(emp => (
            <Picker.Item key={emp.id} label={emp.name} value={emp.id} />
          ))}
        </Picker>

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

        {/* 日付・時刻（Text で包む） */}
        <Text>開始予定日</Text>
        <TouchableOpacity
          onPress={() => setShowStartPicker(true)}
          activeOpacity={0.7}
          style={tw`border p-2 mb-2`}
        >
          <Text>{startDate.toLocaleDateString()}</Text>
        </TouchableOpacity>
        {showStartPicker && (
          <DateTimePicker
            mode="date"
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
          style={tw`border p-2 mb-2`}
          activeOpacity={0.7}
        >
          <Text>{fmtTime(startDate)}</Text>
        </TouchableOpacity>
        {showStartTimePicker && (
          <DateTimePicker
            mode="time"
            value={startDate}
            onChange={(_e, t) => {
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
          style={tw`border p-2 mb-2`}
        >
          <Text>{endDate.toLocaleDateString()}</Text>
        </TouchableOpacity>
        {showEndPicker && (
          <DateTimePicker
            mode="date"
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
          style={tw`border p-2 mb-2`}
          activeOpacity={0.7}
        >
          <Text>{endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </TouchableOpacity>
        {showEndTimePicker && (
          <DateTimePicker
            mode="time"
            value={endDate}
            onChange={(_e, t) => {
              setShowEndTimePicker(false);
              if (t) {
                const d = new Date(endDate);
                d.setHours(t.getHours(), t.getMinutes(), 0, 0);
                setEndDate(d);
              }
            }}
          />
        )}

        <Button title={loading ? '処理中...' : '追加'} onPress={handleAdd} disabled={loading} />
      </ScrollView>

      {/* 右カラム：プロジェクト一覧 */}
      <ScrollView style={{ width: width * 0.4, padding: 12 }}>
        <Text style={tw`text-lg font-bold mb-2`}>登録プロジェクト一覧</Text>
        {projects.length === 0 ? (
          <Text>プロジェクトがありません</Text>
        ) : (
          projects.map((proj, idx) => {
            const sDate = toSafeDate(proj.startDate);
            const eDate = toSafeDate(proj.endDate);
            const isEditing = (editingIndex === idx);

            return (
              <View key={proj.id} style={tw`border rounded p-2 mb-3`}>
                <TouchableOpacity
                  onPress={() => {
                    setEditingIndex(idx);
                    setEditClient(proj.clientName ?? '');
                    setEditStart(sDate ?? new Date()); // ← nullなら今の時刻で初期化
                    setEditEnd(eDate ?? (sDate ?? new Date()));
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={tw`font-bold`}>{proj.name}</Text>
                  <Text>顧客: {proj.clientName}</Text>
                  <Text>開始: {fmtDate(sDate)}</Text>
                  <Text>終了: {fmtDate(eDate)}</Text>
                  {/* 参考表示（編集は ProjectDetail 側で対応予定） */}
                  <Text>区分: {proj.projectType === 'new' ? '新規'
                    : proj.projectType === 'existing' ? '既存' : '-'}</Text>
                  <Text>受注金額: {proj.orderAmount ?? '-'} 円</Text>
                  <Text>交通費: {proj.travelCost ?? '-'} 円</Text>
                  <Text>諸経費: {proj.miscExpense ?? '-'} 円</Text>
                  <Text>平米: {proj.areaSqm ?? '-'} m^2</Text>
                </TouchableOpacity>

                {isEditing && (
                  <View style={tw`mt-2`}>
                    <Text>顧客名</Text>
                    <TextInput
                      value={editClient}
                      onChangeText={setEditClient}
                      style={tw`border p-2 mb-2`}
                    />

                    <Text>開始予定日</Text>
                    <TouchableOpacity
                      onPress={() => setShowEditStart(true)}
                      activeOpacity={0.7}
                      style={tw`border p-2 mb-2`}
                    >
                      <Text>{editStart.toLocaleDateString()}</Text>
                    </TouchableOpacity>
                    {showEditStart && (
                      <DateTimePicker
                        mode="date"
                        value={editStart}
                        onChange={(_e, d) => {
                          setShowEditStart(false);
                          if (d) setEditStart(d);
                        }}
                      />
                    )}

                    <Text>開始予定時刻</Text>
                    <TouchableOpacity
                      onPress={() => setShowEditStartTimePicker(true)}
                      style={tw`border p-2 mb-2`}
                      activeOpacity={0.7}
                    >
                      <Text>{editStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                    </TouchableOpacity>
                    {showEditStartTimePicker && (
                      <DateTimePicker
                        mode="time"
                        value={editStart}
                        onChange={(_e, t) => {
                          setShowEditStartTimePicker(false);
                          if (t) {
                            const d = new Date(editStart);
                            d.setHours(t.getHours(), t.getMinutes(), 0, 0);
                            setEditStart(d);
                          }
                        }}
                      />
                    )}

                    <Text>終了予定日</Text>
                    <TouchableOpacity
                      onPress={() => setShowEditEnd(true)}
                      activeOpacity={0.7}
                      style={tw`border p-2 mb-2`}
                    >
                      <Text>{editEnd.toLocaleDateString()}</Text>
                    </TouchableOpacity>
                    {showEditEnd && (
                      <DateTimePicker
                        mode="date"
                        value={editEnd}
                        onChange={(_e, d) => {
                          setShowEditEnd(false);
                          if (d) setEditEnd(d);
                        }}
                      />
                    )}

                    <Text>終了予定時刻</Text>
                    <TouchableOpacity
                      onPress={() => setShowEditEndTimePicker(true)}
                      style={tw`border p-2 mb-2`}
                      activeOpacity={0.7}
                    >
                      <Text>{editEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                    </TouchableOpacity>
                    {showEditEndTimePicker && (
                      <DateTimePicker
                        mode="time"
                        value={editEnd}
                        onChange={(_e, t) => {
                          setShowEditEndTimePicker(false);
                          if (t) {
                            const d = new Date(editEnd);
                            d.setHours(t.getHours(), t.getMinutes(), 0, 0);
                            setEditEnd(d);
                          }
                        }}
                      />
                    )}

                    <Button title="保存" onPress={() => handleSaveEdit(idx)} />
                    <View style={tw`mt-2`} />
                    <Button title="削除" color="#d11" onPress={() => handleDelete(idx)} />
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
