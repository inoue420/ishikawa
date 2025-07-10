// screens/ProjectRegisterScreen.js
import React, { useEffect, useState, useCallback } from 'react';
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
  RefreshControl,
} from 'react-native';
import tw from 'twrnc';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  fetchProjects,
  setProject,
  deleteProject,
} from '../../firestoreService';

const { width } = Dimensions.get('window');

export default function ProjectRegisterScreen() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [editingIndex, setEditingIndex] = useState(-1);
  const [editClient, setEditClient] = useState('');
  const [editStart, setEditStart] = useState(new Date());
  const [editEnd, setEditEnd] = useState(new Date());
  const [showEditStart, setShowEditStart] = useState(false);
  const [showEditEnd, setShowEditEnd] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchProjects();
      setProjects(list);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', 'プロジェクト一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProjects();
    setRefreshing(false);
  }, [loadProjects]);

  const handleAdd = async () => {
    if (!name.trim()) return Alert.alert('入力エラー', 'プロジェクト名を入力してください');
    if (!clientName.trim()) return Alert.alert('入力エラー', '顧客名を入力してください');
    setLoading(true);
    try {
      await setProject(null, {
        name: name.trim(),
        clientName: clientName.trim(),
        startDate,
        endDate,
      });
      setName('');
      setClientName('');
      setStartDate(new Date());
      setEndDate(new Date());
      await loadProjects();
      Alert.alert('成功', 'プロジェクトを追加しました');
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', 'プロジェクトの追加に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (idx) => {
    const proj = projects[idx];
    if (!proj) return;
    if (!editClient.trim()) return Alert.alert('入力エラー', '顧客名を入力してください');
    setLoading(true);
    try {
      await setProject(proj.id, {
        name: proj.name,
        clientName: editClient.trim(),
        startDate: editStart,
        endDate: editEnd,
      });
      setEditingIndex(-1);
      await loadProjects();
      Alert.alert('成功', 'プロジェクトを更新しました');
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', 'プロジェクトの更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (idx) => {
    const proj = projects[idx];
    if (!proj) return;
    Alert.alert('確認', 'プロジェクトを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await deleteProject(proj.id);
            setEditingIndex(-1);
            await loadProjects();
            Alert.alert('削除完了', 'プロジェクトを削除しました');
          } catch (e) {
            console.error(e);
            Alert.alert('エラー', '削除に失敗しました');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={tw`flex-1 flex-row bg-gray-100`}>
      {/* 左カラム：新規追加フォーム (60%) */}
      <ScrollView style={{ width: width * 0.6, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-6`}>プロジェクト追加</Text>

        <Text style={tw`mb-2`}>プロジェクト名</Text>
        <TextInput style={tw`border border-gray-300 p-2 mb-4 rounded`} value={name} onChangeText={setName} placeholder="プロジェクト名" />

        <Text style={tw`mb-2`}>顧客名</Text>
        <TextInput style={tw`border border-gray-300 p-2 mb-4 rounded`} value={clientName} onChangeText={setClientName} placeholder="顧客名" />

        <Text style={tw`mb-2 font-semibold`}>開始予定日</Text>
        <TouchableOpacity style={tw`bg-white p-4 rounded mb-4 border border-gray-300`} onPress={() => setShowStartPicker(true)}>
          <Text>{startDate.toLocaleDateString()}</Text>
        </TouchableOpacity>
        {showStartPicker && (
          <DateTimePicker value={startDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_, d) => { setShowStartPicker(false); if (d) setStartDate(d); }} />
        )}

        <Text style={tw`mb-2 font-semibold`}>終了予定日</Text>
        <TouchableOpacity style={tw`bg-white p-4 rounded mb-6 border border-gray-300`} onPress={() => setShowEndPicker(true)}>
          <Text>{endDate.toLocaleDateString()}</Text>
        </TouchableOpacity>
        {showEndPicker && (
          <DateTimePicker value={endDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_, d) => { setShowEndPicker(false); if (d) setEndDate(d); }} />
        )}

        <View style={tw`items-center mb-6`}>
          <View style={{ width: '50%' }}>
            <Button title={loading ? '追加中...' : '追加'} onPress={handleAdd} disabled={loading} />
          </View>
        </View>
      </ScrollView>

      {/* 右カラム：プロジェクト一覧 */}
      <ScrollView
        style={{ width: width * 0.4, padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={tw`text-2xl font-bold mb-4`}>登録プロジェクト一覧</Text>
        {projects.length === 0 ? (
          <Text style={tw`text-center text-gray-500`}>プロジェクトがありません</Text>
        ) : (
          projects.map((proj, idx) => (
            <View key={proj.id} style={tw`bg-white p-3 rounded mb-2`}>
              <TouchableOpacity onPress={() => {
                setEditingIndex(idx);
                setEditClient(proj.clientName);
                setEditStart(proj.startDate.toDate ? proj.startDate.toDate() : new Date(proj.startDate));
                setEditEnd(proj.endDate.toDate ? proj.endDate.toDate() : new Date(proj.endDate));
              }}>
                <Text style={tw`font-bold`}>{proj.name}</Text>
                <Text>顧客: {proj.clientName}</Text>
                <Text>開始: {new Date(proj.startDate.toDate ? proj.startDate.toDate() : proj.startDate).toLocaleDateString()}</Text>
                <Text>終了: {new Date(proj.endDate.toDate ? proj.endDate.toDate() : proj.endDate).toLocaleDateString()}</Text>
              </TouchableOpacity>

              {editingIndex === idx && (
                <View style={tw`mt-2 bg-gray-50 p-2 rounded`}>
                  <Text style={tw`mb-2`}>顧客名</Text>
                  <TextInput style={tw`border border-gray-300 p-2 mb-2 rounded`} value={editClient} onChangeText={setEditClient} />
                  <Text style={tw`mb-2`}>開始予定日</Text>
                  <TouchableOpacity style={tw`bg-white p-2 rounded mb-2 border border-gray-300`} onPress={() => setShowEditStart(true)}>
                    <Text>{editStart.toLocaleDateString()}</Text>
                  </TouchableOpacity>
                  {showEditStart && (
                    <DateTimePicker value={editStart} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_, d) => { setShowEditStart(false); if (d) setEditStart(d); }} />
                  )}

                  <Text style={tw`mb-2`}>終了予定日</Text>
                  <TouchableOpacity style={tw`bg-white p-2 rounded mb-4 border border-gray-300`} onPress={() => setShowEditEnd(true)}>
                    <Text>{editEnd.toLocaleDateString()}</Text>
                  </TouchableOpacity>
                  {showEditEnd && (
                    <DateTimePicker value={editEnd} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_, d) => { setShowEditEnd(false); if (d) setEditEnd(d); }} />
                  )}

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
