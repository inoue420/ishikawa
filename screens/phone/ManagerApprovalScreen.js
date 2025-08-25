// screens/phone/ManagerApprovalScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, Button, FlatList, Alert, TextInput } from 'react-native';
import tw from 'twrnc';
import { fetchPendingForManager, approvePunch, rejectPunch } from '../../firestoreService';

export default function ManagerApprovalScreen({ route }) {
  const managerLoginId = route.params?.managerLoginId ?? '';
  const today = new Date().toISOString().slice(0,10);
  const [start, setStart] = useState(today);
  const [end, setEnd]     = useState(today);
  const [rows, setRows]   = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
    const list = await fetchPendingForManager(managerLoginId, { startDate: start, endDate: end });
    console.log('[ManagerApproval] fetched count =', list.length);
    if (list.length === 0) console.log('[ManagerApproval] empty; check param/date/index');
      setRows(list);
    } catch (e) {
      console.error(e);
      Alert.alert('取得エラー', '承認待ちの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

useEffect(() => {
  console.log('[ManagerApproval] param managerLoginId =', managerLoginId);
  load();
}, []);

  const onApprove = async (id) => {
    try {
      await approvePunch(id, managerLoginId);
      load();
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '承認に失敗しました');
    }
  };

  const onReject = async (id) => {
    // 簡易に confirm。理由入力を付けたい場合はモーダル化してください
    Alert.prompt?.('却下理由', '', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '却下', style: 'destructive', onPress: async (note) => {
          try {
            await rejectPunch(id, managerLoginId, note ?? '');
            load();
          } catch (e) {
            console.error(e);
            Alert.alert('エラー', '却下に失敗しました');
          }
        }
      }
    ]) || (async () => { // Android代替
      try {
        await rejectPunch(id, managerLoginId, '');
        load();
      } catch (e) {
        console.error(e);
        Alert.alert('エラー', '却下に失敗しました');
      }
    })();
  };

  return (
    <View style={tw`flex-1 bg-gray-100`}>
      <View style={tw`p-4 bg-white border-b border-gray-300`}>
        <Text style={tw`text-lg font-semibold`}>承認待ち一覧</Text>
        <View style={tw`flex-row mt-3`}>
          <TextInput
            style={tw`flex-1 border border-gray-300 rounded px-2 py-2 mr-2`}
            value={start}
            onChangeText={setStart}
            placeholder="開始(YYYY-MM-DD)"
          />
          <TextInput
            style={tw`flex-1 border border-gray-300 rounded px-2 py-2`}
            value={end}
            onChangeText={setEnd}
            placeholder="終了(YYYY-MM-DD)"
          />
        </View>
        <View style={tw`mt-2`}>
          <Button title={loading ? '更新中…' : '更新'} onPress={load} disabled={loading}/>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={tw`p-4`}
        renderItem={({ item }) => (
          <View style={tw`bg-white rounded border border-gray-200 p-3 mb-3`}>
            <Text style={tw`text-sm text-gray-600`}>
              {item.date} / {item.type === 'in' ? '出勤' : '退勤'}
            </Text>
            <Text style={tw`text-base mt-1`}>
              {item.employeeName ?? item.employeeId}（{item.affiliation ?? '-'}）            </Text>
            <View style={tw`flex-row mt-2`}>
              <View style={tw`mr-2`}>
                <Button title="承認" onPress={() => onApprove(item.id)} />
              </View>
              <Button color="red" title="却下" onPress={() => onReject(item.id)} />
            </View>
          </View>
        )}
      />
    </View>
  );
}
