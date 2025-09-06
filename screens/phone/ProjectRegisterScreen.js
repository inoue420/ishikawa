import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
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
  resolveEmployeeForAuth,
  findEmployeeByIdOrEmail,
} from '../../firestoreService';
import { Picker } from '@react-native-picker/picker';

const { width } = Dimensions.get('window');

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

// --- サブボタン ---
function OutlineButton({ title, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={tw`rounded px-4 py-2 items-center border border-gray-300 bg-white`}
    >
      <Text style={tw`text-gray-800`}>{title}</Text>
    </TouchableOpacity>
  );
}

// --- 安全な日付ヘルパー群 ---
const toSafeDate = (v) => {
  if (!v) return null;
  const d = v?.toDate ? v.toDate() : new Date(v);
  return (d instanceof Date && !isNaN(d)) ? d : null;
};
const fmtDate = (d) => d ? d.toLocaleDateString() : '-';
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
const EMPLOYEE_HOURLY = 3000;
const EXTERNAL_HOURLY  = 3500;
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

  // 編集系
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editClient, setEditClient] = useState('');
  const [editStart, setEditStart] = useState(new Date());
  const [editEnd, setEditEnd] = useState(new Date());
  const [showEditStart, setShowEditStart] = useState(false);
  const [showEditEnd, setShowEditEnd] = useState(false);
  const [showEditStartTimePicker, setShowEditStartTimePicker] = useState(false);
  const [showEditEndTimePicker, setShowEditEndTimePicker] = useState(false);

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

  // ─────────────────────────────────────────────
  // 時刻ピッカー：ボックスタップですぐ選択 → 選択と同時に即閉じる
  // iOS: spinner, Android: clock（24h）
  // ─────────────────────────────────────────────
  const timePickerProps = {
    mode: 'time',
    display: Platform.OS === 'ios' ? 'spinner' : 'clock',
    is24Hour: true,
  };

  const handleAdd = async () => {
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
      await setProject(
        proj.id,
        {
          name: proj.name,
          clientName: editClient.trim(),
          startDate: editStart,
          endDate: editEnd,
          isMilestoneBilling: proj.isMilestoneBilling,
        },
        { by: me?.id ?? null, byName: me?.name ?? null }
      );

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

        {/* 各担当（先頭にプレースホルダー） */}
        <Text>営業担当</Text>
        <View style={tw`border rounded mb-2 overflow-hidden`}>
          <Picker selectedValue={sales} onValueChange={setSales}>
            <Picker.Item label="選択してください" value={PH} color="#9ca3af" />
            {employees.map(emp => (
              <Picker.Item key={emp.id} label={emp.name} value={emp.id} />
            ))}
          </Picker>
        </View>

        <Text>現場調査担当</Text>
        <View style={tw`border rounded mb-2 overflow-hidden`}>
          <Picker selectedValue={survey} onValueChange={setSurvey}>
            <Picker.Item label="選択してください" value={PH} color="#9ca3af" />
            {employees.map(emp => (
              <Picker.Item key={emp.id} label={emp.name} value={emp.id} />
            ))}
          </Picker>
        </View>

        <Text>設計担当</Text>
        <View style={tw`border rounded mb-2 overflow-hidden`}>
          <Picker selectedValue={design} onValueChange={setDesign}>
            <Picker.Item label="選択してください" value={PH} color="#9ca3af" />
            {employees.map(emp => (
              <Picker.Item key={emp.id} label={emp.name} value={emp.id} />
            ))}
          </Picker>
        </View>

        <Text>管理担当</Text>
        <View style={tw`border rounded mb-2 overflow-hidden`}>
          <Picker selectedValue={management} onValueChange={setManagement}>
            <Picker.Item label="選択してください" value={PH} color="#9ca3af" />
            {employees.map(emp => (
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

        <PrimaryButton title={loading ? '処理中...' : '追加'} onPress={handleAdd} disabled={loading} />
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
                    setEditStart(sDate ?? new Date());
                    setEditEnd(eDate ?? (sDate ?? new Date()));
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={tw`font-bold`}>{proj.name}</Text>
                  <Text>顧客: {proj.clientName}</Text>
                  <Text>開始: {fmtDate(sDate)}</Text>
                  <Text>終了: {fmtDate(eDate)}</Text>
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
                      style={tw`border p-2 mb-2 rounded`}
                    />

                    <Text>開始予定日</Text>
                    <TouchableOpacity
                      onPress={() => setShowEditStart(true)}
                      activeOpacity={0.7}
                      style={tw`border p-2 mb-2 rounded`}
                    >
                      <Text>{editStart.toLocaleDateString()}</Text>
                    </TouchableOpacity>
                    {showEditStart && (
                      <DateTimePicker
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
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
                      style={tw`border p-2 mb-2 rounded`}
                      activeOpacity={0.7}
                    >
                      <Text>{fmtTime(editStart)}</Text>
                    </TouchableOpacity>
                    {showEditStartTimePicker && (
                      <DateTimePicker
                        {...timePickerProps}
                        value={editStart}
                        onChange={(e, t) => {
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
                      style={tw`border p-2 mb-2 rounded`}
                    >
                      <Text>{editEnd.toLocaleDateString()}</Text>
                    </TouchableOpacity>
                    {showEditEnd && (
                      <DateTimePicker
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
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
                      style={tw`border p-2 mb-2 rounded`}
                      activeOpacity={0.7}
                    >
                      <Text>{fmtTime(editEnd)}</Text>
                    </TouchableOpacity>
                    {showEditEndTimePicker && (
                      <DateTimePicker
                        {...timePickerProps}
                        value={editEnd}
                        onChange={(e, t) => {
                          setShowEditEndTimePicker(false);
                          if (t) {
                            const d = new Date(editEnd);
                            d.setHours(t.getHours(), t.getMinutes(), 0, 0);
                            setEditEnd(d);
                          }
                        }}
                      />
                    )}

                    <View style={tw`flex-row mt-2`}>
                      <View style={tw`mr-2`}>
                        <PrimaryButton title="保存" onPress={() => handleSaveEdit(idx)} />
                      </View>
                      <OutlineButton title="削除" onPress={() => handleDelete(idx)} />
                    </View>
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
