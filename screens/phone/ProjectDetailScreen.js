// src/screens/phone/ProjectDetailScreen.js
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import tw from 'twrnc';
import {
  fetchProjectById,
  fetchAllUsers,
  fetchMaterialsRecords,
  fetchMaterialUsages,
  fetchMaterialsList
} from '../../firestoreService';

export default function ProjectDetailScreen({ route }) {
  const { projectId, date } = route.params; // 'YYYY-MM-DD'
  const [loading, setLoading] = useState(true);
  const [project, setProject]     = useState(null);
  const [employees, setEmployees] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [usages, setUsages] = useState([]);
  const [materialsList, setMaterialsList] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const proj = await fetchProjectById(projectId);
        setProject(proj);
        // ── 追加: 従業員一覧取得 ──
        const emps = await fetchAllUsers();
        setEmployees(emps);        
        // 資材記録取得・フィルタ
        const allMat = await fetchMaterialsRecords();
        const filteredMat = allMat.filter(m => {
          if (m.project !== projectId) return false;
          const ts = m.timestamp.toDate();
          const localY = ts.getFullYear();
          const localM = String(ts.getMonth() + 1).padStart(2, '0');
          const localD = String(ts.getDate()).padStart(2, '0');
          const localDate = `${localY}-${localM}-${localD}`;
          return localDate === date;
        });
        setMaterials(filteredMat);

        // 資材使用量取得（全件）
        const rawUsages = await fetchMaterialUsages(projectId);
        setUsages(rawUsages);

        // 資材マスタ取得
        const allMaterialsList = await fetchMaterialsList();
        setMaterialsList(allMaterialsList);
      } catch (err) {
        console.error('❌ ProjectDetail load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, date]);

  // usages と materialsList から「大分類→品名1→アイテム配列」を生成
  const usageGroups = useMemo(() => {
    const groups = {};
    usages.forEach(u => {
      const master = materialsList.find(m => m.id === u.materialId) || {};
      const category = master.category || '未設定';
      const name1    = master.name1   || '未設定';
      const entry = {
        name2 : master.name2  || '',
        partNo: master.partNo || '',
        qty   : u.quantity
      };

      if (!groups[category])        groups[category] = {};
      if (!groups[category][name1]) groups[category][name1] = [];
      groups[category][name1].push(entry);
    });
    return groups;
  }, [usages, materialsList]);

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
      <Text>営業担当:    {employees.find(e => e.id === project?.sales)?.name    || '—'}</Text>
      <Text>現場調査担当: {employees.find(e => e.id === project?.survey)?.name   || '—'}</Text>
      <Text>設計担当:    {employees.find(e => e.id === project?.design)?.name   || '—'}</Text>
      <Text>管理担当:    {employees.find(e => e.id === project?.management)?.name || '—'}</Text>

      {/* 資材使用量グループ表示 */}
      <Text style={tw`mt-6 text-lg`}>
        資材使用量: {usages.length}件
      </Text>
      {usages.length === 0 ? (
        <Text style={tw`mt-2`}>データがありません</Text>
      ) : (
        Object.entries(usageGroups).map(([category, name1Map]) => (
          <View key={category} style={tw`mt-4`}>
            <Text style={tw`text-lg font-bold`}>大分類: {category}</Text>
            {Object.entries(name1Map).map(([name1, items]) => (
              <View key={name1} style={tw`pl-4 mt-2`}>
                <Text style={tw`text-base font-semibold`}>品名1: {name1}</Text>
                {items.map((item, idx) => (
                  <View key={idx} style={tw`pl-4 mt-1`}>
                    <Text>品名2: {item.name2}</Text>
                    <Text>品番: {item.partNo}</Text>
                    <Text>数量: {item.qty}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}
