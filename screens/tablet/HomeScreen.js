// screens/HomeScreen.js
import React, { useEffect, useState, useContext } from 'react';
import {
  View,
  Text,
  ScrollView,
  Button,
  ActivityIndicator,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import tw from 'twrnc';
import { DateContext } from '../../DateContext';

const { width } = Dimensions.get('window');

export default function HomeScreen({ navigation }) {
  const { date: selectedDate, setDate } = useContext(DateContext);
  const [counts, setCounts] = useState({ attendance: 0, materials: 0, wip: 0, invoices: 0 });
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [materialRecords, setMaterialRecords] = useState([]);
  const [confirmedDates, setConfirmedDates] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(true);

  const dateKey = d => d.toISOString().slice(0, 10);

  const loadData = async () => {
    try {
      const att = await AsyncStorage.getItem('@attendance_records');
      const allAtt = att ? JSON.parse(att) : [];
      setAttendanceRecords(allAtt);

      const mat = await AsyncStorage.getItem('@materials_records');
      const allMat = mat ? JSON.parse(mat) : [];
      setMaterialRecords(allMat);

      const key = dateKey(selectedDate);
      setCounts({
        attendance: allAtt.filter(r => r.date === key).length,
        materials: allMat.filter(m => m.timestamp.slice(0,10) === key).length,
        wip: 0,
        invoices: 0,
      });

      const cd = await AsyncStorage.getItem('@confirmed_dates');
      setConfirmedDates(cd ? JSON.parse(cd) : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [selectedDate]);
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadData);
    return unsubscribe;
  }, [navigation, selectedDate]);

  const onDateChange = (_, d) => {
    setShowPicker(false);
    if (d) setDate(d);
  };

  const toggleConfirm = async () => {
    const key = dateKey(selectedDate);
    const updated = confirmedDates.includes(key)
      ? confirmedDates.filter(d => d !== key)
      : [...confirmedDates, key];
    setConfirmedDates(updated);
    await AsyncStorage.setItem('@confirmed_dates', JSON.stringify(updated));
  };

  if (loading) {
    return (
      <View style={tw`flex-1 justify-center items-center`}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={tw`flex-1 bg-gray-100`}>
      {/* 日付ピッカー・確定 */}
      <View style={tw`flex-row items-center mt-4 p-4 bg-white border-b border-gray-300`}>
        {showPicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="default"
            onChange={onDateChange}
          />
        )}
        <TouchableOpacity style={tw`flex-1`} onPress={() => setShowPicker(true)}>
          <Text style={tw`text-lg`}>{dateKey(selectedDate)}</Text>
        </TouchableOpacity>
        <View style={tw`ml-2 w-1/2`}>
          <Button
            title={confirmedDates.includes(dateKey(selectedDate)) ? '解除' : '確定'}
            onPress={toggleConfirm}
          />
        </View>
      </View>
      <View style={tw`flex-1 flex-row`}>
        {/* 左: ダッシュボード */}
        <ScrollView style={{ width: width * 0.6, padding: 16 }}>
          <Text style={tw`text-2xl font-bold mb-4`}>ダッシュボード</Text>
          {['attendance','materials','wip','invoices'].map((key,i)=>(
            <View key={i} style={tw`bg-white p-4 rounded-lg shadow mb-4`}>
              <Text style={tw`text-base text-gray-500 mb-2`}>{
                key==='attendance'?'出退勤数':key==='materials'?'資材操作数':key==='wip'?'仕掛件数':'請求書数'
              }</Text>
              <Text style={tw`text-2xl font-bold mb-2`}>{counts[key]}件</Text>
              <View style={tw`w-1/2`}>
                <Button title="詳細" onPress={() => navigation.navigate(
                  key==='attendance'?'Attendance':key==='materials'?'Materials':key==='wip'?'WIP':'Billing'
                )} />
              </View>
            </View>
          ))}
        </ScrollView>
        {/* 右: 本日の状況 */}
        <ScrollView style={{ width: width * 0.4, padding: 16 }}>
          <Text style={tw`text-2xl font-bold mb-4`}>本日のプロジェクト状況</Text>
          {attendanceRecords.map((rec,i)=>(
            <View key={i} style={tw`border border-gray-300 rounded mb-4 p-3`}>
              <Text style={tw`text-lg font-semibold mb-2`}>{rec.project}</Text>
              {rec.users.map((u,j)=><Text key={j} style={tw`ml-2 mb-1`}>{u}</Text>)}
              <Text style={tw`font-medium mt-2 mb-1`}>資材:</Text>
              {materialRecords.filter(m=>m.timestamp.slice(0,10)===dateKey(selectedDate)&&m.project===rec.project)
                .map((m,j)=><Text key={j} style={tw`ml-2 mb-1`}>{m.item}</Text>)}
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}