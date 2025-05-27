// screens/UserRegisterScreen.js

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  Alert,
  ScrollView,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tw from 'twrnc';

const { width } = Dimensions.get('window');
export default function UserRegisterScreen() {
  const STORAGE_KEY = '@user_list';
  // users: { name: string, wage?: number }
  const [users, setUsers] = useState([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editNameInput, setEditNameInput] = useState('');
  const [wageInput, setWageInput] = useState('');

  // Load users
  useEffect(() => {
    (async () => {
      try {
        const data = await AsyncStorage.getItem(STORAGE_KEY);
        setUsers(data ? JSON.parse(data) : []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const saveUsers = async list => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error(e);
    }
  };

  const handleAdd = async () => {
    if (!name.trim()) return Alert.alert('入力エラー', 'ユーザー名を入力してください');
    setLoading(true);
    const updated = [...users, { name: name.trim() }];
    setUsers(updated);
    await saveUsers(updated);
    setName('');
    setLoading(false);
  };

  const saveWage = async index => {
    const wage = parseFloat(wageInput);
    if (isNaN(wage) || wage <= 0) return Alert.alert('入力エラー', '有効な数字を入力してください');
    const updated = users.map((u, i) => (i === index ? { ...u, wage } : u));
    setUsers(updated);
    await saveUsers(updated);
    setEditingIndex(-1);
    setWageInput('');
    setEditNameInput('');
  };

  const saveName = async index => {
    if (!editNameInput.trim()) return Alert.alert('入力エラー', '名前を入力してください');
    const updated = users.map((u, i) => (i === index ? { ...u, name: editNameInput.trim(), wage: u.wage } : u));
    setUsers(updated);
    await saveUsers(updated);
    setEditingIndex(-1);
    setEditNameInput('');
    setWageInput('');
  };

  const removeUser = async index => {
    Alert.alert(
      '確認',
      '本当にこのユーザーを削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: async () => {
            const updated = users.filter((_, i) => i !== index);
            setUsers(updated);
            await saveUsers(updated);
            setEditingIndex(-1);
          }
        }
      ]
    );
  };

  return (
    <View style={tw`flex-1 flex-row bg-gray-100`}>
      {/* 左カラム: 登録フォーム (60%) */}
      <ScrollView style={{ width: width * 0.6, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-4`}>ユーザー登録</Text>
        <TextInput
          style={tw`border border-gray-300 p-2 mb-4 rounded`}
          placeholder="ユーザー名を入力"
          value={name}
          onChangeText={setName}
        />
        <View style={tw`items-center mb-6`}>
          <View style={{ width: '50%' }}>
            <Button
              title={loading ? '...' : '追加'}
              onPress={handleAdd}
              disabled={loading}
            />
          </View>
        </View>
      </ScrollView>

      {/* 右カラム: 登録ユーザー一覧 (40%) */}
      <ScrollView style={{ width: width * 0.4, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-4`}>登録ユーザー一覧</Text>
        {users.length === 0 ? (
          <Text style={tw`text-center text-gray-500`}>ユーザーがまだいません</Text>
        ) : (
          users.map((user, idx) => (
            <View key={idx} style={tw`bg-white p-3 rounded mb-4`}>              
              <TouchableOpacity onPress={() => {
                setEditingIndex(idx);
                setEditNameInput(user.name);
                setWageInput(user.wage ? String(user.wage) : '');
              }}>
                <Text style={tw`text-lg font-semibold`}>{user.name}</Text>
              </TouchableOpacity>
              {user.wage != null && (
                <Text style={tw`text-base text-gray-600 mb-2`}>時給: ¥{user.wage}/h</Text>
              )}
              {editingIndex === idx && (
                <View style={tw`mt-2`}>                  
                  <TextInput
                    style={tw`border border-gray-300 p-2 mb-2 rounded`}
                    placeholder="名前を変更"
                    value={editNameInput}
                    onChangeText={setEditNameInput}
                  />
                  <TextInput
                    style={tw`border border-gray-300 p-2 mb-2 rounded`}
                    placeholder="時給を入力"
                    keyboardType="numeric"
                    value={wageInput}
                    onChangeText={setWageInput}
                  />
                  <View style={tw`flex-row justify-between`}>                    
                    <View style={{ width: '30%' }}>
                      <Button title="保存" onPress={() => saveWage(idx)} />
                    </View>
                    <View style={{ width: '30%' }}>
                      <Button title="情報変更" onPress={() => saveName(idx)} />
                    </View>
                    <View style={{ width: '30%' }}>
                      <Button title="除去" color="red" onPress={() => removeUser(idx)} />
                    </View>
                  </View>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
