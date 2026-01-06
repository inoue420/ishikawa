// screens/phone/ClientInfoScreen.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';
import { getAuth } from 'firebase/auth';
import { findEmployeeByIdOrEmail, fetchClients, setClient, deleteClient } from '../../firestoreService';

const CLOSE_DAY = 'day';
const CLOSE_EOM = 'eom';

const formatCloseLabel = (c) => {
  if (!c) return '';
  if (c.closeType === CLOSE_EOM) return '末締め';
  const d = Number(c.closeDay);
  if (Number.isFinite(d) && d >= 1 && d <= 31) return `毎月${d}日`;
  return '未設定';
};

export default function ClientInfoScreen() {
  const [me, setMe] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [closeType, setCloseType] = useState(CLOSE_DAY);
  const [closeDay, setCloseDay] = useState('25');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const a = getAuth();
        const email = a?.currentUser?.email || null;
        const emp = email ? await findEmployeeByIdOrEmail(String(email).toLowerCase()) : null;
        if (mounted) setMe(emp);
      } catch (e) {
        console.warn(e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchClients();
      setClients(list);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '顧客一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setName('');
    setCloseType(CLOSE_DAY);
    setCloseDay('25');
  }, []);

  const onPickEdit = useCallback((c) => {
    setEditingId(c.id);
    setName(String(c.name || ''));
    setCloseType(c.closeType === CLOSE_EOM ? CLOSE_EOM : CLOSE_DAY);
    setCloseDay(c.closeType === CLOSE_EOM ? '25' : (c.closeDay != null ? String(c.closeDay) : '25'));
  }, []);

  const onSave = useCallback(async () => {
    const n = String(name || '').trim().replace(/\s/g, ' ');
    if (!n) return Alert.alert('入力エラー', '顧客名を入力してください');

    let dayNum = null;
    if (closeType === CLOSE_DAY) {
      dayNum = Number(closeDay);
      if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) {
        return Alert.alert('入力エラー', '締め日は 1〜31 の数値で入力してください');
      }
    }

    try {
      await setClient(
        editingId,
        { name: n, closeType, closeDay: closeType === CLOSE_DAY ? dayNum : null },
        { by: me?.id ?? null, byName: me?.name ?? null }
      );
      await reload();
      resetForm();
      Alert.alert('完了', '顧客情報を保存しました');
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '顧客情報の保存に失敗しました');
    }
  }, [name, closeType, closeDay, editingId, me, reload, resetForm]);

  const onDelete = useCallback((c) => {
    Alert.alert(
      '削除確認',
      `「${c.name}」を削除しますか？\n※プロジェクト側の顧客名（clientName）は消えません。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteClient(c.id);
              await reload();
              if (editingId === c.id) resetForm();
            } catch (e) {
              console.error(e);
              Alert.alert('エラー', '削除に失敗しました');
            }
          },
        },
      ]
    );
  }, [reload, editingId, resetForm]);

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c => String(c.nameLower || c.name || '').toLowerCase().includes(q));
  }, [clients, query]);

  return (
    <SafeAreaView edges={['top']} style={tw`flex-1 bg-white`}>
      <ScrollView contentContainerStyle={tw`p-4`}>
        <Text style={tw`text-xl font-bold mb-3`}>顧客情報</Text>

        <View style={tw`border rounded p-3 mb-4 bg-gray-50`}>
          <Text style={tw`font-bold mb-2`}>{editingId ? '顧客編集' : '顧客追加'}</Text>

          <Text style={tw`mb-1`}>顧客名</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="例：○○建設"
            style={tw`border rounded p-2 mb-3 bg-white`}
          />

          <Text style={tw`mb-1`}>締め日</Text>
          <View style={tw`flex-row mb-2`}>
            <TouchableOpacity
              onPress={() => setCloseType(CLOSE_DAY)}
              activeOpacity={0.7}
              style={tw`${closeType === CLOSE_DAY ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'} border rounded px-3 py-2 mr-2`}
            >
              <Text>{closeType === CLOSE_DAY ? '● ' : '○ '}毎月◯日</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setCloseType(CLOSE_EOM)}
              activeOpacity={0.7}
              style={tw`${closeType === CLOSE_EOM ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'} border rounded px-3 py-2`}
            >
              <Text>{closeType === CLOSE_EOM ? '● ' : '○ '}末締め</Text>
            </TouchableOpacity>
          </View>

          {closeType === CLOSE_DAY && (
            <View style={tw`flex-row items-center mb-3`}>
              <TextInput
                value={closeDay}
                onChangeText={setCloseDay}
                placeholder="25"
                keyboardType="numeric"
                style={tw`border rounded p-2 w-24 bg-white`}
              />
              <Text style={tw`ml-2`}>日</Text>
            </View>
          )}

          <View style={tw`flex-row`}>
            <TouchableOpacity
              onPress={onSave}
              activeOpacity={0.8}
              style={tw`bg-blue-600 rounded px-4 py-2 mr-2`}
            >
              <Text style={tw`text-white font-bold`}>保存</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={resetForm}
              activeOpacity={0.8}
              style={tw`bg-gray-200 rounded px-4 py-2`}
            >
              <Text>クリア</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={tw`font-bold mb-2`}>顧客一覧</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="顧客名で検索"
          style={tw`border rounded p-2 mb-3 bg-white`}
        />

        {loading ? (
          <View style={tw`py-8`}>
            <ActivityIndicator />
          </View>
        ) : (
          filtered.map(c => (
            <View key={c.id} style={tw`border border-gray-200 rounded p-3 mb-2`}>
              <Text style={tw`font-bold`}>{c.name}</Text>
              <Text style={tw`text-gray-700`}>締め日: {formatCloseLabel(c)}</Text>

              <View style={tw`flex-row mt-2`}>
                <TouchableOpacity
                  onPress={() => onPickEdit(c)}
                  activeOpacity={0.8}
                  style={tw`bg-gray-200 rounded px-3 py-2 mr-2`}
                >
                  <Text>編集</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onDelete(c)}
                  activeOpacity={0.8}
                  style={tw`bg-red-100 rounded px-3 py-2`}
                >
                  <Text style={tw`text-red-700`}>削除</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}