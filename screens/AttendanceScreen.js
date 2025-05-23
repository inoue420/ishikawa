// screens/AttendanceScreen.js

import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, Button, Alert, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import tw from 'twrnc';

export default function AttendanceScreen() {
  const USER_KEY = '@user_list';
  const PROJECT_KEY = '@project_list';
  const RECORD_KEY = '@attendance_records';

  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  const [showUserPicker, setShowUserPicker] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const loadData = async () => {
    try {
      const userData = await AsyncStorage.getItem(USER_KEY);
      setUsers(userData ? JSON.parse(userData) : []);
      const projectData = await AsyncStorage.getItem(PROJECT_KEY);
      setProjects(projectData ? JSON.parse(projectData) : []);
      const recData = await AsyncStorage.getItem(RECORD_KEY);
      setRecords(recData ? JSON.parse(recData) : []);
    } catch (e) {
      console.error('AsyncStorage load error', e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const saveRecords = async (list) => {
    try {
      await AsyncStorage.setItem(RECORD_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('AsyncStorage save error', e);
    }
  };

  const handleCheck = async (type) => {
    if (!selectedUser) return Alert.alert('入力エラー', 'ユーザーを選択してください');
    if (!selectedProject) return Alert.alert('入力エラー', 'プロジェクトを選択してください');

    setLoading(true);
    const timestamp = new Date().toISOString();
    const newRecord = { user: selectedUser, project: selectedProject, type, timestamp };
    const updated = [newRecord, ...records];
    setRecords(updated);
    await saveRecords(updated);
    Alert.alert('成功', type === 'checkin' ? '出勤を記録しました' : '退勤を記録しました');
    setLoading(false);
  };

  return (
    <ScrollView contentContainerStyle={tw`flex-grow bg-gray-100 p-4`}>
      <Text style={tw`text-xl font-bold mb-4`}>工数管理 (出退勤)</Text>

      {/* ユーザー選択 */}
      <View style={tw`bg-white p-4 rounded mb-4`}>        
        <Text style={tw`mb-2 font-semibold`}>ユーザー</Text>
        <TouchableOpacity
          style={tw`border border-gray-300 rounded p-2 bg-gray-50`}
          onPress={() => setShowUserPicker(true)}
        >
          <Text>{selectedUser || 'タップして選択'}</Text>
        </TouchableOpacity>
        {showUserPicker && (
          <Picker
            selectedValue={selectedUser}
            onValueChange={(value) => {
              setSelectedUser(value);
              setShowUserPicker(false);
            }}
          >
            <Picker.Item label="選択してください" value="" />
            {users.map((u, i) => <Picker.Item key={i} label={u} value={u} />)}
          </Picker>
        )}
      </View>

      {/* プロジェクト選択 */}
      <View style={tw`bg-white p-4 rounded mb-4`}>        
        <Text style={tw`mb-2 font-semibold`}>プロジェクト</Text>
        <TouchableOpacity
          style={tw`border border-gray-300 rounded p-2 bg-gray-50`}
          onPress={() => setShowProjectPicker(true)}
        >
          <Text>{selectedProject || 'タップして選択'}</Text>
        </TouchableOpacity>
        {showProjectPicker && (
          <Picker
            selectedValue={selectedProject}
            onValueChange={(value) => {
              setSelectedProject(value);
              setShowProjectPicker(false);
            }}
          >
            <Picker.Item label="選択してください" value="" />
            {projects.map((p, i) => <Picker.Item key={i} label={p.name} value={p.name} />)}
          </Picker>
        )}
      </View>

      {/* ボタン */}
      <View style={tw`flex-row justify-between mb-6`}>        
        <Button
          title={loading ? '...' : '出勤記録'}
          onPress={() => handleCheck('checkin')}
          disabled={loading}
        />
        <Button
          title={loading ? '...' : '退勤記録'}
          onPress={() => handleCheck('checkout')}
          disabled={loading}
        />
      </View>

      <Text style={tw`text-lg font-semibold mb-2`}>履歴</Text>
      {records.length === 0 ? (
        <Text style={tw`text-center text-gray-500`}>記録がありません</Text>
      ) : (
        records.map((item, idx) => (
          <View key={idx} style={tw`bg-white p-3 rounded mb-2`}>            
            <Text style={tw`font-medium`}>{item.user} / {item.project} - {item.type === 'checkin' ? '出勤' : '退勤'}</Text>
            <Text style={tw`text-sm text-gray-600`}>{new Date(item.timestamp).toLocaleString()}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}
