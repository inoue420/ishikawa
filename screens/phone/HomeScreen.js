import React, { useEffect, useState, useContext } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import tw from 'twrnc';
import { DateContext } from '../../DateContext';
import { fetchProjects } from '../../firestoreService';

export default function HomeScreen({ navigation }) {
  const { date: selectedDate, setDate } = useContext(DateContext);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [showPicker, setShowPicker] = useState(false);

  // YYYY-MM-DD 形式の文字列を返す
  const dateKey = d => d.toISOString().slice(0, 10);

  // 日付変更ハンドラ
  const onDateChange = (_, d) => {
    setShowPicker(false);
    if (d) setDate(d);
  };

  // プロジェクト取得・フィルタ
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const all = await fetchProjects();
      //――――― 日付のみで比較するため、00:00 と 23:59:59 で範囲を作る ―――――
      const selStart = new Date(selectedDate);
      selStart.setHours(0, 0, 0, 0);
      const selEnd = new Date(selectedDate);
      selEnd.setHours(23, 59, 59, 999);

      const filtered = all.filter(p => {
        const start = p.startDate.toDate
          ? p.startDate.toDate()
          : new Date(p.startDate);
        const end = p.endDate.toDate
          ? p.endDate.toDate()
          : new Date(p.endDate);
        // プロジェクト期間が「選択日の 00:00～23:59」のどこかと重なるものを抽出
        return start <= selEnd && end >= selStart;
      });
  
      //――――――（必要ならソートはここでも）――――――
      filtered.sort((a, b) => {
        const dA = a.startDate.toDate?.() ?? new Date(a.startDate);
        const dB = b.startDate.toDate?.() ?? new Date(b.startDate);
        return dA.getTime() - dB.getTime();
      });
            setProjects(filtered);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedDate]);

  if (loading) {
    return (
      <View style={tw`flex-1 justify-center items-center`}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={tw`flex-1 bg-gray-100`}>
      {/* 日付選択 */}
      <View style={tw`flex-row items-center mt-4 p-4 bg-white border-b border-gray-300`}>
        <TouchableOpacity style={tw`flex-1`} onPress={() => setShowPicker(true)}>
          <Text style={tw`text-lg`}>{dateKey(selectedDate)}</Text>
        </TouchableOpacity>
      </View>
      {showPicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}

      <ScrollView contentContainerStyle={tw`p-4`}>        
        {projects.length === 0 ? (
          <Text style={tw`text-center text-gray-500`}>本日のプロジェクトはありません</Text>
        ) : (
          projects.map(proj => {
          // Firestore Timestamp か JS Date か両対応で Date オブジェクト化
          const start = proj.startDate.toDate
            ? proj.startDate.toDate()
            : new Date(proj.startDate);
          const end   = proj.endDate.toDate
            ? proj.endDate.toDate()
            : new Date(proj.endDate);
          // 分までの時刻文字列を生成
          const startTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const endTime   = end  .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return (
              <TouchableOpacity
                key={proj.id}
                style={tw`bg-white py-2 px-4 rounded-lg shadow mb-2`}
                onPress={() => navigation.navigate('ProjectDetail', { projectId: proj.id, date: dateKey(selectedDate) })}
              >
                <Text style={tw`text-lg font-bold`}>{proj.name}</Text>
              <View style={tw`flex-row justify-between items-center`}>
                <Text style={tw`text-sm text-gray-500`}>顧客: {proj.clientName}</Text>
                <Text style={tw`text-sm text-gray-500`}>{startTime} ～ {endTime}</Text>
              </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
