// screens/AttendanceScreen.js

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Button, Alert, FlatList } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import tw from 'twrnc';

export default function AttendanceScreen() {
  const RECORD_KEY = '@attendance_records';
  const USER_KEY = '@user_list';

  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    try {
      const userData = await AsyncStorage.getItem(USER_KEY);
      setUsers(userData ? JSON.parse(userData) : []);
      const recData = await AsyncStorage.getItem(RECORD_KEY);
      setRecords(recData ? JSON.parse(recData) : []);
    } catch (e) {
      console.error('AsyncStorage error', e);
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
    if (!selectedUser) {
      Alert.alert('入力エラー', 'ユーザーを選択してください');
      return;
    }
    setLoading(true);
    const timestamp = new Date().toISOString();
    const newRecord = { user: selectedUser, type, timestamp };
    const updated = [newRecord, ...records];
    setRecords(updated);
    await saveRecords(updated);
    Alert.alert(
      '成功',
      type === 'checkin' ? '出勤を記録しました' : '退勤を記録しました'
    );
    setLoading(false);
  };

  const renderItem = ({ item }) => (
    <View style={tw`flex-row justify-between bg-white p-3 rounded mb-2`}>
      <Text>
        {item.user} - {item.type === 'checkin' ? '出勤' : '退勤'}
      </Text>
      <Text>{new Date(item.timestamp).toLocaleString()}</Text>
    </View>
  );

  return (
    <View style={tw`flex-1 bg-gray-100 p-4`}>
      <Text style={tw`text-xl font-bold mb-4`}>工数管理 (出退勤)</Text>

      <View style={tw`bg-white p-4 rounded mb-4`}>
        <Text style={tw`mb-2`}>ユーザー</Text>
        <View style={tw`border border-gray-300 rounded`}>
          <Picker
            selectedValue={selectedUser}
            onValueChange={(val) => setSelectedUser(val)}
          >
            <Picker.Item label="選択してください" value="" />
            {users.map((u, idx) => (
              <Picker.Item key={idx} label={u} value={u} />
            ))}
          </Picker>
        </View>
      </View>

      <View style={tw`flex-row justify-between mb-4`}>
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
      <FlatList
        data={records}
        keyExtractor={(_, i) => i.toString()}
        renderItem={renderItem}
      />
    </View>
  );
}
