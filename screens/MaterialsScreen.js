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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import tw from 'twrnc';

const { width } = Dimensions.get('window');
const ITEM_KEY = '@materials_list';
const PROJECT_KEY = '@project_list';
const RECORD_KEY = '@materials_records';

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
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editStart, setEditStart] = useState(new Date());
  const [editEnd, setEditEnd] = useState(new Date());
  const [showEditStartPicker, setShowEditStartPicker] = useState(false);
  const [showEditEndPicker, setShowEditEndPicker] = useState(false);

  const [loading, setLoading] = useState(false);
  const dateFmt = d => d.toLocaleDateString();

  // Load data
  const loadData = async () => {
    try {
      const it = await AsyncStorage.getItem(ITEM_KEY);
      setItems(it ? JSON.parse(it) : []);
      const pr = await AsyncStorage.getItem(PROJECT_KEY);
      setProjects(pr ? JSON.parse(pr) : []);
      const rc = await AsyncStorage.getItem(RECORD_KEY);
      setRecords(rc ? JSON.parse(rc) : []);
    } catch (e) {
      console.error(e);
    }
  };
  useEffect(() => { loadData(); }, []);
  useFocusEffect(useCallback(() => { loadData(); }, []));

  // Persist records
  const saveRecords = async list => {
    try {
      await AsyncStorage.setItem(RECORD_KEY, JSON.stringify(list));
    } catch (e) {
      console.error(e);
    }
  };

  // Find active items (no lendEnd)
  const activeItems = new Set(
    records.filter(r => !r.lendEnd).flatMap(r => r.items)
  );

  // Record multiple items lend
  const handleRecord = async () => {
    if (!selectedProject) {
      return Alert.alert('入力エラー', 'プロジェクトを選択してください');
    }
    if (selectedItems.length === 0) {
      return Alert.alert('入力エラー', '資材を選択してください');
    }
    const conflict = selectedItems.find(it => activeItems.has(it));
    if (conflict) {
      return Alert.alert('エラー', `${conflict} は既に貸出中です`);
    }

    setLoading(true);
    const newRec = {
      items: selectedItems,
      project: selectedProject,
      lendStart: lendStart.toISOString(),
      lendEnd: '',
      timestamp: new Date().toISOString(),
    };
    const updated = [newRec, ...records];
    setRecords(updated);
    await saveRecords(updated);
    setSelectedItems([]);
    setLoading(false);
  };

  // Update record start and end
  const handleUpdateRecord = async idx => {
    const updated = records.map((rec, i) =>
      i === idx
        ? { ...rec, lendStart: editStart.toISOString(), lendEnd: editEnd.toISOString() }
        : rec
    );
    setRecords(updated);
    await saveRecords(updated);
    setEditingIndex(-1);
  };

  // Delete record
  const handleDeleteRecord = async idx => {
    Alert.alert(
      '確認',
      'この記録を削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: async () => {
          const updated = records.filter((_, i) => i !== idx);
          setRecords(updated);
          await saveRecords(updated);
          setEditingIndex(-1);
        }}
      ]
    );
  };

  // Render history record
  const renderRecord = (rec, idx) => {
    const names = Array.isArray(rec.items) ? rec.items.join(', ') : '';
    return (
      <View key={idx} style={tw`bg-white p-3 rounded mb-2`}>      
        <TouchableOpacity onPress={() => {
          setEditingIndex(idx);
          setEditStart(new Date(rec.lendStart));
          setEditEnd(rec.lendEnd ? new Date(rec.lendEnd) : new Date(rec.lendStart));
        }}>
          <Text style={tw`font-bold`}>{names} / {rec.project}</Text>
          <Text>開始: {dateFmt(new Date(rec.lendStart))}</Text>
          <Text>終了: {rec.lendEnd ? dateFmt(new Date(rec.lendEnd)) : '未設定'}</Text>
          <Text style={tw`text-gray-500 text-sm`}>登録: {new Date(rec.timestamp).toLocaleString()}</Text>
        </TouchableOpacity>

        {editingIndex === idx && (
          <View style={tw`mt-2 bg-gray-50 p-2 rounded`}>          
            <Text style={tw`mb-1`}>貸出開始日</Text>
            <TouchableOpacity onPress={() => setShowEditStartPicker(true)} style={tw`bg-white p-2 rounded mb-2 border border-gray-300`}>
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
            <TouchableOpacity onPress={() => setShowEditEndPicker(true)} style={tw`bg-white p-2 rounded mb-2 border border-gray-300`}>
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
                <Button title="保存" onPress={() => handleUpdateRecord(idx)} />
              </View>
              <View style={{ width: '45%' }}>
                <Button title="削除" color="red" onPress={() => handleDeleteRecord(idx)} />
              </View>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={tw`flex-1 flex-row bg-gray-100`}>
      {/* Left column */}
      <ScrollView style={{ width: width * 0.6, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-4`}>資材貸出管理</Text>

        <Text style={tw`mb-2 font-semibold`}>資材選択</Text>
        <ScrollView horizontal style={tw`mb-4`}>        
          {items.map((it, i) => {
            const disabled = activeItems.has(it.name);
            const selected = selectedItems.includes(it.name);
            return (
              <TouchableOpacity
                key={i}
                style={tw`px-4 py-2 mr-2 rounded ${selected ? 'bg-blue-500' : disabled ? 'bg-gray-400' : 'bg-gray-300'}`}
                onPress={() => {
                  if (disabled) {
                    Alert.alert('エラー', `${it.name} は既に貸出中です`);
                  } else if (selected) {
                    setSelectedItems(sel => sel.filter(x => x !== it.name));
                  } else {
                    setSelectedItems(sel => [...sel, it.name]);
                  }
                }}
              >
                <Text style={tw`text-white`}>{it.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={tw`mb-2 font-semibold`}>プロジェクト選択</Text>
        <ScrollView horizontal style={tw`mb-4`}>        
          {projects.map((p, i) => (
            <TouchableOpacity
              key={i}
              style={tw`px-4 py-2 mr-2 rounded ${selectedProject === p.name ? 'bg-blue-500' : 'bg-gray-300'}`}
              onPress={() => {
                setSelectedProject(p.name);
                setSelectedItems([]);
              }}
            >
              <Text style={tw`text-white`}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

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
            onChange={(_, d) => { setShowStartPicker(false); if (d) setLendStart(d); }}
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
