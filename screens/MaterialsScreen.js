// screens/MaterialsScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Button,
  Alert,
  Dimensions,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import tw from 'twrnc';
import {
  fetchMaterialsList,
  fetchProjects,
  fetchMaterialsRecords,
  addMaterialRecord,
  deleteMaterialRecord,
  updateMaterialRecord,
} from '../firestoreService';

const { width } = Dimensions.get('window');

export default function MaterialsScreen() {
  // Data state
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [records, setRecords] = useState([]);

  // Selection state
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [lendStart, setLendStart] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);

  // Editing state
  const [editingId, setEditingId] = useState(null);
  const [editStart, setEditStart] = useState(new Date());
  const [editEnd, setEditEnd] = useState(new Date());
  const [showEditStartPicker, setShowEditStartPicker] = useState(false);
  const [showEditEndPicker, setShowEditEndPicker] = useState(false);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const dateFmt = (d) => d.toLocaleDateString();

  // Load data from Firestore
  const loadData = useCallback(async () => {
    try {
      const [it, pr, rc] = await Promise.all([
        fetchMaterialsList(),
        fetchProjects(),
        fetchMaterialsRecords(),
      ]);
      setItems(it);
      setProjects(pr);
      // Convert Firestore Timestamps to JS Date strings
      const formatted = rc.map((rec) => ({
        id: rec.id,
        project: rec.project,
        items: rec.items,
        lendStart: rec.lendStart.toDate(),
        lendEnd: rec.lendEnd ? rec.lendEnd.toDate() : null,
        timestamp: rec.timestamp.toDate(),
      }));
      setRecords(formatted);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', 'データの読み込みに失敗しました');
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Persist new record
  const handleRecord = async () => {
    if (!selectedProject) {
      return Alert.alert('入力エラー', 'プロジェクトを選択してください');
    }
    if (selectedItems.length === 0) {
      return Alert.alert('入力エラー', '資材を選択してください');
    }
    // Check conflicts: items already active (lendEnd null)
    const activeIds = new Set(records.filter((r) => !r.lendEnd).flatMap((r) => r.items));
    const conflict = selectedItems.find((it) => activeIds.has(it));
    if (conflict) {
      return Alert.alert('エラー', `${conflict} は既に貸出中です`);
    }

    setLoading(true);
    try {
      await addMaterialRecord({
        project: selectedProject,
        lendStart,
        lendEnd: null,
        items: selectedItems,
        timestamp: new Date(),
      });
      setSelectedItems([]);
      loadData();
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '貸出記録の作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // Update existing record
  const handleUpdateRecord = async () => {
    if (!editingId) return;
    setLoading(true);
    try {
      await updateMaterialRecord(editingId, {
        lendStart: editStart,
        lendEnd: editEnd,
      });
      setEditingId(null);
      loadData();
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // Delete record
  const handleDeleteRecord = async (id) => {
    Alert.alert('確認', 'この記録を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMaterialRecord(id);
            setEditingId(null);
            loadData();
          } catch (e) {
            console.error(e);
            Alert.alert('エラー', '削除に失敗しました');
          }
        },
      },
    ]);
  };

  // Render each record
  const renderRecord = (rec) => {
    const names = rec.items.join(', ');
    return (
      <View key={rec.id} style={tw`bg-white p-3 rounded mb-2`}>
        <TouchableOpacity
          onPress={() => {
            setEditingId(rec.id);
            setEditStart(rec.lendStart);
            setEditEnd(rec.lendEnd || rec.lendStart);
          }}
        >
          <Text style={tw`font-bold`}>{names} / {rec.project}</Text>
          <Text>開始: {dateFmt(rec.lendStart)}</Text>
          <Text>終了: {rec.lendEnd ? dateFmt(rec.lendEnd) : '未設定'}</Text>
          <Text style={tw`text-gray-500 text-sm`}>登録: {rec.timestamp.toLocaleString()}</Text>
        </TouchableOpacity>

        {editingId === rec.id && (
          <View style={tw`mt-2 bg-gray-50 p-2 rounded`}>            
            <Text style={tw`mb-1`}>貸出開始日</Text>
            <TouchableOpacity
              onPress={() => setShowEditStartPicker(true)}
              style={tw`bg-white p-2 rounded mb-2 border border-gray-300`}
            >
              <Text>{dateFmt(editStart)}</Text>
            </TouchableOpacity>
            {showEditStartPicker && (
              <DateTimePicker
                value={editStart}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, d) => { setShowEditStartPicker(false); if (d) setEditStart(d); }}
              />
            )}

            <Text style={tw`mb-1`}>貸出終了日</Text>
            <TouchableOpacity
              onPress={() => setShowEditEndPicker(true)}
              style={tw`bg-white p-2 rounded mb-2 border border-gray-300`}
            >
              <Text>{dateFmt(editEnd)}</Text>
            </TouchableOpacity>
            {showEditEndPicker && (
              <DateTimePicker
                value={editEnd}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, d) => { setShowEditEndPicker(false); if (d) setEditEnd(d); }}
              />
            )}

            <View style={tw`flex-row justify-between`}>            
              <View style={{ width: '45%' }}>
                <Button title="保存" onPress={handleUpdateRecord} />
              </View>
              <View style={{ width: '45%' }}>
                <Button title="削除" color="red" onPress={() => handleDeleteRecord(rec.id)} />
              </View>
            </View>
          </View>
        )}
      </View>
    );
  };

  // Active items set
  const activeItems = new Set(
    records.filter((r) => !r.lendEnd).flatMap((r) => r.items)
  );

  return (
    <View style={tw`flex-1 flex-row bg-gray-100`}>
      {/* Left column */}
      <ScrollView style={{ width: width * 0.6, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-4`}>資材貸出管理</Text>

        {/* Item selection */}
        <Text style={tw`mb-2 font-semibold`}>資材選択</Text>
        <ScrollView horizontal style={tw`mb-4`}>
          {items.map((it) => {
            const disabled = activeItems.has(it.name);
            const selected = selectedItems.includes(it.name);
            return (
              <TouchableOpacity
                key={it.id}
                style={tw`px-4 py-2 mr-2 rounded ${
                  selected ? 'bg-blue-500' : disabled ? 'bg-gray-400' : 'bg-gray-300'
                }`}
                onPress={() => {
                  if (disabled) {
                    Alert.alert('エラー', `${it.name} は既に貸出中です`);
                  } else if (selected) {
                    setSelectedItems((sel) => sel.filter((x) => x !== it.name));
                  } else {
                    setSelectedItems((sel) => [...sel, it.name]);
                  }
                }}
              >
                <Text style={tw`text-white`}>{it.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Project selection */}
        <Text style={tw`mb-2 font-semibold`}>プロジェクト選択</Text>
        <ScrollView horizontal style={tw`mb-4`}>
          {projects.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={tw`px-4 py-2 mr-2 rounded ${
                selectedProject === p.name ? 'bg-blue-500' : 'bg-gray-300'
              }`}
              onPress={() => {
                setSelectedProject(p.name);
                setSelectedItems([]);
              }}
            >
              <Text style={tw`text-white`}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Lend start date picker */}
        <Text style={tw`mb-2 font-semibold`}>貸出開始日</Text>
        <TouchableOpacity
          style={tw`bg-white p-4 rounded mb-6 border border-gray-300`}
          onPress={() => setShowStartPicker(true)}
        >
          <Text>{dateFmt(lendStart)}</Text>
        </TouchableOpacity>
        {showStartPicker && (
          <DateTimePicker
            value={lendStart}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, d) => {
              setShowStartPicker(false);
              if (d) setLendStart(d);
            }}
          />
        )}

        <View style={tw`items-center mb-6`}> 
          <View style={{ width: '50%' }}>
            <Button title={loading ? '...' : '貸出記録'} onPress={handleRecord} disabled={loading} />
          </View>
        </View>
      </ScrollView>

      {/* Right column */}
      <ScrollView style={{ width: width * 0.4, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-4`}>履歴一覧</Text>
        {records.length === 0 ? (
          <Text style={tw`text-center text-gray-500`}>記録なし</Text>
        ) : (
          records.map(renderRecord)
        )}
      </ScrollView>
    </View>
  );
}
