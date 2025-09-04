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
} from '../../firestoreService';
import { Picker } from '@react-native-picker/picker';

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

export default function ProjectRegisterScreen() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
  const [areaSqm, setAreaSqm] = useState('');         // 平米[m^2]
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
  const [sales, setSales]           = useState(null);
  const [survey, setSurvey]         = useState(null);
  const [design, setDesign]         = useState(null);
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

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

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

    // 数値化
    const payload = {
      name: name.trim(),
      clientName: clientName.trim(),
      startDate, endDate,
      // 役割
      sales, survey, design, management, participants,
      isMilestoneBilling: false,
      // 追加: 金額・面積・新規/既存
      orderAmount: toNumberOrNull(orderAmount),   // 受注金額[円]
      travelCost: toNumberOrNull(travelCost),     // 交通費[円]
      miscExpense: toNumberOrNull(miscExpense),   // 諸経費[円]
      areaSqm: toNumberOrNull(areaSqm),           // 平米[m^2]
      projectType: projectType,                   // 'new' | 'existing' | null
    };

    setLoading(true);
    try {
      await setProject(null, payload);
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
      });
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
            await deleteProject(proj.id);
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
    <View style={tw`flex-1 flex-row bg-gray-100`}>
      {/* 左カラム：新規追加フォーム (60%) */}
      <ScrollView
        ref={leftScrollRef}
        style={{ width: width * 0.6 }}
        contentContainerStyle={{ padding: 16, paddingBottom: leftBottomPadding }}
      >
        <Text style={tw`text-2xl font-bold mb-6`}>プロジェクト追加</Text>

        <Text style={tw`mb-2`}>プロジェクト名</Text>
        <TextInput
          style={tw`border border-gray-300 p-2 mb-4 rounded`}
          value={name}
          onChangeText={setName}
          placeholder="プロジェクト名"
        />

        <Text style={tw`mb-2`}>顧客名</Text>
        <TextInput
          style={tw`border border-gray-300 p-2 mb-4 rounded`}
          value={clientName}
          onChangeText={setClientName}
          placeholder="顧客名"
        />

        {/* 新規/既存 トグル */}
        <Text style={tw`mb-2 font-semibold`}>案件区分</Text>
        <View style={tw`flex-row mb-4`}>
          <TouchableOpacity
            onPress={() => setProjectType('new')}
            style={tw`${projectType === 'new' ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'} border rounded px-4 py-2 mr-2`}
            activeOpacity={0.7}
          >
            <Text><Text>{projectType === 'new' ? '● ' : '○ '}</Text><Text>新規</Text></Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setProjectType('existing')}
            style={tw`${projectType === 'existing' ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'} border rounded px-4 py-2`}
            activeOpacity={0.7}
          >
            <Text><Text>{projectType === 'existing' ? '● ' : '○ '}</Text><Text>既存</Text></Text>
          </TouchableOpacity>
        </View>

        {/* 金額・面積 */}
        <Text style={tw`mb-2`}>受注金額 <Text>[円]</Text></Text>
        <TextInput
          style={tw`border border-gray-300 p-2 mb-3 rounded`}
          value={orderAmount}
          onChangeText={(v) => setOrderAmount(formatThousandsInput(v))}
          placeholder="例: 1200000"
          keyboardType="numeric"
        />
        <Text style={tw`mb-2`}>交通費 <Text>[円]</Text></Text>
        <TextInput
          style={tw`border border-gray-300 p-2 mb-3 rounded`}
          value={travelCost}
          onChangeText={(v) => setTravelCost(formatThousandsInput(v))}
          placeholder="例: 30000"
          keyboardType="numeric"
        />
        <Text style={tw`mb-2`}>諸経費 <Text>[円]</Text></Text>
        <TextInput
          style={tw`border border-gray-300 p-2 mb-3 rounded`}
          value={miscExpense}
          onChangeText={(v) => setMiscExpense(formatThousandsInput(v))}
          placeholder="例: 50000"
          keyboardType="numeric"
        />
        <Text style={tw`mb-2`}>平米 <Text>[m²]</Text></Text>
        <TextInput
          style={tw`border border-gray-300 p-2 mb-6 rounded`}
          value={areaSqm}
          onChangeText={setAreaSqm}
          placeholder="例: 85"
          keyboardType="numeric"
        />

        <Text style={tw`mb-2`}>営業担当</Text>
        <Picker
          selectedValue={sales}
          onValueChange={setSales}
          style={tw`border border-gray-300 p-2 mb-4 rounded`}
        >
          <Picker.Item label="選択してください" value={null} />
          {employees.map(emp => (
            <Picker.Item key={emp.id} label={emp.name} value={emp.id} />
          ))}
        </Picker>

        <Text style={tw`mb-2`}>現場調査担当</Text>
        <Picker
          selectedValue={survey}
          onValueChange={setSurvey}
          style={tw`border border-gray-300 p-2 mb-4 rounded`}
        >
          <Picker.Item label="選択してください" value={null} />
          {employees.map(emp => (
            <Picker.Item key={emp.id} label={emp.name} value={emp.id} />
          ))}
        </Picker>

        <Text style={tw`mb-2`}>設計担当</Text>
        <Picker
          selectedValue={design}
          onValueChange={setDesign}
          style={tw`border border-gray-300 p-2 mb-4 rounded`}
        >
          <Picker.Item label="選択してください" value={null} />
          {employees.map(emp => (
            <Picker.Item key={emp.id} label={emp.name} value={emp.id} />
          ))}
        </Picker>

        <Text style={tw`mb-2`}>管理担当</Text>
        <Picker
          selectedValue={management}
          onValueChange={setManagement}
          style={tw`border border-gray-300 p-2 mb-6 rounded`}
        >
          <Picker.Item label="選択してください" value={null} />
          {employees.map(emp => (
            <Picker.Item key={emp.id} label={emp.name} value={emp.id} />
          ))}
        </Picker>

        {/* 参加従業員（複数選択） */}
        <Text style={tw`mb-2 font-semibold`}>参加従業員</Text>
        <Text style={tw`text-gray-600 mb-2`}>選択中: {participants.length}名</Text>
        <View style={tw`mb-6`}>
          {employees.map((emp) => {
            const checked = participants.includes(emp.id);
            return (
              <TouchableOpacity
                key={emp.id}
                onPress={() => toggleParticipant(emp.id)}
                style={tw`bg-white border border-gray-300 rounded p-2 mb-2`}
                activeOpacity={0.7}
              >
                <Text style={tw`text-base`}>
                  <Text>{checked ? '☑ ' : '☐ '}</Text><Text>{emp.name}</Text>
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={tw`mb-2 font-semibold`}>開始予定日</Text>
        <TouchableOpacity
          style={tw`bg-white p-4 rounded mb-4 border border-gray-300`}
          onPress={() => setShowStartPicker(true)}
          activeOpacity={0.7}
        >
          <Text>{startDate.toLocaleDateString()}</Text>
        </TouchableOpacity>
        {showStartPicker && (
          <DateTimePicker
            value={startDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, d) => {
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
        <TouchableOpacity onPress={() => setShowStartTimePicker(true)} style={tw`border p-2 mb-2`} activeOpacity={0.7}>
          <Text>{startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </TouchableOpacity>
        {showStartTimePicker && (
          <DateTimePicker
            value={startDate}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, t) => {
              setShowStartTimePicker(false);
              if (t) {
                const d = new Date(startDate);
                d.setHours(t.getHours(), t.getMinutes(), 0, 0);
                setStartDate(d);
              }
            }}
          />
        )}

        <Text style={tw`mb-2 font-semibold`}>終了予定日</Text>
        <TouchableOpacity
          style={tw`bg-white p-4 rounded mb-6 border border-gray-300`}
          onPress={() => setShowEndPicker(true)}
          activeOpacity={0.7}
        >
          <Text>{endDate.toLocaleDateString()}</Text>
        </TouchableOpacity>
        {showEndPicker && (
          <DateTimePicker
            value={endDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, d) => {
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
        <TouchableOpacity onPress={() => setShowEndTimePicker(true)} style={tw`border p-2 mb-2`} activeOpacity={0.7}>
          <Text>{endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </TouchableOpacity>
        {showEndTimePicker && (
          <DateTimePicker
            value={endDate}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, t) => {
              setShowEndTimePicker(false);
              if (t) {
                const d = new Date(endDate);
                d.setHours(t.getHours(), t.getMinutes(), 0, 0);
                setEndDate(d);
              }
            }}
          />
        )}

        <View style={tw`items-center mb-6`}>
          <View style={{ width: '50%' }}>
            <Button title={loading ? '追加中...' : '追加'} onPress={handleAdd} disabled={loading} />
          </View>
        </View>
      </ScrollView>

      {/* 右カラム：プロジェクト一覧 */}
      <ScrollView
        style={{ width: width * 0.4, padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={tw`text-2xl font-bold mb-4`}>登録プロジェクト一覧</Text>
        {projects.length === 0 ? (
          <Text style={tw`text-center text-gray-500`}>プロジェクトがありません</Text>
        ) : (
          projects.map((proj, idx) => {
            const sDate = new Date(proj.startDate?.toDate ? proj.startDate.toDate() : proj.startDate);
            const eDate = new Date(proj.endDate?.toDate ? proj.endDate.toDate() : proj.endDate);
            return (
              <View key={proj.id} style={tw`bg-white p-3 rounded mb-2`}>
                <TouchableOpacity
                  onPress={() => {
                    setEditingIndex(idx);
                    setEditClient(proj.clientName);
                    setEditStart(sDate);
                    setEditEnd(eDate);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={tw`font-bold`}>{proj.name}</Text>
                  <Text>顧客: {proj.clientName}</Text>
                  <Text>開始: {sDate.toLocaleDateString()}</Text>
                  <Text>終了: {eDate.toLocaleDateString()}</Text>
                  {/* 参考表示（編集は ProjectDetail 側で対応予定） */}
                  <Text>区分: {proj.projectType === 'new' ? '新規' : proj.projectType === 'existing' ? '既存' : '-'}</Text>
                  <Text>受注金額: {proj.orderAmount ?? '-'}<Text> 円</Text></Text>
                  <Text>交通費: {proj.travelCost ?? '-'}<Text> 円</Text></Text>
                  <Text>諸経費: {proj.miscExpense ?? '-'}<Text> 円</Text></Text>
                  <Text>平米: {proj.areaSqm ?? '-'}<Text> m^2</Text></Text>
                </TouchableOpacity>

                {editingIndex === idx && (
                  <View style={tw`mt-2 bg-gray-50 p-2 rounded`}>
                    <Text style={tw`mb-2`}>顧客名</Text>
                    <TextInput
                      style={tw`border border-gray-300 p-2 mb-2 rounded`}
                      value={editClient}
                      onChangeText={setEditClient}
                    />

                    <Text style={tw`mb-2`}>開始予定日</Text>
                    <TouchableOpacity
                      style={tw`bg-white p-2 rounded mb-2 border border-gray-300`}
                      onPress={() => setShowEditStart(true)}
                      activeOpacity={0.7}
                    >
                      <Text>{editStart.toLocaleDateString()}</Text>
                    </TouchableOpacity>
                    {showEditStart && (
                      <DateTimePicker
                        value={editStart}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_, d) => { setShowEditStart(false); if (d) setEditStart(d); }}
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
                        value={editStart}
                        mode="time"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_, t) => {
                          setShowEditStartTimePicker(false);
                          if (t) {
                            const d = new Date(editStart);
                            d.setHours(t.getHours(), t.getMinutes(), 0, 0);
                            setEditStart(d);
                          }
                        }}
                      />
                    )}

                    <Text style={tw`mb-2`}>終了予定日</Text>
                    <TouchableOpacity
                      style={tw`bg-white p-2 rounded mb-4 border border-gray-300`}
                      onPress={() => setShowEditEnd(true)}
                      activeOpacity={0.7}
                    >
                      <Text>{editEnd.toLocaleDateString()}</Text>
                    </TouchableOpacity>
                    {showEditEnd && (
                      <DateTimePicker
                        value={editEnd}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_, d) => { setShowEditEnd(false); if (d) setEditEnd(d); }}
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
                        value={editEnd}
                        mode="time"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_, t) => {
                          setShowEditEndTimePicker(false);
                          if (t) {
                            const d = new Date(editEnd);
                            d.setHours(t.getHours(), t.getMinutes(), 0, 0);
                            setEditEnd(d);
                          }
                        }}
                      />
                    )}

                    <View style={tw`flex-row justify-between`}>
                      <View style={{ width: '45%' }}>
                        <Button title="保存" onPress={() => handleSaveEdit(idx)} />
                      </View>
                      <View style={{ width: '45%' }}>
                        <Button title="削除" color="red" onPress={() => handleDelete(idx)} />
                      </View>
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
