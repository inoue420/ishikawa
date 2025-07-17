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
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import tw from 'twrnc';
import { DateContext } from '../../DateContext';
import { fetchUserByEmail, fetchAttendanceByEmployeeAndDate, upsertAttendance} from '../../firestoreService';


import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function AttendanceScreen({ route }) {

  console.log('[AttendanceScreen] route.params:', route.params);
  console.log('[AttendanceScreen] route.params.userEmail:', route.params?.userEmail);

  const userEmail = route.params?.userEmail ?? 'admin';
  const { date: selectedDate, setDate } = useContext(DateContext);
  const [userName, setUserName] = useState('');
  const [records, setRecords] = useState([]);
  const [recordInputs, setRecordInputs] = useState({});
  const [showDatePicker, setShowDatePicker] = useState(false);

  const dateKey = d => d.toISOString().slice(0, 10);

  // ユーザー名ロード
  useEffect(() => {
    (async () => {
      console.log('[AttendanceScreen] fetching user by email:', userEmail);
      const user = await fetchUserByEmail(userEmail);
      console.log('[AttendanceScreen] fetched user:', user);
      setUserName(user?.name ?? userEmail);
    })();
  }, [userEmail]);

  // 1) レコードロード
  const loadRecords = async () => {
    const list = await fetchAttendanceByEmployeeAndDate(
      userEmail,
      dateKey(selectedDate)
    );
    // 出勤を先、退勤を後でソート
    const ins = list.filter(i => i.type === 'in');
    const outs = list.filter(i => i.type === 'out');
    setRecords([...ins, ...outs]);
  };

  // 日付変更・初回ロード
  useEffect(() => {
    loadRecords();
  }, [selectedDate]);

  // recordInputs 初期化
  useEffect(() => {
    const inputs = {};
    records.forEach(item => {
      const h = item.timestamp.getHours();
      const m = item.timestamp.getMinutes();
      inputs[item.id] = String(h * 100 + m).padStart(4, '0');
    });
    setRecordInputs(inputs);
  }, [records]);

  // Android でピッカーをインパティブに開く
  useEffect(() => {
    if (Platform.OS === 'android' && showDatePicker) {
      DateTimePickerAndroid.open({
        value: selectedDate,
        onChange: onDateChange,
        mode: 'date',
      });
      setShowDatePicker(false);
    }
  }, [showDatePicker]);

      // 出退勤打刻 (既存レコードがあれば更新、なければ作成)
    // 2) upsert 打刻
    const handlePunch = async type => {
      await upsertAttendance(
        userEmail,
        dateKey(selectedDate),
        type,
        new Date()
      );
      loadRecords();
    };

    // 時分編集保存
// 時分編集保存
  const handleSaveTime = async id => {
    const raw = recordInputs[id].replace(/\D/g, '');
    const val = parseInt(raw, 10);
    if (isNaN(val)) return;
    const hh = Math.floor(val / 100);
    const mm = val % 100;
    const dt = new Date(selectedDate);
    dt.setHours(hh, mm, 0, 0);
    await updateDoc(doc(db, 'attendanceRecords', id), {
      timestamp: Timestamp.fromDate(dt),
    });
    loadRecords();
  };

  // 日付ピックハンドラ
  const onDateChange = (_, d) => {
    if (Platform.OS === 'android') return;
    if (d) setDate(d);
  };

  // HH:MM 表示
  const formatHM = val => val.padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:$2');

  return (
    <View style={tw`flex-1 bg-gray-100`}>
      {/* 日付選択 */}
      <View style={tw`flex-row items-center mt-4 p-4 bg-white border-b border-gray-300`}>
        <TouchableOpacity style={tw`flex-1`} onPress={() => setShowDatePicker(true)}>
          <Text style={tw`text-lg text-center`}>{dateKey(selectedDate)}</Text>
        </TouchableOpacity>
      </View>
      {/* iOS: コンポーネントレンダー */}
      {Platform.OS === 'ios' && showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}

      {/* ユーザー名 */}
      <Text style={tw`text-xl text-center my-4`}>{userName}さん</Text>

      {/* ボタン配置 */}
      <View style={tw`flex-row w-full mb-6`}>
        <View style={tw`w-1/2 items-center`}>
          <Button title="出勤" onPress={() => handlePunch('in')} />
        </View>
        <View style={tw`w-1/2 items-center`}>
          <Button title="退勤" onPress={() => handlePunch('out')} />
        </View>
      </View>

      {/* 履歴 */}
      <Text style={tw`text-lg font-medium px-4 mb-2`}>履歴</Text>
      <FlatList
        data={records}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={tw`bg-white px-4 py-2 border-b border-gray-200 flex-row justify-between items-center`}>
            <Text style={tw`w-1/4`}>{item.type === 'in' ? '出勤' : '退勤'}</Text>
            <TextInput
              style={tw`border border-gray-300 p-1 w-16 text-center`}
              keyboardType="number-pad"
              value={formatHM(recordInputs[item.id] || '')}
              onChangeText={text => setRecordInputs({ ...recordInputs, [item.id]: text.replace(/\D/g, '') })}
              onEndEditing={() => handleSaveTime(item.id)}
            />
          </View>
        )}
      />
    </View>
  );
}
