// screens/phone/UserRegisterScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet } from 'react-native';
import { registerUser, fetchUserByEmail } from '../../firestoreService';

export default function UserRegisterScreen() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email || !name || !affiliation) {
      Alert.alert('入力エラー', 'すべての項目を入力してください');
      return;
    }
    setLoading(true);
    const exists = await fetchUserByEmail(email);
    if (exists) {
      Alert.alert('登録エラー', 'このメールアドレスは既に登録済みです');
    } else {
      await registerUser({ email, name, affiliation });
      Alert.alert('登録完了', `${email} を従業員として登録しました`);
      setEmail(''); setName(''); setAffiliation('');
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>従業員登録</Text>
      <TextInput
        style={styles.input}
        placeholder="メールアドレス"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
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
      <Button title={loading ? '登録中…' : '登録'} onPress={handleRegister} disabled={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center' },
  title: { fontSize: 20, marginBottom: 16, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 8, marginBottom: 12, borderRadius: 4 },
});
