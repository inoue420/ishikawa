// screens/MaterialRegisterScreen.js

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tw from 'twrnc';

const { width } = Dimensions.get('window');

export default function MaterialRegisterScreen() {
  const STORAGE_KEY = '@materials_list';
  const [items, setItems] = useState([]);
  const [material, setMaterial] = useState('');
  const [loading, setLoading] = useState(false);

  // データロード
  useEffect(() => {
    (async () => {
      try {
        const data = await AsyncStorage.getItem(STORAGE_KEY);
        setItems(data ? JSON.parse(data) : []);
      } catch (e) {
        console.error('AsyncStorage load error', e);
      }
    })();
  }, []);

  const saveItems = async list => {
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

  return (
    <View style={tw`flex-1 flex-row bg-gray-100`}>      
      {/* 左カラム：入力フォーム (60%) */}
      <ScrollView style={{ width: width * 0.6, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-6`}>資材登録</Text>

        <TextInput
          style={tw`border border-gray-300 p-2 mb-4 rounded`}
          placeholder="資材名を入力"
          value={material}
          onChangeText={setMaterial}
        />

        <View style={tw`items-center mb-6`}>
          <View style={{ width: '50%' }}>
            <Button
              title={loading ? '追加中...' : '追加'}
              onPress={handleAdd}
              disabled={loading}
            />
          </View>
        </View>
      </ScrollView>

      {/* 右カラム：登録資材一覧 (40%) */}
      <ScrollView style={{ width: width * 0.4, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-4`}>登録資材一覧</Text>
        {items.length === 0 ? (
          <Text style={tw`text-center text-gray-500`}>資材がまだありません</Text>
        ) : (
          items.map((it, idx) => (
            <View key={idx} style={tw`bg-white p-3 rounded mb-2`}>              
              <Text>{it}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
