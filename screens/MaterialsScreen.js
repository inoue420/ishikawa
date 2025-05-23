// screens/MaterialsScreen.js

import React, { useEffect, useState } from 'react';
import { View, Text, Button, TextInput, FlatList, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tw from 'twrnc';

export default function MaterialsScreen() {
  const STORAGE_KEY = '@materials_records';
  const [records, setRecords] = useState([]);
  const [material, setMaterial] = useState('');
  const [loading, setLoading] = useState(false);

  // 初期ロード
  useEffect(() => {
    (async () => {
      try {
        const data = await AsyncStorage.getItem(STORAGE_KEY);
        if (data) setRecords(JSON.parse(data));
      } catch (e) {
        console.error('AsyncStorage load error', e);
      }
    })();
  }, []);

  // 保存
  const saveRecords = async (newRecords) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newRecords));
    } catch (e) {
      console.error('AsyncStorage save error', e);
    }
  };

  // 貸出/返却処理
  const handleAction = async (type) => {
    if (!material.trim()) {
      Alert.alert('入力エラー', '資材名を入力してください');
      return;
    }
    setLoading(true);
    const timestamp = new Date().toISOString();
    const newRecord = { type, material, timestamp };
    const updated = [newRecord, ...records];
    setRecords(updated);
    await saveRecords(updated);
    Alert.alert('成功', type === 'lend' ? '貸出を記録しました' : '返却を記録しました');
    setMaterial('');
    setLoading(false);
  };

  // レコードレンダー
  const renderItem = ({ item }) => (
    <View style={tw`flex-row justify-between bg-white p-3 rounded mb-2`}>
      <View>
        <Text>{item.type === 'lend' ? '貸出' : '返却'}</Text>
        <Text style={tw`text-sm text-gray-500`}>{item.material}</Text>
      </View>
      <Text style={tw`text-sm`}>{new Date(item.timestamp).toLocaleString()}</Text>
    </View>
  );

  return (
    <View style={tw`flex-1 bg-gray-100 p-4`}>
      <Text style={tw`text-xl font-bold mb-4`}>資材貸出管理</Text>

      {/* 入力エリア */}
      <TextInput
        style={tw`border border-gray-300 p-2 mb-2 rounded`}
        placeholder="資材名を入力"
        value={material}
        onChangeText={setMaterial}
      />
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

      {/* 履歴リスト */}
      <Text style={tw`text-lg font-semibold mb-2`}>履歴</Text>
      {records.length === 0 ? (
        <Text style={tw`text-center text-gray-500`}>記録がありません</Text>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(_, index) => index.toString()}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}
