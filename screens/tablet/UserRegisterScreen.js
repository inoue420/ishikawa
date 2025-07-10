// screens/UserRegisterScreen.js

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
  RefreshControl,
} from 'react-native';
import tw from 'twrnc';

// Firestore とのやりとりを行うサービス関数
import {
  fetchUsers,
  addUser,
  updateUser,
  deleteUser,
} from '../../firestoreService';

const { width } = Dimensions.get('window');

export default function UserRegisterScreen() {
  // Firestore 用の state
  const [users, setUsers] = useState([]);               // { id, name, wage? }
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 新規登録用フォーム
  const [nameInput, setNameInput] = useState('');

  // 編集中のユーザーインデックスとフォーム
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editNameInput, setEditNameInput] = useState('');
  const [wageInput, setWageInput] = useState('');

  // Firestore からユーザー一覧を取得
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchUsers(); // [{ id, name, role?, wage?, …}, …]
      setUsers(list);
    } catch (e) {
      console.error('Firestore fetchUsers error', e);
      Alert.alert('エラー', 'ユーザー一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  // 画面マウント時に取得
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // プル・トゥ・リフレッシュ
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadUsers();
    setRefreshing(false);
  }, [loadUsers]);

  // 新規ユーザー登録
  const handleAdd = async () => {
    if (!nameInput.trim()) {
      return Alert.alert('入力エラー', 'ユーザー名を入力してください');
    }

    setLoading(true);
    try {
      await addUser({ name: nameInput.trim() });
      setNameInput('');
      await loadUsers();
    } catch (e) {
      console.error('Firestore addUser error', e);
      Alert.alert('エラー', 'ユーザーの追加に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // ユーザー情報（名前＆時給）を保存
  const saveChanges = async (index) => {
    const user = users[index];
    if (!user) return;

    // 名前チェック
    if (!editNameInput.trim()) {
      return Alert.alert('入力エラー', '名前を入力してください');
    }
    // 時給チェック
    const wageValue = parseFloat(wageInput);
    if (isNaN(wageValue) || wageValue <= 0) {
      return Alert.alert('入力エラー', '有効な時給を入力してください');
    }

    setLoading(true);
    try {
      // Firestore で updateUser。フィールド名は "name" と "wage"。
      await updateUser(user.id, { name: editNameInput.trim(), wage: wageValue });
      setEditingIndex(-1);
      setEditNameInput('');
      setWageInput('');
      await loadUsers();
    } catch (e) {
      console.error('Firestore updateUser error', e);
      Alert.alert('エラー', 'ユーザー情報の更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // ユーザー削除
  const removeUser = (index) => {
    const user = users[index];
    if (!user) return;

    Alert.alert(
      '確認',
      '本当にこのユーザーを削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await deleteUser(user.id);
              setEditingIndex(-1);
              await loadUsers();
            } catch (e) {
              console.error('Firestore deleteUser error', e);
              Alert.alert('エラー', 'ユーザー削除に失敗しました');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={tw`flex-1 flex-row bg-gray-100`}>
      {/* 左カラム: 登録フォーム (60%) */}
      <ScrollView
        style={{ width: width * 0.6, padding: 16 }}
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        <Text style={tw`text-2xl font-bold mb-4`}>ユーザー登録</Text>

        <TextInput
          style={tw`border border-gray-300 p-2 mb-4 rounded`}
          placeholder="ユーザー名を入力"
          value={nameInput}
          onChangeText={setNameInput}
        />
        <View style={tw`items-center mb-6`}>
          <View style={{ width: '50%' }}>
            <Button
              title={loading ? '追加中...' : '追加'}
              onPress={handleAdd}
              disabled={loading}
            />
          </View>
        </View>
      </ScrollView>

      {/* 右カラム: 登録ユーザー一覧 (40%) */}
      <ScrollView
        style={{ width: width * 0.4, padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={tw`text-2xl font-bold mb-4`}>登録ユーザー一覧</Text>

        {users.length === 0 ? (
          <Text style={tw`text-center text-gray-500`}>ユーザーがまだいません</Text>
        ) : (
          users.map((user, idx) => (
            <View key={user.id} style={tw`bg-white p-3 rounded mb-4`}>
              <TouchableOpacity
                onPress={() => {
                  setEditingIndex(idx);
                  setEditNameInput(user.name);
                  setWageInput(user.wage ? String(user.wage) : '');
                }}
              >
                <Text style={tw`text-lg font-semibold`}>{user.name}</Text>
              </TouchableOpacity>

              {user.wage != null && (
                <Text style={tw`text-base text-gray-600 mb-2`}>
                  時給: ¥{user.wage}/h
                </Text>
              )}

              {editingIndex === idx && (
                <View style={tw`mt-2`}>
                  <TextInput
                    style={tw`border border-gray-300 p-2 mb-2 rounded`}
                    placeholder="名前を変更"
                    value={editNameInput}
                    onChangeText={setEditNameInput}
                  />
                  <TextInput
                    style={tw`border border-gray-300 p-2 mb-2 rounded`}
                    placeholder="時給を入力"
                    keyboardType="numeric"
                    value={wageInput}
                    onChangeText={setWageInput}
                  />
                  <View style={tw`flex-row justify-between`}>
                    <View style={{ width: '30%' }}>
                      <Button title="保存" onPress={() => saveChanges(idx)} />
                    </View>
                    <View style={{ width: '30%' }}>
                      <Button
                        title="除去"
                        color="red"
                        onPress={() => removeUser(idx)}
                      />
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
