// screens/ProjectRegisterScreen.js

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
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import tw from 'twrnc';

const { width } = Dimensions.get('window');

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
        setProjects(data ? JSON.parse(data) : []);
      } catch (e) {
        console.error('AsyncStorage load error', e);
      }
    })();
  }, []);

  // 保存
  const saveProjects = async (list) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('AsyncStorage save error', e);
    }
  };

  // 追加処理
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
    <View style={tw`flex-1 flex-row bg-gray-100`}>      
      {/* 左カラム：入力フォーム (60%) */}
      <ScrollView style={{ width: width * 0.6, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-6`}>プロジェクト登録</Text>

        <TextInput
          style={tw`border border-gray-300 p-2 mb-4 rounded`}
          placeholder="プロジェクト名"
          value={name}
          onChangeText={setName}
        />

        <Text style={tw`mb-2 font-semibold`}>開始予定日</Text>
        <TouchableOpacity
          style={tw`bg-white p-4 rounded mb-4 border border-gray-300`}
          onPress={() => setShowStartPicker(true)}
        >
          <Text>{startDate.toLocaleDateString()}</Text>
        </TouchableOpacity>
        {showStartPicker && (
          <DateTimePicker
            value={startDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, selected) => {
              setShowStartPicker(false);
              if (selected) setStartDate(selected);
            }}
          />
        )}

        <Text style={tw`mb-2 font-semibold`}>終了予定日</Text>
        <TouchableOpacity
          style={tw`bg-white p-4 rounded mb-4 border border-gray-300`}
          onPress={() => setShowEndPicker(true)}
        >
          <Text>{endDate.toLocaleDateString()}</Text>
        </TouchableOpacity>
        {showEndPicker && (
          <DateTimePicker
            value={endDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, selected) => {
              setShowEndPicker(false);
              if (selected) setEndDate(selected);
            }}
          />
        )}

        <View style={tw`items-center mt-4 mb-6`}>
          <View style={{ width: '50%' }}>
            <Button
              title={loading ? '追加中...' : '追加'}
              onPress={handleAdd}
              disabled={loading}
            />
          </View>
        </View>
      </ScrollView>

      {/* 右カラム：登録プロジェクト一覧 (40%) */}
      <ScrollView style={{ width: width * 0.4, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-4`}>登録プロジェクト一覧</Text>
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
    </View>
  );
}
