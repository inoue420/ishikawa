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
const STORAGE_KEY = '@project_list';

export default function ProjectRegisterScreen() {
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  // Inline edit state
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editClient, setEditClient] = useState('');
  const [editStart, setEditStart] = useState(new Date());
  const [editEnd, setEditEnd] = useState(new Date());
  const [showEditStart, setShowEditStart] = useState(false);
  const [showEditEnd, setShowEditEnd] = useState(false);

  // Load projects
  useEffect(() => {
    (async () => {
      try {
        const data = await AsyncStorage.getItem(STORAGE_KEY);
        setProjects(data ? JSON.parse(data) : []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const saveProjects = async list => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error(e);
    }
  };

  // Add new project
  const handleAdd = async () => {
    if (!name.trim()) return Alert.alert('入力エラー', 'プロジェクト名を入力してください');
    if (!clientName.trim()) return Alert.alert('入力エラー', '顧客名を入力してください');
    setLoading(true);
    const newProj = { name: name.trim(), clientName: clientName.trim(), start: startDate.toISOString(), end: endDate.toISOString() };
    const updated = [...projects, newProj];
    setProjects(updated);
    await saveProjects(updated);
    Alert.alert('成功', 'プロジェクトを追加しました');
    setName(''); setClientName(''); setStartDate(new Date()); setEndDate(new Date());
    setLoading(false);
  };

  // Inline save edit
  const handleSaveEdit = async idx => {
    if (!editClient.trim()) return Alert.alert('入力エラー', '顧客名を入力してください');
    setLoading(true);
    const updated = projects.map((p, i) => i === idx
      ? { ...p, clientName: editClient.trim(), start: editStart.toISOString(), end: editEnd.toISOString() }
      : p
    );
    setProjects(updated);
    await saveProjects(updated);
    Alert.alert('成功', 'プロジェクトを更新しました');
    setEditingIndex(-1);
    setLoading(false);
  };

  // Inline delete
  const handleDelete = idx => {
    Alert.alert('確認', 'プロジェクトを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: async () => {
        const updated = projects.filter((_, i) => i !== idx);
        setProjects(updated);
        await saveProjects(updated);
        Alert.alert('削除完了', 'プロジェクトを削除しました');
        setEditingIndex(-1);
      }}
    ]);
  };

  return (
    <View style={tw`flex-1 flex-row bg-gray-100`}>

      {/* 左カラム：新規追加フォーム (60%) */}
      <ScrollView style={{ width: width * 0.6, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-6`}>プロジェクト追加</Text>

        <Text style={tw`mb-2`}>プロジェクト名</Text>
        <TextInput style={tw`border border-gray-300 p-2 mb-4 rounded`} placeholder="プロジェクト名" value={name} onChangeText={setName} />

        <Text style={tw`mb-2`}>顧客名</Text>
        <TextInput style={tw`border border-gray-300 p-2 mb-4 rounded`} placeholder="顧客名" value={clientName} onChangeText={setClientName} />

        <Text style={tw`mb-2 font-semibold`}>開始予定日</Text>
        <TouchableOpacity style={tw`bg-white p-4 rounded mb-4 border border-gray-300`} onPress={() => setShowStartPicker(true)}>
          <Text>{startDate.toLocaleDateString()}</Text>
        </TouchableOpacity>
        {showStartPicker && <DateTimePicker value={startDate} mode="date" display={Platform.OS==='ios'?'spinner':'default'} onChange={(_,d)=>{setShowStartPicker(false); if(d) setStartDate(d);}} />}

        <Text style={tw`mb-2 font-semibold`}>終了予定日</Text>
        <TouchableOpacity style={tw`bg-white p-4 rounded mb-6 border border-gray-300`} onPress={() => setShowEndPicker(true)}>
          <Text>{endDate.toLocaleDateString()}</Text>
        </TouchableOpacity>
        {showEndPicker && <DateTimePicker value={endDate} mode="date" display={Platform.OS==='ios'?'spinner':'default'} onChange={(_,d)=>{setShowEndPicker(false); if(d) setEndDate(d);}} />}

        <View style={tw`items-center mb-6`}>
          <View style={{ width: '50%' }}>
            <Button title={loading?'追加中...':'追加'} onPress={handleAdd} disabled={loading} />
          </View>
        </View>
      </ScrollView>

      {/* 右カラム：プロジェクト一覧＆インライン編集 (40%) */}
      <ScrollView style={{ width: width * 0.4, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-4`}>登録プロジェクト一覧</Text>
        {projects.length === 0 ? (
          <Text style={tw`text-center text-gray-500`}>プロジェクトがありません</Text>
        ) : (
          projects.map((proj, idx) => (
            <View key={idx} style={tw`bg-white p-3 rounded mb-2`}>              
              <TouchableOpacity onPress={() => {
                setEditingIndex(idx);
                setEditClient(proj.clientName);
                setEditStart(new Date(proj.start));
                setEditEnd(new Date(proj.end));
              }}>
                <Text style={tw`font-bold`}>{proj.name}</Text>
                <Text>顧客: {proj.clientName}</Text>
                <Text>開始: {new Date(proj.start).toLocaleDateString()}</Text>
                <Text>終了: {new Date(proj.end).toLocaleDateString()}</Text>
              </TouchableOpacity>

              {editingIndex === idx && (
                <View style={tw`mt-2 bg-gray-50 p-2 rounded`}>                  
                  <Text style={tw`mb-2`}>顧客名</Text>
                  <TextInput style={tw`border border-gray-300 p-2 mb-2 rounded`} value={editClient} onChangeText={setEditClient} />
                  <Text style={tw`mb-2`}>開始予定日</Text>
                  <TouchableOpacity style={tw`bg-white p-2 rounded mb-2 border border-gray-300`} onPress={() => setShowEditStart(true)}>
                    <Text>{new Date(editStart).toLocaleDateString()}</Text>
                  </TouchableOpacity>
                  {showEditStart && <DateTimePicker value={editStart} mode="date" display={Platform.OS==='ios'?'spinner':'default'} onChange={(_,d)=>{setShowEditStart(false); if(d) setEditStart(d);}} />}
                  <Text style={tw`mb-2`}>終了予定日</Text>
                  <TouchableOpacity style={tw`bg-white p-2 rounded mb-4 border border-gray-300`} onPress={() => setShowEditEnd(true)}>
                    <Text>{new Date(editEnd).toLocaleDateString()}</Text>
                  </TouchableOpacity>
                  {showEditEnd && <DateTimePicker value={editEnd} mode="date" display={Platform.OS==='ios'?'spinner':'default'} onChange={(_,d)=>{setShowEditEnd(false); if(d) setEditEnd(d);}} />}
                  <View style={tw`flex-row justify-between`}>                    
                    <View style={{ width: '45%' }}>
                      <Button title="保存" onPress={() => handleSaveEdit(idx)} />
                    </View>
                    <View style={{ width: '45%' }}>
                      <Button title="削除" color="red" onPress={() => handleDelete(idx)} />
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
