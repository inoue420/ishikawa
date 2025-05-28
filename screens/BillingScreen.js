// screens/BillingScreen.js

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Button,
  Alert,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import tw from 'twrnc';

const { width } = Dimensions.get('window');
const USER_KEY = '@user_list';
const PROJECT_KEY = '@project_list';
const ATT_KEY = '@attendance_records';
const MAT_REC_KEY = '@materials_records';
const MAT_LIST_KEY = '@materials_list';

export default function BillingScreen() {
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [invoiceLines, setInvoiceLines] = useState([]);
  const [loading, setLoading] = useState(false);

  // Utility: format YYYY-MM-DD
  const formatISO = d => d.toISOString().slice(0,10);
  const formatDate = d => d.toLocaleDateString();
  const diffDays = (d1, d2) => Math.floor((d2 - d1)/(1000*3600*24)) + 1;

  // Aggregate data
  const loadAndCompute = async () => {
    setLoading(true);
    try {
      const users = JSON.parse(await AsyncStorage.getItem(USER_KEY) || '[]');
      const projects = JSON.parse(await AsyncStorage.getItem(PROJECT_KEY) || '[]');
      const atts = JSON.parse(await AsyncStorage.getItem(ATT_KEY) || '[]');
      const mats = JSON.parse(await AsyncStorage.getItem(MAT_REC_KEY) || '[]');
      const matList = JSON.parse(await AsyncStorage.getItem(MAT_LIST_KEY) || '[]');

      // Initialize lines
      const linesMap = {};
      projects.forEach(p => {
        linesMap[p.name] = {
          project: p.name,
          workHours: 0,
          laborCost: 0,
          materialCost: 0,
          total: 0,
        };
      });

      // Attendance: rec.date between startDate/endDate
      atts.forEach(rec => {
        const recDate = new Date(rec.date);
        if (recDate >= startDate && recDate <= endDate) {
          const line = linesMap[rec.project];
          if (!line) return;
          const hours = (rec.users?.length || 0) * 8;
          const cost = (rec.users || []).reduce((sum, user) => {
            const u = users.find(x => x.name === user);
            return sum + (u?.wage || 0) * 8;
          }, 0);
          line.workHours += hours;
          line.laborCost += cost;
        }
      });

      // Materials: rec.lendStart <= endDate & (rec.lendEnd||rec.lendStart) >= startDate
      mats.forEach(rec => {
        const s = new Date(rec.lendStart);
        const e = rec.lendEnd ? new Date(rec.lendEnd) : endDate;
        if (s <= endDate && e >= startDate) {
          const line = linesMap[rec.project];
          if (!line) return;
          const start = s < startDate ? startDate : s;
          const end = e > endDate ? endDate : e;
          const days = diffDays(start, end);
          (rec.items || []).forEach(itemName => {
            const mat = matList.find(m => m.name === itemName);
            const price = mat?.unitPrice || 0;
            line.materialCost += price * days;
          });
        }
      });

      // Compute totals and filter non-zero
      const results = Object.values(linesMap)
        .map(l => ({ ...l, total: l.laborCost + l.materialCost }))
        .filter(l => l.total > 0);

      setInvoiceLines(results);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', 'データ集計に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // Initial compute
  useEffect(() => {
    loadAndCompute();
  }, [startDate, endDate]);

  return (
    <View style={tw`flex-1 flex-row bg-gray-100`}>
      {/* 左カラム: 期間選択 & 集計 */}
      <ScrollView style={{ width: width * 0.6, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-4`}>請求期間設定</Text>
        <Text style={tw`mb-2`}>開始日</Text>
        <TouchableOpacity
          style={tw`bg-white p-4 rounded mb-4 border border-gray-300`}
          onPress={() => setShowStartPicker(true)}
        >
          <Text>{formatISO(startDate)}</Text>
        </TouchableOpacity>
        {showStartPicker && (
          <DateTimePicker
            value={startDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, d) => { setShowStartPicker(false); if (d) setStartDate(d); }}
          />
        )}
        <Text style={tw`mb-2`}>終了日</Text>
        <TouchableOpacity
          style={tw`bg-white p-4 rounded mb-4 border border-gray-300`}
          onPress={() => setShowEndPicker(true)}
        >
          <Text>{formatISO(endDate)}</Text>
        </TouchableOpacity>
        {showEndPicker && (
          <DateTimePicker
            value={endDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, d) => { setShowEndPicker(false); if (d) setEndDate(d); }}
          />
        )}
        <View style={tw`items-center mb-6`}>
          <View style={{ width: '50%' }}>
            <Button
              title={loading ? '集計中...' : '集計'}
              onPress={loadAndCompute}
              disabled={loading}
            />
          </View>
        </View>
      </ScrollView>

      {/* 右カラム: 明細一覧 */}
      <ScrollView style={{ width: width * 0.4, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-4`}>請求明細</Text>
        {invoiceLines.length === 0 ? (
          <Text style={tw`text-center text-gray-500`}>集計データがありません</Text>
        ) : (
          invoiceLines.map((line, idx) => (
            <View key={idx} style={tw`bg-white p-3 rounded mb-2`}>              
              <Text style={tw`font-semibold mb-1`}>{line.project}</Text>
              <Text>労働時間: {line.workHours}h</Text>
              <Text>人件費: ¥{line.laborCost}</Text>
              <Text>資材費: ¥{line.materialCost}</Text>
              <Text style={tw`font-bold mt-1`}>合計: ¥{line.total}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
