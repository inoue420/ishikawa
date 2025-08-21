// screens/phone/UserRegisterScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Alert, ScrollView, StyleSheet, TouchableOpacity, Platform, ActionSheetIOS } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import {
  registerUser,
  fetchAllUsers,
  fetchUserByEmail,
  updateUser,
  deleteUser,
} from '../../firestoreService';

const DIVISION_OPTIONS = ['外注', '社員', 'パート', 'アルバイト'];

export default function UserRegisterScreen() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [division, setDivision] = useState(''); // 選択値
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingEmail, setEditingEmail] = useState(null);

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

  const openDivisionPickerIOS = () => {
    const options = ['キャンセル', ...DIVISION_OPTIONS];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: 0,
        title: '区分を選択',
      },
      (buttonIndex) => {
        if (buttonIndex === 0) return; // キャンセル
        const chosen = DIVISION_OPTIONS[buttonIndex - 1];
        setDivision(chosen);
      }
    );
  };

  const handleSubmit = async () => {
    const addr = email.trim().toLowerCase();
    if (!addr || !name.trim() || !affiliation.trim() || !division.trim()) {
      return Alert.alert('入力エラー', 'すべての項目を入力してください');
    }
    setLoading(true);
    try {
      if (editingEmail) {
        await updateUser(editingEmail, { name, affiliation, division });
        Alert.alert('更新完了', `${editingEmail} の情報を更新しました`);
      } else {
        const exists = await fetchUserByEmail(addr);
        if (exists) {
          Alert.alert('登録エラー', 'このメールアドレスは既に登録済みです');
          setLoading(false);
          return;
        }
        await registerUser({ email: addr, name, affiliation, division });
        Alert.alert('登録完了', `${addr} を従業員として登録しました`);
      }
      setEmail('');
      setName('');
      setAffiliation('');
      setDivision('');
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
    const existing = u.division ?? '';
    setDivision(DIVISION_OPTIONS.includes(existing) ? existing : '');
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

      <Text style={styles.label}>区分</Text>
      {/* iOS: タップでアクションシート, Android: これまで通りPicker */}
      {Platform.OS === 'ios' ? (
        <TouchableOpacity style={styles.selectBox} onPress={openDivisionPickerIOS} activeOpacity={0.7}>
          <Text style={[styles.selectBoxText, !division && styles.placeholderText]}>
            {division || '選択してください'}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.pickerWrapper}>
          <Picker
            selectedValue={division}
            onValueChange={(val) => setDivision(val)}
            mode="dropdown"
          >
            <Picker.Item label="選択してください" value="" enabled={true} />
            {DIVISION_OPTIONS.map((opt) => (
              <Picker.Item key={opt} label={opt} value={opt} />
            ))}
          </Picker>
        </View>
      )}
      {!division ? <Text style={styles.helper}>区分を選択してください</Text> : null}

      <Button
        title={loading ? (editingEmail ? '更新中…' : '登録中…') : (editingEmail ? '更新' : '登録')}
        onPress={handleSubmit}
        disabled={loading}
      />

      {editingEmail && (
        <View style={styles.cancelButton}>
          <Button
            title="キャンセル"
            onPress={() => {
              setEditingEmail(null);
              setEmail(''); setName(''); setAffiliation('');
              setDivision('');
            }}
          />
        </View>
      )}

      <Text style={styles.listHeading}>登録済み従業員一覧</Text>
      {users.map((u) => (
        <View key={u.email} style={styles.userRow}>
          <View>
            <Text>{u.email}</Text>
            <Text>{u.name} / {u.affiliation} / {u.division ?? '-'}</Text>
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

  // iOS用の見た目（TextInputと同じ風）
  selectBox: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 4,
    paddingVertical: 12, paddingHorizontal: 10, marginBottom: 12,
    backgroundColor: '#fff',
  },
  selectBoxText: { fontSize: 16, color: '#333' },
  placeholderText: { color: '#999' },

  // Android用Pickerラッパー
  pickerWrapper: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 4,
    marginBottom: 12, overflow: 'hidden', backgroundColor: '#fff',
  },

  helper: { marginTop: -6, marginBottom: 12, color: '#999', fontSize: 12 },
  listHeading: { fontSize: 18, marginVertical: 16 },
  userRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  buttonsRow: { flexDirection: 'row' },
  cancelButton: { marginVertical: 8 },
});
