// screens/UserRegisterScreen.js

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, FlatList, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tw from 'twrnc';

export default function UserRegisterScreen() {
  const STORAGE_KEY = '@user_list';
  const [users, setUsers] = useState([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  // 初期ロード
  useEffect(() => {
    (async () => {
      try {
        const data = await AsyncStorage.getItem(STORAGE_KEY);
        if (data) setUsers(JSON.parse(data));
      } catch (e) {
        console.error('AsyncStorage load error', e);
      }
    })();
  }, []);

  const saveUsers = async (list) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('AsyncStorage save error', e);
    }
  };

  const handleAdd = async () => {
    if (!name.trim()) {
      Alert.alert('入力エラー', 'ユーザー名を入力してください');
      return;
    }
    setLoading(true);
    const updated = [...users, name.trim()];
    setUsers(updated);
    await saveUsers(updated);
    Alert.alert('成功', 'ユーザーを登録しました');
    setName('');
    setLoading(false);
  };

  const renderItem = ({ item }) => (
    <View style={tw`bg-white p-3 rounded mb-2`}>
      <Text>{item}</Text>
    </View>
  );

  return (
    <View style={tw`flex-1 bg-gray-100 p-4`}>
      <Text style={tw`text-xl font-bold mb-4`}>ユーザー登録</Text>

      <TextInput
        style={tw`border border-gray-300 p-2 mb-2 rounded`}
        placeholder="ユーザー名を入力"
        value={name}
        onChangeText={setName}
      />
      <Button title={loading ? '...' : '追加'} onPress={handleAdd} disabled={loading} />

      <Text style={tw`text-lg font-semibold mt-6 mb-2`}>登録ユーザー一覧</Text>
      {users.length === 0 ? (
        <Text style={tw`text-center text-gray-500`}>ユーザーがまだいません</Text>
      ) : (
        <FlatList data={users} keyExtractor={(u, i) => i.toString()} renderItem={renderItem} />
      )}
    </View>
  );
}
