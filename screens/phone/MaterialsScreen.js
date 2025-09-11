// screens/phone/MaterialsScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';
import {
  fetchProjects,
  fetchMaterialsList,
  fetchMaterialUsages,
  addMaterialUsage,
  updateMaterialUsage,
  deleteMaterialUsage,
} from '../../firestoreService';

export default function MaterialsScreen() {
  const [projects, setProjects] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [qtyMap, setQtyMap] = useState({});     // { partNo: '12', ... }
  const [usageMap, setUsageMap] = useState({}); // { materialId: { usageId, quantity }, ... }

  // 初期データ読み込み
  useEffect(() => {
    (async () => {
      try {
        const pr = await fetchProjects();
        setProjects(pr || []);
        const mats = await fetchMaterialsList();
        setMaterials(mats || []);
      } catch (e) {
        console.error(e);
        Alert.alert('エラー', '初期データの取得に失敗しました');
      }
    })();
  }, []);

  // プロジェクト選択時に使用量も取得
  const onSelectProject = async (proj) => {
    setSelectedProject(proj);
    setExpandedCategories({});
    setQtyMap({});
    setUsageMap({});
    try {
      const usages = await fetchMaterialUsages(proj.id);
      const map = {};
      usages.forEach(u => {
        map[u.materialId] = { usageId: u.id, quantity: u.quantity };
      });
      setUsageMap(map);

      // 初期 qtyMap に既存値を投入
      const initialQty = {};
      Object.entries(map).forEach(([materialId, { quantity }]) => {
        const mat = materials.find(m => m.id === materialId);
        if (mat) initialQty[mat.partNo] = String(quantity);
      });
      setQtyMap(initialQty);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '使用量データの取得に失敗しました');
    }
  };

  const categories = Array.from(new Set(materials.map(m => m.category)));

  // 折り畳み
  const toggleCategory = (cat) =>
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));

  // 個別数量入力
  const handleQtyChange = (partNo, text) =>
    setQtyMap(prev => ({ ...prev, [partNo]: text }));

  // 一括登録
  const handleBulkRegister = async () => {
    if (!selectedProject) {
      Alert.alert('入力エラー', 'プロジェクトを選択してください');
      return;
    }
    const promises = [];
    const errors = [];

    materials.forEach(mat => {
      const raw = qtyMap[mat.partNo];
      const usage = usageMap[mat.id];

      // 空欄 → 既存レコードがあれば削除
      if ((raw == null || raw === '') && usage) {
        promises.push(
          deleteMaterialUsage(usage.usageId).catch(e => {
            console.error(e);
            errors.push(`${mat.partNo}: 削除失敗`);
          })
        );
        return;
      }

      // 数値入力あり → 新規 or 上書き
      if (raw != null && raw !== '') {
        const qty = parseInt(raw, 10);
        if (isNaN(qty) || qty < 0) {
          errors.push(`${mat.partNo}: 数量が不正`);
          return;
        }
        if (usage) {
          // 上書き更新
          promises.push(
            updateMaterialUsage(usage.usageId, qty).catch(e => {
              console.error(e);
              errors.push(`${mat.partNo}: 更新失敗`);
            })
          );
        } else {
          // 新規登録
          promises.push(
            addMaterialUsage({
              projectId: selectedProject.id,
              materialId: mat.id,
              quantity: qty,
            }).catch(e => {
              console.error(e);
              errors.push(`${mat.partNo}: 登録失敗`);
            })
          );
        }
      }
    });

    await Promise.all(promises);

    if (errors.length > 0) {
      Alert.alert('一括登録完了（一部失敗あり）', errors.join('\n'));
    } else {
      Alert.alert('一括登録完了', 'すべての数量を登録／更新しました');
    }

    // 再読込
    onSelectProject(selectedProject);
  };

  return (
    <SafeAreaView edges={['top']} style={tw`flex-1 bg-white`}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={tw`flex-1`}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={tw`p-4`}
        >
          {/* 見出し（Dynamic Island下に潜らない） */}
          <View style={tw`mb-3`}>
            <Text style={tw`text-lg font-bold text-gray-900`}>
              資材使用一括登録
            </Text>
          </View>

          {/* プロジェクト選択 */}
          <View style={tw`mb-3`}>
            <Text style={tw`mb-2 text-gray-700`}>プロジェクトを選択</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {projects.map(proj => (
                <TouchableOpacity
                  key={proj.id}
                  onPress={() => onSelectProject(proj)}
                  activeOpacity={0.7}
                  style={tw.style(
                    'px-4 py-2 mr-2 rounded',
                    selectedProject?.id === proj.id ? 'bg-blue-500' : 'bg-gray-300'
                  )}
                >
                  {/* ★ 必ず<Text>で包む */}
                  <Text style={tw`text-white`}>
                    {proj.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* 大分類 折り畳み一覧 */}
          {selectedProject && categories.map(cat => (
            <View key={cat} style={tw`mb-3`}>
              <TouchableOpacity
                onPress={() => toggleCategory(cat)}
                activeOpacity={0.7}
                style={tw`bg-gray-200 p-3 rounded`}
              >
                <Text style={tw`font-semibold text-gray-800`}>{cat}</Text>
              </TouchableOpacity>

              {expandedCategories[cat] && (
                <View style={tw`mt-2`}>
                  {materials
                    .filter(m => m.category === cat)
                    .map(mat => (
                      <View
                        key={mat.id}
                        style={tw`bg-white rounded border border-gray-200 p-3 mb-2`}
                      >
                        <Text style={tw`text-gray-900 font-semibold`}>
                          {mat.name1}{mat.name2 ? ` / ${mat.name2}` : ''}
                        </Text>
                        <Text style={tw`text-gray-600 mb-2`}>
                          品番: {mat.partNo}
                        </Text>

                        <TextInput
                          placeholder="数量を入力"
                          keyboardType="number-pad"
                          returnKeyType="done"
                          onSubmitEditing={() => Keyboard.dismiss()}
                          value={qtyMap[mat.partNo] ?? ''}
                          onChangeText={(t) => handleQtyChange(mat.partNo, t)}
                          style={tw`border border-gray-300 rounded px-3 py-2`}
                        />
                      </View>
                    ))}
                </View>
              )}
            </View>
          ))}

          {/* 一括登録ボタン */}
          {selectedProject && (
            <TouchableOpacity
              onPress={handleBulkRegister}
              activeOpacity={0.8}
              style={tw`mt-4 bg-blue-600 rounded px-4 py-3 items-center`}
            >
              {/* ★ 必ず<Text>で包む */}
              <Text style={tw`text-white font-semibold`}>一括登録する</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
