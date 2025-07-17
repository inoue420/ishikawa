// screens/phone/UserRegisterScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Alert, ScrollView, StyleSheet } from 'react-native';
import {
  registerUser,
  fetchAllUsers,
  fetchUserByEmail,
  updateUser,
  deleteUser,
} from '../../firestoreService';

export default function UserRegisterScreen() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingEmail, setEditingEmail] = useState(null);

  // 一覧取得
  const loadUsers = async () => {
    try {
      const list = await fetchAllUsers();
      setUsers(list);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '従業員リストの取得に失敗しました');
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // 登録 or 更新ハンドラ
  const handleSubmit = async () => {
    const addr = email.trim().toLowerCase();
    if (!addr || !name.trim() || !affiliation.trim()) {
      return Alert.alert('入力エラー', 'すべての項目を入力してください');
    }
    setLoading(true);
    try {
      if (editingEmail) {
        // 更新
        await updateUser({ email: editingEmail, name, affiliation });
        Alert.alert('更新完了', `${editingEmail} の情報を更新しました`);
      } else {
        // 重複チェック
        const exists = await fetchUserByEmail(addr);
        if (exists) {
          Alert.alert('登録エラー', 'このメールアドレスは既に登録済みです');
          setLoading(false);
          return;
        }
        await registerUser({ email: addr, name, affiliation });
        Alert.alert('登録完了', `${addr} を従業員として登録しました`);
      }
      // フォームと状態クリア
      setEmail('');
      setName('');
      setAffiliation('');
      setEditingEmail(null);
      // 再取得
      await loadUsers();
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '処理に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 編集開始
  const startEdit = (u) => {
    setEditingEmail(u.email);
    setEmail(u.email);
    setName(u.name);
    setAffiliation(u.affiliation);
  };

  // 削除
  const handleDelete = async (addr) => {
    Alert.alert(
      '確認',
      `${addr} を削除しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUser(addr);
              await loadUsers();
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>
        {editingEmail ? '従業員情報編集' : '従業員登録'}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="メールアドレス"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        editable={!editingEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="氏名"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="所属"
        value={affiliation}
        onChangeText={setAffiliation}
      />
      <Button
        title={loading ? (editingEmail ? '更新中…' : '登録中…') : (editingEmail ? '更新' : '登録')}
        onPress={handleSubmit}
        disabled={loading}
      />
      {editingEmail && (
        <View style={styles.cancelButton}>
          <Button title="キャンセル" onPress={() => {
            setEditingEmail(null);
            setEmail(''); setName(''); setAffiliation('');
          }} />
        </View>
      )}
      <Text style={styles.listHeading}>登録済み従業員一覧</Text>
      {users.map((u) => (
        <View key={u.email} style={styles.userRow}>
          <View>
            <Text>{u.email}</Text>
            <Text>{u.name} / {u.affiliation}</Text>
          </View>
          <View style={styles.buttonsRow}>
            <Button title="編集" onPress={() => startEdit(u)} />
            <View style={{ width: 8 }} />
            <Button title="削除" color="red" onPress={() => handleDelete(u.email)} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  heading: { fontSize: 20, marginBottom: 12, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 8, marginBottom: 12, borderRadius: 4 },
  listHeading: { fontSize: 18, marginVertical: 16 },
  userRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  buttonsRow: { flexDirection: 'row' },
  cancelButton: { marginVertical: 8 },
});
