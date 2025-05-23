// screens/MaterialsScreen.js

import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  Button,
  Alert,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import tw from 'twrnc';

export default function MaterialsScreen() {
  const RECORD_KEY = '@materials_records';
  const ITEM_KEY   = '@materials_list';
  const PROJECT_KEY = '@project_list';

  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    try {
      const itemData = await AsyncStorage.getItem(ITEM_KEY);
      setItems(itemData ? JSON.parse(itemData) : []);
      const projData = await AsyncStorage.getItem(PROJECT_KEY);
      setProjects(projData ? JSON.parse(projData) : []);
      const recData = await AsyncStorage.getItem(RECORD_KEY);
      setRecords(recData ? JSON.parse(recData) : []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const saveRecords = async (list) => {
    await AsyncStorage.setItem(RECORD_KEY, JSON.stringify(list));
  };

  const handleAction = async (type) => {
    if (!selectedItem) {
      Alert.alert('入力エラー', '資材を選択してください');
      return;
    }
    if (!selectedProject) {
      Alert.alert('入力エラー', 'プロジェクトを選択してください');
      return;
    }
    setLoading(true);
    const timestamp = new Date().toISOString();
    const newRecord = {
      item: selectedItem,
      project: selectedProject,
      type,
      timestamp,
    };
    const updated = [newRecord, ...records];
    setRecords(updated);
    await saveRecords(updated);
    Alert.alert(
      '成功',
      type === 'lend' ? '貸出を記録しました' : '返却を記録しました'
    );
    setShowItemPicker(false);
    setShowProjectPicker(false);
    setLoading(false);
  };

  return (
    <ScrollView style={tw`flex-1 bg-gray-100 p-4`}>
      <Text style={tw`text-xl font-bold mb-4`}>資材貸出管理</Text>

      {/* 資材選択 */}
      <Text style={tw`mb-2`}>資材</Text>
      <TouchableOpacity
        style={tw`bg-white p-4 rounded mb-4 border border-gray-300`}
        onPress={() => setShowItemPicker((v) => !v)}
      >
        <Text>{selectedItem || 'タップして選択'}</Text>
      </TouchableOpacity>
      {showItemPicker && (
        <View style={tw`bg-white rounded mb-4 border border-gray-200`}>
          <Picker
            selectedValue={selectedItem}
            onValueChange={(val) => {
              setSelectedItem(val);
              setShowItemPicker(false);
            }}
            style={{ height: 200 }}
          >
            <Picker.Item label="選択してください" value="" />
            {items.map((it, i) => (
              <Picker.Item key={i} label={it} value={it} />
            ))}
          </Picker>
        </View>
      )}

      {/* プロジェクト選択 */}
      <Text style={tw`mb-2`}>プロジェクト</Text>
      <TouchableOpacity
        style={tw`bg-white p-4 rounded mb-4 border border-gray-300`}
        onPress={() => setShowProjectPicker((v) => !v)}
      >
        <Text>{selectedProject || 'タップして選択'}</Text>
      </TouchableOpacity>
      {showProjectPicker && (
        <View style={tw`bg-white rounded mb-4 border border-gray-200`}>
          <Picker
            selectedValue={selectedProject}
            onValueChange={(val) => {
              setSelectedProject(val);
              setShowProjectPicker(false);
            }}
            style={{ height: 200 }}
          >
            <Picker.Item label="選択してください" value="" />
            {projects.map((p, i) => (
              <Picker.Item key={i} label={p.name} value={p.name} />
            ))}
          </Picker>
        </View>
      )}

      {/* アクションボタン */}
      <View style={tw`flex-row justify-between mb-6`}>
        <Button
          title={loading ? '...' : '貸出'}
          onPress={() => handleAction('lend')}
          disabled={loading}
        />
        <Button
          title={loading ? '...' : '返却'}
          onPress={() => handleAction('return')}
          disabled={loading}
        />
      </View>

      {/* 履歴 */}
      <Text style={tw`text-lg font-semibold mb-2`}>履歴</Text>
      {records.length === 0 ? (
        <Text style={tw`text-center text-gray-500`}>記録がありません</Text>
      ) : (
        records.map((rec, idx) => (
          <View
            key={idx}
            style={tw`bg-white p-3 rounded mb-2 flex-row justify-between`}
          >
            <Text>
              {rec.item} / {rec.project} -{' '}
              {rec.type === 'lend' ? '貸出' : '返却'}
            </Text>
            <Text>{new Date(rec.timestamp).toLocaleString()}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}
