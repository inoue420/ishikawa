// screens/WIPScreen.js

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tw from 'twrnc';

export default function WIPScreen() {
  const STORAGE_KEY = '@wip_records';
  const [records, setRecords] = useState([]);
  const [site, setSite] = useState('');
  const [task, setTask] = useState('');
  const [assignee, setAssignee] = useState('');
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

  // レコード追加
  const handleAdd = async () => {
    if (!site.trim() || !task.trim() || !assignee.trim()) {
      Alert.alert('入力エラー', '現場名、作業項目、担当者をすべて入力してください');
      return;
    }
    setLoading(true);
    const timestamp = new Date().toISOString();
    const newRecord = { site, task, assignee, timestamp };
    const updated = [newRecord, ...records];
    setRecords(updated);
    await saveRecords(updated);
    Alert.alert('成功', 'WIP を追加しました');
    setSite('');
    setTask('');
    setAssignee('');
    setLoading(false);
  };

  // レンダラー
  const renderItem = ({ item }) => (
    <View style={tw`bg-white p-3 rounded mb-2`}>
      <Text style={tw`font-bold`}>{item.site}</Text>
      <Text>作業: {item.task}</Text>
      <Text>担当: {item.assignee}</Text>
      <Text style={tw`text-sm text-gray-500`}>
        {new Date(item.timestamp).toLocaleString()}
      </Text>
    </View>
  );

  return (
    <View style={tw`flex-1 bg-gray-100 p-4`}>
      <Text style={tw`text-xl font-bold mb-4`}>仕掛管理 (WIP)</Text>

      {/* 入力フォーム */}
      <TextInput
        style={tw`border border-gray-300 p-2 mb-2 rounded`}
        placeholder="現場名"
        value={site}
        onChangeText={setSite}
      />
      <TextInput
        style={tw`border border-gray-300 p-2 mb-2 rounded`}
        placeholder="作業項目"
        value={task}
        onChangeText={setTask}
      />
      <TextInput
        style={tw`border border-gray-300 p-2 mb-4 rounded`}
        placeholder="担当者"
        value={assignee}
        onChangeText={setAssignee}
      />
      <Button
        title={loading ? '...' : '追加'}
        onPress={handleAdd}
        disabled={loading}
      />

      {/* レコードリスト */}
      <Text style={tw`text-lg font-semibold mt-6 mb-2`}>履歴</Text>
      {records.length === 0 ? (
        <Text style={tw`text-center text-gray-500`}>記録がありません</Text>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(_, i) => i.toString()}
          renderItem={renderItem}
        />
      )}
    </View>
);
}
