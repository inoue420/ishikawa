// src/screens/phone/ProjectDetailScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import tw from 'twrnc';
import {
  fetchAttendanceRecords,
  fetchMaterialsRecords
} from '../../firestoreService';

export default function ProjectDetailScreen({ route }) {
  const { projectId, date } = route.params;  // date は 'YYYY-MM-DD' 文字列想定
  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState([]);
  const [materials, setMaterials] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // 全件取ってきてフィルタでも OK
      const allAtt = await fetchAttendanceRecords(new Date(date));
      const allMat = await fetchMaterialsRecords();
      
      setAttendance(
        allAtt.filter(r => r.project === projectId)
      );
      setMaterials(
        allMat.filter(m =>
          m.project === projectId &&
          m.timestamp.toDate().toISOString().slice(0,10) === date
        )
      );

      setLoading(false);
    })();
  }, [projectId, date]);

  if (loading) {
    return (
      <View style={tw`flex-1 justify-center items-center`}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={tw`flex-1 bg-gray-100 p-4`}>
      <Text style={tw`text-2xl font-bold mb-4`}>プロジェクト詳細</Text>
      <Text style={tw`text-lg mb-2`}>出退勤: {attendance.length}件</Text>
      {attendance.map((rec,i) => (
        <View key={i} style={tw`mb-2 p-2 bg-white rounded`}>
          <Text>担当者: {rec.users.join(', ')}</Text>
        </View>
      ))}

      <Text style={tw`text-lg mt-4 mb-2`}>資材操作: {materials.length}件</Text>
      {materials.map((m,i) => (
        <View key={i} style={tw`mb-2 p-2 bg-white rounded`}>
          <Text>アイテム: {m.item}</Text>
          <Text>開始: {m.lendStart.toDate().toLocaleTimeString()}</Text>
        </View>
      ))}

      {/* 仕掛件数や請求書数も同様に fetch & 表示 */}
    </ScrollView>
  );
}
