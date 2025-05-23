// screens/MaterialsScreen.js

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Button, Alert, FlatList } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import tw from 'twrnc';

export default function MaterialsScreen() {
  const RECORD_KEY = '@materials_records';
  const ITEM_KEY = '@materials_list';

  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  // データロード関数
  const loadData = async () => {
    try {
      const itemData = await AsyncStorage.getItem(ITEM_KEY);
      setItems(itemData ? JSON.parse(itemData) : []);
      const recData = await AsyncStorage.getItem(RECORD_KEY);
      setRecords(recData ? JSON.parse(recData) : []);
    } catch (e) {
      console.error('AsyncStorage error', e);
    }
  };

  // 初回マウント時
  useEffect(() => {
    loadData();
  }, []);

  // タブフォーカス時にも再ロード
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  // レコード保存
  const saveRecords = async (list) => {
    try {
      await AsyncStorage.setItem(RECORD_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('AsyncStorage save error', e);
    }
  };

  // 貸出／返却アクション
  const handleAction = async (type) => {
    if (!selectedItem) {
      Alert.alert('入力エラー', '資材を選択してください');
      return;
    }
    setLoading(true);
    const timestamp = new Date().toISOString();
    const newRecord = { item: selectedItem, type, timestamp };
    const updated = [newRecord, ...records];
    setRecords(updated);
    await saveRecords(updated);
    Alert.alert(
      '成功',
      type === 'lend' ? '貸出を記録しました' : '返却を記録しました'
    );
    setLoading(false);
  };

  // レンダラ
  const renderItem = ({ item }) => (
    <View style={tw`flex-row justify-between bg-white p-3 rounded mb-2`}>
      <Text>
        {item.item} - {item.type === 'lend' ? '貸出' : '返却'}
      </Text>
      <Text>{new Date(item.timestamp).toLocaleString()}</Text>
    </View>
  );

  return (
    <View style={tw`flex-1 bg-gray-100 p-4`}>
      <Text style={tw`text-xl font-bold mb-4`}>資材貸出管理</Text>

      {/* 資材選択 */}
      <View style={tw`bg-white p-4 rounded mb-4`}>
        <Text style={tw`mb-2`}>資材</Text>
        <View style={tw`border border-gray-300 rounded`}>
          <Picker
            selectedValue={selectedItem}
            onValueChange={(val) => setSelectedItem(val)}
          >
            <Picker.Item label="選択してください" value="" />
            {items.map((it, idx) => (
              <Picker.Item key={idx} label={it} value={it} />
            ))}
          </Picker>
        </View>
      </View>

      <View style={tw`flex-row justify-between mb-4`}>
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

      <Text style={tw`text-lg font-semibold mb-2`}>履歴</Text>
      <FlatList
        data={records}
        keyExtractor={(_, i) => i.toString()}
        renderItem={renderItem}
      />
    </View>
  );
}
