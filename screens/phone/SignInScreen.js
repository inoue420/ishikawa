// screens/phone/SignInScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet } from 'react-native';
import { fetchUserByEmail } from '../../firestoreService';

export default function SignInScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert('入力エラー', 'メールアドレスを入力してください');
      return;
    }
    setLoading(true);
    const user = await fetchUserByEmail(trimmed);
    setLoading(false);
    if (user) {
      navigation.replace('Main', { userEmail: trimmed });
    } else {
      Alert.alert('ログインエラー', '登録されていないメールアドレスです');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ログイン</Text>
      <TextInput
        style={styles.input}
        placeholder="メールアドレス"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <Button title={loading ? '確認中…' : 'ログイン'} onPress={handleLogin} disabled={loading} />
      <View style={{ marginTop: 16 }}>
        <Button title="新規登録はこちら" onPress={() => navigation.navigate('UserRegister')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center' },
  title: { fontSize: 24, marginBottom: 16, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 8, marginBottom: 12, borderRadius: 4 },
});