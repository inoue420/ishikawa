// screens/AttendanceScreen.js

import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Button,
  Alert,
  FlatList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tw from 'twrnc';

export default function AttendanceScreen({ navigation }) {
  const STORAGE_KEY = '@attendance_records';
  const [records, setRecords] = useState([]);
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

  // 出勤/退勤処理
  const handleCheck = async (type) => {
    setLoading(true);
    const timestamp = new Date().toISOString();
    const newRecord = { type, timestamp };
    const updated = [newRecord, ...records];
    setRecords(updated);
    await saveRecords(updated);
    Alert.alert('成功', type === 'checkin' ? '出勤を記録しました' : '退勤を記録しました');
    setLoading(false);
  };

  // リストレンダー
  const renderItem = ({ item }) => (
    <View style={tw`flex-row justify-between bg-white p-3 rounded mb-2`}>
      <Text>{item.type === 'checkin' ? '出勤' : '退勤'}</Text>
      <Text>{new Date(item.timestamp).toLocaleString()}</Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={tw`p-4 bg-gray-100 flex-grow`}>
      <Text style={tw`text-xl font-bold mb-4`}>工数管理 (出退勤)</Text>

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
      {records.length === 0 ? (
        <Text style={tw`text-center text-gray-500`}>記録がありません</Text>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(_, index) => index.toString()}
          renderItem={renderItem}
        />
      )}

      <View style={tw`mt-6`}>
        <Button
          title="ログイン画面に戻る"
          onPress={() => navigation.navigate('Login')}
        />
      </View>
    </ScrollView>
  );
}
