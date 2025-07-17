// src/screens/phone/ProjectDetailScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import tw from 'twrnc';
import {  fetchMaterialsRecords } from '../../firestoreService';

export default function ProjectDetailScreen({ route }) {
  const { projectId, date } = route.params;  // date は 'YYYY-MM-DD' 文字列想定
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // マテリアルレコードだけ取得・フィルタ
      const allMat = await fetchMaterialsRecords();
      const filtered = allMat.filter(
        m =>
          m.project === projectId &&
          m.timestamp.toDate().toISOString().slice(0, 10) === date
      );
      setMaterials(filtered);

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
    <ScrollView contentContainerStyle={tw`p-4`}>
      <Text style={tw`text-xl font-bold`}>プロジェクト詳細</Text>

      {/* 資材操作 */}
      <Text style={tw`mt-4 text-lg`}>資材操作: {materials.length}件</Text>
      {materials.length === 0 ? (
        <Text style={tw`mt-2`}>データがありません</Text>
      ) : (
        materials.map((m, idx) => (
          <View key={idx} style={tw`mt-2 p-3 bg-white rounded-lg shadow`}>
            {Array.isArray(m.items) ? (
              m.items.map((item, i) => (
                <Text key={i}>
                  品目: {item.name1 || item.partNo} / 数量: {item.qty}
                </Text>
              ))
            ) : (
              <Text>不正なデータ形式です</Text>
            )}
            <Text style={tw`mt-2`}>
              開始: {m.lendStart?.toDate()?.toLocaleTimeString()}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
 }
