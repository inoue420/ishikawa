// screens/MaterialRegisterScreen.js

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, FlatList, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tw from 'twrnc';

export default function MaterialRegisterScreen() {
  const STORAGE_KEY = '@materials_list';
  const [items, setItems] = useState([]);
  const [material, setMaterial] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await AsyncStorage.getItem(STORAGE_KEY);
        if (data) setItems(JSON.parse(data));
      } catch (e) {
        console.error('AsyncStorage load error', e);
      }
    })();
  }, []);

  const saveItems = async (list) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('AsyncStorage save error', e);
    }
  };

  const handleAdd = async () => {
    if (!material.trim()) {
      Alert.alert('入力エラー', '資材名を入力してください');
      return;
    }
    setLoading(true);
    const updated = [...items, material.trim()];
    setItems(updated);
    await saveItems(updated);
    Alert.alert('成功', '資材を登録しました');
    setMaterial('');
    setLoading(false);
  };

  const renderItem = ({ item }) => (
    <View style={tw`bg-white p-3 rounded mb-2`}>
      <Text>{item}</Text>
    </View>
  );

  return (
    <View style={tw`flex-1 bg-gray-100 p-4`}>
      <Text style={tw`text-xl font-bold mb-4`}>資材登録</Text>

      <TextInput
        style={tw`border border-gray-300 p-2 mb-2 rounded`}
        placeholder="資材名を入力"
        value={material}
        onChangeText={setMaterial}
      />
      <Button title={loading ? '...' : '追加'} onPress={handleAdd} disabled={loading} />

      <Text style={tw`text-lg font-semibold mt-6 mb-2`}>登録資材一覧</Text>
      {items.length === 0 ? (
        <Text style={tw`text-center text-gray-500`}>資材がまだありません</Text>
      ) : (
        <FlatList data={items} keyExtractor={(it, i) => i.toString()} renderItem={renderItem} />
      )}
    </View>
  );
}
