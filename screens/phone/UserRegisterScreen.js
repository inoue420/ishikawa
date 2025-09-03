// screens/phone/UserRegisterScreen.js
import React, { useState, useEffect, useMemo } from 'react';
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
const DEPT_OPTIONS = ['営業', '工事', '事務']; // ★ 追加：事業部

// 役割（役員 / 部長 / 従業員）
const ROLE_OPTIONS = [
  { value: 'executive', label: '役員' },
  { value: 'manager',   label: '部長' },
  { value: 'employee',  label: '従業員' },
];

function roleLabel(value) {
  const f = ROLE_OPTIONS.find(r => r.value === value);
  return f ? f.label : value ?? '従業員';
}

export default function UserRegisterScreen() {
  const [email, setEmail] = useState('');
  const [loginId, setLoginId] = useState('');
  const [name, setName] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [division, setDivision] = useState('');
  const [role, setRole] = useState('employee');
  const [department, setDepartment] = useState(''); // ★ 追加：事業部
  const [managerLoginId, setManagerLoginId] = useState(''); // 上長は loginId 紐付け

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

  useEffect(() => { loadUsers(); }, []);

  // 上長候補（従業員→部長、部長→役員）
  const candidateSuperiors = useMemo(() => {
    if (role === 'employee') {
      return users.filter(u => (u.role ?? 'employee') === 'manager');
    } else if (role === 'manager') {
      return users.filter(u => (u.role ?? 'employee') === 'executive');
    }
    return [];
  }, [users, role]);

  const onChangeRole = (newRole) => {
    setRole(newRole);
    setManagerLoginId(''); // 候補が変わるためクリア
  };

  // 区分変更時、社員以外になったら事業部をクリア
  const onChangeDivision = (v) => {
    setDivision(v);
    if (v !== '社員') setDepartment('');
  };

  const handleSubmit = async () => {
    const addr = email.trim().toLowerCase();
    const login = loginId.trim().toLowerCase();
    const mgrId = managerLoginId.trim().toLowerCase();
    const dept  = (division === '社員') ? department.trim() : '';

    if (!addr || !name.trim() || !affiliation.trim() || !division.trim()) {
      return Alert.alert('入力エラー', '必須項目（メール・氏名・所属・区分）を入力してください');
    }
    // 社員のときは事業部必須
    if (division === '社員' && !dept) {
      return Alert.alert('入力エラー', '社員の場合は事業部を選択してください');
    }
    // 役割別の上長必須チェック
    if (role === 'employee' && !mgrId) {
      return Alert.alert('入力エラー', '従業員の場合は上長（部長）を選択してください');
    }
    if (role === 'manager' && !mgrId) {
      return Alert.alert('入力エラー', '部長の場合は上長（役員）を選択してください');
    }

    setLoading(true);
    try {
      if (editingEmail) {
        await updateUser(editingEmail, {
          loginId: login,
          name, affiliation, division, role,
          department: dept, // ★ 保存
          managerLoginId: (role === 'executive') ? '' : mgrId,
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
          email: addr,
          loginId: login,
          name, affiliation, division, role,
          department: dept, // ★ 保存
          managerLoginId: (role === 'executive') ? '' : mgrId,
        });
        Alert.alert('登録完了', `${addr} を従業員として登録しました`);
      }

      // クリア
      setEmail(''); setLoginId(''); setName(''); setAffiliation(''); setDivision('');
      setRole('employee'); setDepartment(''); setManagerLoginId('');
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
    setLoginId(u.loginId ?? '');
    setName(u.name ?? '');
    setAffiliation(u.affiliation ?? '');
    setDivision(u.division ?? '');
    setRole(u.role ?? 'employee');
    setDepartment(u.department ?? ''); // ★ 読み込み
    setManagerLoginId(u.managerLoginId ?? '');
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

  const superiorLabel =
    role === 'employee' ? '上長（部長 / loginId）' :
    role === 'manager'  ? '上長（役員 / loginId）' :
    '上長（なし）';

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
        <Picker selectedValue={division} onValueChange={onChangeDivision} mode="dropdown">
          <Picker.Item label="選択してください" value="" />
          {DIVISION_OPTIONS.map(opt => <Picker.Item key={opt} label={opt} value={opt} />)}
        </Picker>
      </View>

      {/* ログインID */}
      <TextInput
        style={styles.input}
        placeholder="ログインID（例：tanaka01）"
        autoCapitalize="none"
        value={loginId}
        onChangeText={setLoginId}
      />

      {/* 役割 */}
      <Text style={styles.label}>役割</Text>
      <View style={styles.pickerWrapper}>
        <Picker selectedValue={role} onValueChange={onChangeRole} mode="dropdown">
          {ROLE_OPTIONS.map(opt => <Picker.Item key={opt.value} label={opt.label} value={opt.value} />)}
        </Picker>
      </View>

      {/* ★ 事業部（社員のみ、役割と上長の間に表示） */}
      {division === '社員' && (
        <>
          <Text style={styles.label}>事業部</Text>
          <View style={styles.pickerWrapper}>
            <Picker selectedValue={department} onValueChange={setDepartment} mode="dropdown">
              <Picker.Item label="選択してください" value="" />
              {DEPT_OPTIONS.map(opt => <Picker.Item key={opt} label={opt} value={opt} />)}
            </Picker>
          </View>
        </>
      )}

      {/* 上長（従業員→部長、部長→役員。役員は表示なし） */}
      {(role === 'employee' || role === 'manager') && (
        <>
          <Text style={styles.label}>{superiorLabel}</Text>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={managerLoginId}
              onValueChange={setManagerLoginId}
              mode="dropdown"
            >
              <Picker.Item label="選択してください" value="" />
              {candidateSuperiors.map(m => (
                <Picker.Item
                  key={(m.loginId || m.email) ?? Math.random().toString(36)}
                  label={`${m.name ?? m.loginId ?? m.email}${m.affiliation ? `（${m.affiliation}）` : ''}`}
                  value={m.loginId ?? ''}
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
            setEmail(''); setLoginId(''); setName(''); setAffiliation(''); setDivision('');
            setRole('employee'); setDepartment(''); setManagerLoginId('');
          }} />
        </View>
      )}

      <Text style={styles.listHeading}>登録済み従業員一覧</Text>
      {users.map((u) => (
        <View key={u.email} style={styles.userRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text>{u.email}</Text>
            <Text>{u.name} / {u.affiliation} / {u.division ?? '-'}</Text>
            {u.division === '社員' && (
              <Text style={{ color: '#333' }}>事業部: {u.department ?? '-'}</Text>
            )}
            <Text style={{ color: '#555' }}>
              役割: {roleLabel(u.role ?? 'employee')}
              {(u.role === 'employee' || u.role === 'manager')
                ? ` / 上長(loginId): ${u.managerLoginId ?? '-'}`
                : ''}
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
