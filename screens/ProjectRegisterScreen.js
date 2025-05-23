// screens/ProjectRegisterScreen.js

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, FlatList, Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import tw from 'twrnc';

export default function ProjectRegisterScreen() {
  const STORAGE_KEY = '@project_list';
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  // 初期ロード
  useEffect(() => {
    (async () => {
      try {
        const data = await AsyncStorage.getItem(STORAGE_KEY);
        if (data) setProjects(JSON.parse(data));
      } catch (e) {
        console.error('AsyncStorage load error', e);
      }
    })();
  }, []);

  const saveProjects = async (list) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('AsyncStorage save error', e);
    }
  };

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

  const renderItem = ({ item }) => (
    <View style={tw`bg-white p-3 rounded mb-2`}>
      <Text style={tw`font-bold`}>{item.name}</Text>
      <Text>開始: {new Date(item.start).toLocaleDateString()}</Text>
      <Text>終了: {new Date(item.end).toLocaleDateString()}</Text>
    </View>
  );

  return (
    <View style={tw`flex-1 bg-gray-100 p-4`}>
      <Text style={tw`text-xl font-bold mb-4`}>プロジェクト登録</Text>

      <TextInput
        style={tw`border border-gray-300 p-2 mb-2 rounded`}
        placeholder="プロジェクト名"
        value={name}
        onChangeText={setName}
      />

      <Button
        title={`開始日: ${startDate.toLocaleDateString()}`}
        onPress={() => setShowStartPicker(true)}
      />
      {showStartPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, d) => {
            setShowStartPicker(Platform.OS === 'ios');
            if (d) setStartDate(d);
          }}
        />
      )}

      <Button
        title={`終了日: ${endDate.toLocaleDateString()}`}
        onPress={() => setShowEndPicker(true)}
      />
      {showEndPicker && (
        <DateTimePicker
          value={endDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, d) => {
            setShowEndPicker(Platform.OS === 'ios');
            if (d) setEndDate(d);
          }}
        />
      )}

      <Button
        title={loading ? '追加中...' : '追加'}
        onPress={handleAdd}
        disabled={loading}
      />

      <Text style={tw`text-lg font-semibold mt-6 mb-2`}>登録プロジェクト一覧</Text>
      <FlatList
        data={projects}
        keyExtractor={(item, idx) => idx.toString()}
        renderItem={renderItem}
      />
    </View>
  );
}
