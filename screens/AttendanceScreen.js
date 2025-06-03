// screens/AttendanceScreen.js
import React, { useEffect, useState, useCallback, useContext } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Button,
  Alert,
  Dimensions,
  RefreshControl,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import tw from 'twrnc';
import { DateContext } from '../DateContext';
import {
  fetchUsers,
  fetchProjects,
  fetchAttendanceRecords,
  addAttendanceRecord,
  deleteAttendanceRecord,
} from '../firestoreService';

const { width } = Dimensions.get('window');

export default function AttendanceScreen() {
  const { date: selectedDate, setDate } = useContext(DateContext);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [records, setRecords] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // YYYY-MM-DD 形式の文字列を返すヘルパー
  const dateKey = (date) => date.toISOString().slice(0, 10);

  // Firestore からユーザー一覧・プロジェクト一覧・当日の出勤レコードを取得
  const loadData = useCallback(async () => {
    try {
      const [u, p, r] = await Promise.all([
        fetchUsers(),
        fetchProjects(),
        fetchAttendanceRecords(selectedDate),
      ]);
      setUsers(u);
      setProjects(p);
      setRecords(r);
      // 日付変更時は選択プロジェクト／ユーザーをリセット
      setSelectedProject('');
      setSelectedUsers([]);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', 'データの読み込みに失敗しました');
    }
  }, [selectedDate]);

  // 画面フォーカス時と selectedDate の変更時に再取得
  useFocusEffect(
    useCallback(() => {
      const fetchData = async () => {
        await loadData();
      };
      fetchData();
    }, [loadData])
  );
  useEffect(() => {
    loadData();
  }, [loadData]);

  // カレンダーで日付を選択したとき：DateContext 経由で state を更新
  const onDateChange = (_, d) => {
    // Android は選択後に自動で閉じる
    if (Platform.OS === 'android') setShowPicker(false);
    if (d) setDate(d);
  };

  // 出勤確定ボタン押下時：Firestore にレコードを追加
  const confirmAttendance = async () => {
    if (!selectedProject) {
      return Alert.alert('入力エラー', 'プロジェクトを選択してください');
    }
    if (!selectedUsers.length) {
      return Alert.alert('入力エラー', 'ユーザーを選択してください');
    }
    setLoading(true);
    try {
      await addAttendanceRecord({
        project: selectedProject,
        date: selectedDate,
        users: selectedUsers,
      });
      Alert.alert('成功', '出勤を確定しました');
      loadData();
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '出勤確定に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 編集ボタン押下時：該当レコードの内容をフォームにセット
  const editRecord = (rec) => {
    setSelectedProject(rec.project);
    setSelectedUsers(rec.users);
  };

  // 削除ボタン押下時：Firestore からレコードを削除
  const handleDelete = (rec) => {
    Alert.alert(
      '確認',
      `${rec.project} の当日の参加記録を削除しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAttendanceRecord(rec.id);
              loadData();
            } catch (e) {
              console.error(e);
              Alert.alert('削除エラー', '削除に失敗しました');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={tw`flex-1 bg-gray-100`}>
      {/* 日付表示＆カレンダー呼び出し */}
      <View style={tw`flex-row items-center mt-4 p-4 bg-white border-b border-gray-300`}>
        <TouchableOpacity style={tw`flex-1`} onPress={() => setShowPicker(true)}>
          <Text style={tw`text-lg`}>{dateKey(selectedDate)}</Text>
        </TouchableOpacity>
        <View style={tw`ml-2 w-1/3`}>
          <Button title="更新" onPress={loadData} />
        </View>
      </View>

      {/* カレンダーコンポーネント */}
      {showPicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}

      <View style={tw`flex-1 flex-row`}>
        {/* 左カラム：出勤確定フォーム */}
        <ScrollView style={{ width: width * 0.6, padding: 16 }}>
          <Text style={tw`text-2xl font-bold mb-4`}>出勤確定</Text>

          {/* プロジェクト選択 */}
          <ScrollView horizontal style={tw`mb-4`}>
            {projects.map((proj) => (
              <TouchableOpacity
                key={proj.id}
                style={tw`px-4 py-2 mr-2 rounded ${
                  selectedProject === proj.name ? 'bg-blue-500' : 'bg-gray-300'
                }`}
                onPress={() => {
                  setSelectedProject(proj.name);
                  setSelectedUsers([]);
                }}
              >
                <Text style={tw`text-white`}>{proj.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* ユーザー選択 */}
          <Text style={tw`mb-2 font-semibold`}>ユーザー</Text>
          <View style={tw`flex-row flex-wrap mb-6`}>
            {users.map((u) => (
              <TouchableOpacity
                key={u.id}
                style={tw`px-4 py-2 mr-2 mb-2 rounded ${
                  selectedUsers.includes(u.name) ? 'bg-blue-500' : 'bg-gray-300'
                }`}
                onPress={() => {
                  setSelectedUsers((sel) =>
                    sel.includes(u.name)
                      ? sel.filter((x) => x !== u.name)
                      : [...sel, u.name]
                  );
                }}
              >
                <Text style={tw`text-white`}>{u.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 確定ボタン */}
          <View style={tw`items-center mb-6`}>
            <View style={{ width: '50%' }}>
              <Button
                title={loading ? '...' : '確定'}
                onPress={confirmAttendance}
                disabled={loading}
              />
            </View>
          </View>
        </ScrollView>

        {/* 右カラム：参加状況リスト */}
        <ScrollView
          style={{ width: width * 0.4, padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} />}
        >
          <Text style={tw`text-2xl font-bold mb-4`}>参加状況</Text>
          {records.map((rec) => (
            <View key={rec.id} style={tw`border border-gray-300 rounded mb-4 p-3`}>
              <Text style={tw`text-lg font-semibold mb-2`}>{rec.project}</Text>
              {rec.users.length ? (
                rec.users.map((u, i) => (
                  <Text key={i} style={tw`mb-1`}>
                    {u}
                  </Text>
                ))
              ) : (
                <Text style={tw`text-gray-500`}>参加者なし</Text>
              )}
              <View style={tw`flex-row justify-end mt-2`}>
                <View style={tw`mr-2`}>
                  <Button title="編集" onPress={() => editRecord(rec)} />
                </View>
                <Button title="削除" color="red" onPress={() => handleDelete(rec)} />
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
