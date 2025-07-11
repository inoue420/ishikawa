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
        const filtered = all.filter(p => {
          const start = p.startDate.toDate ? p.startDate.toDate() : new Date(p.startDate);
          const end = p.endDate.toDate ? p.endDate.toDate() : new Date(p.endDate);
          return selectedDate >= start && selectedDate <= end;
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
          projects.map(proj => (
            <TouchableOpacity
              key={proj.id}
              style={tw`bg-white p-4 rounded-lg shadow mb-4`}
              onPress={() => navigation.navigate('ProjectDetail', { projectId: proj.id, date: dateKey(selectedDate) })}
            >
              <Text style={tw`text-lg font-bold`}>{proj.name}</Text>
              <Text style={tw`text-sm text-gray-500`}>顧客: {proj.clientName}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}
