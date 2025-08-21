// screens/phone/UserRegisterScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Alert, ScrollView, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import {
  registerUser,
  fetchAllUsers,
  fetchUserByEmail,
  updateUser,
  deleteUser,
} from '../../firestoreService';

const DIVISION_OPTIONS = ['外注', '社員', 'パート', 'アルバイト'];
const ROLE_OPTIONS = ['manager', 'employee'];

export default function UserRegisterScreen() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [division, setDivision] = useState('');
  const [role, setRole] = useState('employee');
  const [managerEmail, setManagerEmail] = useState('');

  const [users, setUsers] = useState([]);
  const [managers, setManagers] = useState([]); // role === 'manager' の従業員一覧
  const [loading, setLoading] = useState(false);
  const [editingEmail, setEditingEmail] = useState(null);

  const loadUsers = async () => {
    try {
      const list = await fetchAllUsers();
      setUsers(list);
      setManagers(list.filter(u => (u.role ?? 'employee') === 'manager'));
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '従業員リストの取得に失敗しました');
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleSubmit = async () => {
    const addr = email.trim().toLowerCase();
    if (!addr || !name.trim() || !affiliation.trim() || !division.trim()) {
      return Alert.alert('入力エラー', '必須項目（メール・氏名・所属・区分）を入力してください');
    }
    if (role === 'employee' && !managerEmail.trim()) {
      return Alert.alert('入力エラー', '役割が従業員の場合は上長を選択してください');
    }

    setLoading(true);
    try {
      if (editingEmail) {
        await updateUser(editingEmail, {
          name, affiliation, division, role,
          managerEmail: role === 'employee' ? managerEmail : '',
        });
        Alert.alert('更新完了', `${editingEmail} の情報を更新しました`);
      } else {
        const exists = await fetchUserByEmail(addr);
        if (exists) {
          Alert.alert('登録エラー', 'このメールアドレスは既に登録済みです');
          setLoading(false);
          return;
        }
        await registerUser({
          email: addr, name, affiliation, division, role,
          managerEmail: role === 'employee' ? managerEmail : '',
        });
        Alert.alert('登録完了', `${addr} を従業員として登録しました`);
      }

      // クリア
      setEmail(''); setName(''); setAffiliation(''); setDivision('');
      setRole('employee'); setManagerEmail('');
      setEditingEmail(null);
      await loadUsers();
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '処理に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (u) => {
    setEditingEmail(u.email);
    setEmail(u.email);
    setName(u.name ?? '');
    setAffiliation(u.affiliation ?? '');
    setDivision(u.division ?? '');
    setRole(u.role ?? 'employee');
    setManagerEmail(u.managerEmail ?? '');
  };

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
      <Text style={styles.heading}>{editingEmail ? '従業員情報編集' : '従業員登録'}</Text>

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
        placeholder="所属（会社名）"
        value={affiliation}
        onChangeText={setAffiliation}
      />

      {/* 区分 */}
      <Text style={styles.label}>区分</Text>
      <View style={styles.pickerWrapper}>
        <Picker selectedValue={division} onValueChange={setDivision} mode="dropdown">
          <Picker.Item label="選択してください" value="" />
          {DIVISION_OPTIONS.map(opt => <Picker.Item key={opt} label={opt} value={opt} />)}
        </Picker>
      </View>

      {/* 役割 */}
      <Text style={styles.label}>役割</Text>
      <View style={styles.pickerWrapper}>
        <Picker selectedValue={role} onValueChange={(v) => setRole(v)} mode="dropdown">
          {ROLE_OPTIONS.map(opt => <Picker.Item key={opt} label={opt} value={opt} />)}
        </Picker>
      </View>

      {/* 上長（employee のみ表示） */}
      {role === 'employee' && (
        <>
          <Text style={styles.label}>上長（manager）</Text>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={managerEmail}
              onValueChange={setManagerEmail}
              mode="dropdown"
            >
              <Picker.Item label="選択してください" value="" />
              {managers.map(m => (
                <Picker.Item
                  key={m.email}
                  label={`${m.name ?? m.email}（${m.affiliation ?? '-'}）`}
                  value={m.email}
                />
              ))}
            </Picker>
          </View>
        </>
      )}

      <Button
        title={loading ? (editingEmail ? '更新中…' : '登録中…') : (editingEmail ? '更新' : '登録')}
        onPress={handleSubmit}
        disabled={loading}
      />

      {editingEmail && (
        <View style={styles.cancelButton}>
          <Button title="キャンセル" onPress={() => {
            setEditingEmail(null);
            setEmail(''); setName(''); setAffiliation(''); setDivision('');
            setRole('employee'); setManagerEmail('');
          }} />
        </View>
      )}

      <Text style={styles.listHeading}>登録済み従業員一覧</Text>
      {users.map((u) => (
        <View key={u.email} style={styles.userRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text>{u.email}</Text>
            <Text>{u.name} / {u.affiliation} / {u.division ?? '-'}</Text>
            <Text style={{ color: '#555' }}>
              役割: {u.role ?? 'employee'}
              {u.role === 'employee' ? ` / 上長: ${u.managerEmail ?? '-'}` : ''}
            </Text>
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
  label: { marginBottom: 6, fontSize: 14, color: '#333' },
  pickerWrapper: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 4,
    marginBottom: 12, overflow: 'hidden', backgroundColor: '#fff',
  },
  listHeading: { fontSize: 18, marginVertical: 16 },
  userRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  buttonsRow: { flexDirection: 'row' },
  cancelButton: { marginVertical: 8 },
});
