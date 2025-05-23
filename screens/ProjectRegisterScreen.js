// screens/ProjectRegisterScreen.js

import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Button,
  Alert,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import tw from 'twrnc';

export default function ProjectRegisterScreen() {
  const STORAGE_KEY = '@project_list';
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [loading, setLoading] = useState(false);

  // データロード
  const loadProjects = async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      setProjects(data ? JSON.parse(data) : []);
    } catch (e) {
      console.error('AsyncStorage load error', e);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // プロジェクト保存
  const saveProjects = async (list) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('AsyncStorage save error', e);
    }
  };

  // プロジェクト追加
  const handleAdd = async () => {
    if (!name.trim()) {
      Alert.alert('入力エラー', 'プロジェクト名を入力してください');
      return;
    }
    setLoading(true);
    const newProject = {
      name: name.trim(),
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    };
    const updated = [...projects, newProject];
    setProjects(updated);
    await saveProjects(updated);
    Alert.alert('成功', 'プロジェクトを登録しました');
    setName('');
    setLoading(false);
  };

  return (
    <ScrollView contentContainerStyle={tw`flex-grow bg-gray-100 p-4`}>
      <Text style={tw`text-xl font-bold mb-4`}>プロジェクト登録</Text>

      <TextInput
        style={tw`border border-gray-300 p-2 mb-4 rounded`}
        placeholder="プロジェクト名"
        value={name}
        onChangeText={setName}
      />

      {/* 開始日 Picker 常時表示 */}
      <View style={tw`bg-white p-4 rounded mb-4`}>        
        <Text style={tw`mb-2`}>開始予定日</Text>
        <DateTimePicker
          value={startDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, d) => { if (d) setStartDate(d); }}
          style={tw`w-full`}
        />
      </View>

      {/* 終了日 Picker 常時表示 */}
      <View style={tw`bg-white p-4 rounded mb-4`}>        
        <Text style={tw`mb-2`}>終了予定日</Text>
        <DateTimePicker
          value={endDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, d) => { if (d) setEndDate(d); }}
          style={tw`w-full`}
        />
      </View>

      <Button
        title={loading ? '追加中...' : '追加'}
        onPress={handleAdd}
        disabled={loading}
      />

      <Text style={tw`text-lg font-semibold mt-6 mb-2`}>登録プロジェクト一覧</Text>
      {projects.length === 0 ? (
        <Text style={tw`text-center text-gray-500`}>プロジェクトがありません</Text>
      ) : (
        projects.map((item, idx) => (
          <View key={idx} style={tw`bg-white p-3 rounded mb-2`}>
            <Text style={tw`font-bold`}>{item.name}</Text>
            <Text>開始: {new Date(item.start).toLocaleDateString()}</Text>
            <Text>終了: {new Date(item.end).toLocaleDateString()}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}