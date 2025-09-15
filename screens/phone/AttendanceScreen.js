// screens/phone/AttendanceScreen.js
import React, { useEffect, useState, useContext } from 'react';
import {
  View,
  Text,
  Button,
  FlatList,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import tw from 'twrnc';
import { fetchUserByEmail, fetchAttendanceByEmployeeAndDate, requestPunch } from '../../firestoreService';

import {
  updateDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';
// 追加：簡易チェックUI（☑/☐）
const Check = React.memo(function Check({ label, checked, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={tw`mr-4 mb-2 flex-row items-center`}>
      <Text style={tw`text-xl mr-1`}>{checked ? '☑' : '☐'}</Text>
      <Text>{label}</Text>
    </TouchableOpacity>
  );
});

export default function AttendanceScreen({ route }) {
  console.log('[AttendanceScreen] route.params:', route.params);
  console.log('[AttendanceScreen] route.params.userEmail:', route.params?.userEmail);

  const userEmail = route.params?.userEmail ?? 'admin';
  // この画面は“初期表示は常に本日”にする（DateContext とは切り離す）
  const [currentDate, setCurrentDate] = useState(() => new Date()); // ← 初期値 = 本日
  // ※もし「常に本日に固定（ピッカー変更も無効）」にしたい場合は、
  //   下の useEffect を有効化してください（画面表示のたびに今日へ強制リセット）
  // useEffect(() => { setCurrentDate(new Date()); }, []);

  // ▼ 追加: 区分・所属も保持
  const [userName, setUserName] = useState('');
  const [division, setDivision] = useState('');
  const [affiliation, setAffiliation] = useState('');

  const [records, setRecords] = useState([]);
  const [recordInputs, setRecordInputs] = useState({});
  const [showDatePicker, setShowDatePicker] = useState(false);
    // ▼ 追加: アルコールチェック状態
  const [deviceUsed, setDeviceUsed] = useState(null);     // true=使用 / false=不使用
  const [intoxicated, setIntoxicated] = useState(null);   // true=あり  / false=なし
  const acCompleted = deviceUsed !== null && intoxicated !== null;

  // 端末のローカルタイムゾーン(JST)で日付キーを生成
  const dateKey = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // ユーザー名/区分/所属ロード
  useEffect(() => {
    (async () => {
      console.log('[AttendanceScreen] fetching user by email:', userEmail);
      const user = await fetchUserByEmail(userEmail);
      console.log('[AttendanceScreen] fetched user:', user);
      setUserName(user?.name ?? userEmail);
      setDivision(user?.division ?? '');
      setAffiliation(user?.affiliation ?? '');
    })();
  }, [userEmail]);

  // 1) レコードロード
  const loadRecords = async () => {
    const list = await fetchAttendanceByEmployeeAndDate(
      userEmail,
      dateKey(currentDate)
    );
    // 出勤を先、退勤を後でソート
    const ins = list.filter(i => i.type === 'in');
    const outs = list.filter(i => i.type === 'out');
    setRecords([...ins, ...outs]);
  };

  // 日付変更・初回ロード
  useEffect(() => {
    loadRecords();
  }, [currentDate]);

  // recordInputs 初期化
  useEffect(() => {
    const inputs = {};
    records.forEach(item => {
      const t = item?.timestamp?.toDate ? item.timestamp.toDate() : new Date(item.timestamp);
      const h = t.getHours();
      const m = t.getMinutes();
      inputs[item.id] = String(h * 100 + m).padStart(4, '0');
    });
    setRecordInputs(inputs);
  }, [records]);

  // Android でピッカーをインパティブに開く
  useEffect(() => {
    if (Platform.OS === 'android' && showDatePicker) {
      DateTimePickerAndroid.open({
        value: currentDate,
        onChange: onDateChange,
        mode: 'date',
      });
      setShowDatePicker(false);
    }
  }, [showDatePicker]);

  // 出退勤打刻 (既存レコードがあれば更新、なければ作成)
    const handlePunch = async (type) => {
      if (!acCompleted) return; // 二重防止（UIでも無効化）
      await requestPunch({
        employeeId: userEmail,
        dateStr: dateKey(currentDate),
        type,
        time: new Date(),
        alcoholCheck: { deviceUsed, intoxicated },
      });
      loadRecords();
    };

  // 時分編集保存
  const handleSaveTime = async id => {
    const raw = (recordInputs[id] || '').replace(/\D/g, '');
    const val = parseInt(raw, 10);
    if (isNaN(val)) return;
    const hh = Math.floor(val / 100);
    const mm = val % 100;
    const dt = new Date(currentDate);
    dt.setHours(hh, mm, 0, 0);
    await updateDoc(doc(db, 'attendanceRecords', id), {
      timestamp: Timestamp.fromDate(dt),
    });
    loadRecords();
  };

  // 日付ピックハンドラ
  const onDateChange = (_, d) => {
    if (!d) return;
    setCurrentDate(d);
  };

  // HH:MM 表示
  const formatHM = val => (val || '').padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:$2');

// ListHeaderComponent 用（アルコールチェック + 見出し）
const Header = React.memo(function Header() {
  return (
    <View>
      <View style={tw`mx-4 mb-3 p-3 border border-gray-300 rounded-xl bg-white`}>
        <Text style={tw`font-bold text-base mb-3`}>アルコールチェック</Text>

        <Text style={tw`mb-1`}>検知器</Text>
        <View style={tw`flex-row mb-2`}>
          <Check label="使用"   checked={deviceUsed === true}  onPress={() => setDeviceUsed(true)} />
          <Check label="不使用" checked={deviceUsed === false} onPress={() => setDeviceUsed(false)} />
        </View>

        <Text style={tw`mb-1`}>酒気帯び</Text>
        <View style={tw`flex-row`}>
          <Check label="なし" checked={intoxicated === false} onPress={() => setIntoxicated(false)} />
          <Check label="あり" checked={intoxicated === true}  onPress={() => setIntoxicated(true)} />
        </View>

        {/* ← 動的カラーは style 配列で与える */}
        <Text style={[tw`mt-2`, acCompleted ? tw`text-green-600` : tw`text-red-600`]}>
          {acCompleted ? 'アルコールチェック：保存予定（打刻時に送信）' : 'アルコールチェック未完了'}
        </Text>
      </View>

      <View style={tw`px-4 mb-2`}>
        <Text style={tw`text-lg font-medium`}>履歴</Text>
      </View>
    </View>
  );
});

// ListEmptyComponent 用
const Empty = React.memo(function Empty() {
  return (
    <View style={tw`py-8`}>
      <Text style={tw`text-center text-gray-500`}>履歴はありません</Text>
    </View>
  );
});

return (
  <SafeAreaView edges={['top']} style={tw`flex-1 bg-gray-100`}>
    <View>
      <View style={tw`flex-row items-center p-4 bg-white border-b border-gray-300`}>
        <TouchableOpacity style={tw`flex-1`} onPress={() => setShowDatePicker(true)}>
          <Text style={tw`text-lg text-center`}>{dateKey(currentDate)}</Text>
        </TouchableOpacity>
      </View>
      {Platform.OS === 'ios' && showDatePicker ? (
        <DateTimePicker
          value={currentDate}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      ) : null}

      {/* ユーザー情報行 */}
      <View style={tw`flex-row items-stretch mx-4 my-4`}>
        <View style={tw`w-2/5 mr-3`}>
          <View style={tw`mb-2 border border-gray-300 rounded bg-white`}>
            <Text style={tw`text-xs text-gray-500 px-2 pt-1`}>区分</Text>
            <Text style={tw`text-base px-2 py-2`}>{division || '-'}</Text>
          </View>
          <View style={tw`border border-gray-300 rounded bg-white`}>
            <Text style={tw`text-xs text-gray-500 px-2 pt-1`}>会社名</Text>
            <Text style={tw`text-base px-2 py-2`}>{affiliation || '-'}</Text>
          </View>
        </View>
        <View style={tw`flex-1 border border-gray-300 rounded bg-white justify-center`}>
          <Text style={tw`text-xl font-semibold px-3 py-4`} numberOfLines={1} ellipsizeMode="tail">
            {userName}
          </Text>
        </View>
      </View>

      {/* ボタン配置（アルコールチェック完了まで無効化） */}
      <View style={tw`flex-row w-full mb-3`}>
        <View style={tw`w-1/3 items-center`}>
          <Button title="出勤" onPress={() => handlePunch('in')} disabled={!acCompleted} />
        </View>
        <View style={tw`w-1/3 items-center`}>
          <Button title="早退" onPress={() => handlePunch('out')} color="orange" disabled={!acCompleted} />
        </View>
        <View style={tw`w-1/3 items-center`}>
          <Button title="退勤" onPress={() => handlePunch('out')} disabled={!acCompleted} />
        </View>
      </View>
    </View>

    {/* スクロールエリア（アルコールチェック + 履歴） */}
    <FlatList
      style={tw`flex-1`}
      data={records}
      keyExtractor={(item) => String(item.id)}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={true}
      contentContainerStyle={tw`pb-10`}
      ListHeaderComponent={<Header />}
      renderItem={({ item }) => (
        <View style={tw`bg-white px-4 py-2 border-b border-gray-200 flex-row justify-between items-center`}>
          <View style={tw`w-1/3`}>
            <Text>{item.type === 'in' ? '出勤' : '退勤'}</Text>
            {item.status === 'pending'  && <Text style={tw`text-xs text-gray-500`}>（確認中）</Text>}
            {item.status === 'rejected' && <Text style={tw`text-xs text-red-500`}>（却下）</Text>}
            {item.status === 'approved' && <Text style={tw`text-xs text-green-600`}>（確定）</Text>}
            {item.type === 'in' && item.alcoholCheck?.completed && (
              <Text style={tw`text-xs text-gray-600 mt-1`}>
                アルコール: 検知器{item.alcoholCheck.deviceUsed ? '使用' : '不使用'} / 酒気帯び{item.alcoholCheck.intoxicated ? 'あり' : 'なし'}
              </Text>
            )}
          </View>
          <TextInput
            style={tw`border border-gray-300 p-1 w-16 text-center`}
            keyboardType="number-pad"
            value={formatHM(recordInputs[item.id] || '')}
            onChangeText={text => {
              const onlyNum = text.replace(/\D/g, '');
              setRecordInputs(prev => ({ ...prev, [item.id]: onlyNum }));
            }}
            onEndEditing={() => {
              if (item.status !== 'approved') {
                handleSaveTime(item.id);
              }
            }}
            editable={item.status !== 'approved'}
          />
        </View>
      )}
      ListEmptyComponent={<Empty />}
    />
   </SafeAreaView>
);
}