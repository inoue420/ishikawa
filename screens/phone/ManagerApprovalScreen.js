// screens/phone/ManagerApprovalScreen.js
import React, { useEffect, useState, useContext } from 'react';
import { View, Text, Button, FlatList, TouchableOpacity, Alert } from 'react-native';
import tw from 'twrnc';
import { DateContext } from '../../DateContext';
import { fetchPendingForManager, approvePunch, rejectPunch } from '../../firestoreService';

export default function ManagerApprovalScreen({ route }) {
  const managerLoginId = route.params?.managerLoginId ?? '';
  const { date: selectedDate } = useContext(DateContext);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [methodMap, setMethodMap] = useState({}); // { [attendanceId]: 'in-person'|'phone'|'video' }

  const dateKey = d => d.toISOString().slice(0, 10);

  const load = async () => {
    setLoading(true);
    try {
      // その日の自分の部下の承認待ちを取得（サービス側でフィルタ）
      const list = await fetchPendingForManager(managerLoginId, dateKey(selectedDate));
      const data = (list ?? []).map(r => ({
        ...r,
        _ts: r?.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp),
      })).sort((a, b) => (a._ts?.getTime?.() ?? 0) - (b._ts?.getTime?.() ?? 0));
      setRows(data);
    } catch (e) {
      console.log('[ManagerApproval] load error', e);
      Alert.alert('読み込みエラー', '承認対象の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [selectedDate, managerLoginId]);

  const onApprove = async (id) => {
    try {
      const method = methodMap[id];
      await approvePunch(id, managerLoginId, method); // 承認方法と承認時刻を保存（firestoreService 側で対応）
      await load();
    } catch (e) {
      console.log('[ManagerApproval] approve error', e);
      Alert.alert('エラー', '承認に失敗しました。');
    }
  };

  const onReject = async (id) => {
    try {
      await rejectPunch(id, managerLoginId);
      await load();
    } catch (e) {
      console.log('[ManagerApproval] reject error', e);
      Alert.alert('エラー', '却下に失敗しました。');
    }
  };

  const Pill = ({ active, label, onPress }) => (
    <TouchableOpacity
      onPress={onPress}
      style={tw`px-3 py-1 mr-2 rounded-full ${active ? 'bg-blue-600' : 'bg-gray-200'}`}>
      <Text style={tw`${active ? 'text-white' : 'text-gray-800'}`}>{label}</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }) => {
    const timeStr = item?._ts
      ? `${String(item._ts.getHours()).padStart(2, '0')}:${String(item._ts.getMinutes()).padStart(2, '0')}`
      : '--:--';

    const ac = item.alcoholCheck;
    const alreadyApproved = item.status === 'approved';
    const methodPicked = methodMap[item.id];
    const canApprove = !!(ac?.completed) && !!methodPicked && !alreadyApproved;

    const approvedInfo = item.managerApproval
      ? `（${item.managerApproval.method === 'in-person' ? '対面'
          : item.managerApproval.method === 'phone' ? '電話' : 'ビデオ通話'} 承認済）`
      : '';

    return (
      <View style={tw`mb-3 p-3 bg-white rounded-lg shadow`}>
        <Text style={tw`font-bold`}>
          {item.date ?? dateKey(selectedDate)} / {item.type === 'in' ? '出勤' : '退勤'} / {timeStr} {approvedInfo}
        </Text>
        <Text style={tw`mt-1`}>
          {item.employeeName ?? item.employeeId ?? item.employeeEmail ?? '-'}（{item.affiliation ?? '-'}）
        </Text>

        {/* アルコールチェック結果表示 */}
        <Text style={tw`mt-1`}>
          アルコール：
          {ac?.completed
            ? `検知器${ac.deviceUsed ? '使用' : '不使用'} / 酒気帯び${ac.intoxicated ? 'あり' : 'なし'}`
            : '未完了'}
        </Text>

        {/* 確認方法の選択 */}
        <View style={tw`flex-row mt-2`}>
          <Pill
            active={methodPicked === 'in-person'}
            label="対面"
            onPress={() => setMethodMap(prev => ({ ...prev, [item.id]: 'in-person' }))}
          />
          <Pill
            active={methodPicked === 'phone'}
            label="電話"
            onPress={() => setMethodMap(prev => ({ ...prev, [item.id]: 'phone' }))}
          />
          <Pill
            active={methodPicked === 'video'}
            label="ビデオ通話"
            onPress={() => setMethodMap(prev => ({ ...prev, [item.id]: 'video' }))}
          />
        </View>

        <View style={tw`mt-2 flex-row`}>
          <Button title="承認" disabled={!canApprove} onPress={() => onApprove(item.id)} />
          <View style={tw`w-3`} />
          <Button title="却下" color="red" onPress={() => onReject(item.id)} />
        </View>
      </View>
    );
  };

  return (
    <View style={tw`flex-1 bg-gray-50`}>
      <View style={tw`p-4 border-b border-gray-200 bg-white`}>
        <Text style={tw`text-lg font-semibold`}>出勤認証（{dateKey(selectedDate)}）</Text>
        {!!managerLoginId && <Text style={tw`text-xs text-gray-600`}>承認者: {managerLoginId}</Text>}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={tw`p-4`}
        renderItem={renderItem}
        ListEmptyComponent={!loading && (
          <Text style={tw`text-center text-gray-500 mt-8`}>承認待ちの申請はありません</Text>
        )}
      />
    </View>
  );
}
