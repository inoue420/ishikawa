// screens/phone/MaterialsScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Button,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard
} from 'react-native';
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
  const [qtyMap, setQtyMap] = useState({}); // { partNo: '123', ... }
  const [usageMap, setUsageMap] = useState({}); 
  // usageMap: { materialId: { usageId, quantity }, ... }

  // 初期データ読み込み
  useEffect(() => {
    (async () => {
      try {
        const pr = await fetchProjects();
        setProjects(pr);
        const mats = await fetchMaterialsList();
        setMaterials(mats);
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
      // 初期 qtyMap にも既存値をセット
      const initialQty = {};
      Object.entries(map).forEach(([mid, { quantity }]) => {
        // find partNo for this materialId
        const mat = materials.find(m => m.id === mid);
        if (mat) initialQty[mat.partNo] = String(quantity);
      });
      setUsageMap(map);
      setQtyMap(initialQty);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '使用量データの取得に失敗しました');
    }
  };

  // 大分類一覧
  const categories = Array.from(new Set(materials.map(m => m.category)));

  // 折り畳みトグル
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
    // materials の中から partNo が qtyMap に入っているものだけ処理
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
    // 登録後は最新の usageMap を取得し直す
    onSelectProject(selectedProject);
  };

  return (
    <KeyboardAvoidingView
      style={tw`flex-1 bg-gray-100`}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={tw`p-4`} keyboardShouldPersistTaps="handled">
        <Text style={tw`text-2xl font-bold mb-4`}>資材使用一括登録</Text>

        {/* プロジェクト選択 */}
        <Text style={tw`mb-2 font-semibold`}>プロジェクトを選択</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-4`}>
          {projects.map(proj => (
            <TouchableOpacity
              key={proj.id}
              onPress={() => onSelectProject(proj)}
              style={tw`px-4 py-2 mr-2 rounded ${
                selectedProject?.id === proj.id ? 'bg-blue-500' : 'bg-gray-300'
              }`}
            >
              <Text style={tw`text-white`}>{proj.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 大分類 列表 */}
        {selectedProject && categories.map(cat => (
          <View key={cat} style={tw`mb-4`}>
            <TouchableOpacity
              onPress={() => toggleCategory(cat)}
              style={tw`bg-gray-200 p-3 rounded`}
            >
              <Text style={tw`font-bold`}>{cat}</Text>
            </TouchableOpacity>
            {expandedCategories[cat] && materials
              .filter(m => m.category === cat)
              .map(mat => (
                <View key={mat.id} style={tw`bg-white p-3 ml-4 my-2 rounded shadow`}>
                  <Text style={tw`font-semibold`}>
                    {mat.name1}{mat.name2 ? ` / ${mat.name2}` : ''}
                  </Text>
                  <Text>品番: {mat.partNo}</Text>
                    <TextInput
                      style={tw`border border-gray-300 p-2 rounded w-full mt-2`}
                      placeholder="数量を入力"
                      keyboardType="numeric"
                      returnKeyType="done"           // 完了キーを “Done” に
                      blurOnSubmit={true}            // 完了でフォーカスを外す
                      onSubmitEditing={() => Keyboard.dismiss()} // 完了キーでキーボードを閉じる
                      value={qtyMap[mat.partNo] ?? ''}
                      onChangeText={t => handleQtyChange(mat.partNo, t)}
                    />
                </View>
              ))
            }
          </View>
        ))}

        {/* 一括登録ボタン */}
        {selectedProject && (
          <View style={tw`items-center mt-4`}>
            <View style={{ width: '60%' }}>
              <Button title="一括登録" onPress={handleBulkRegister} />
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
