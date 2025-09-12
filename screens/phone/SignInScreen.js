// screens/phone/SignInScreen.js
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  View,
  Text,
  TextInput,
  Alert,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { fetchUserByEmail } from '../../firestoreService';

function PrimaryButton({ title, onPress, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.btn, disabled && { opacity: 0.5 }]}
    >
      <Text style={styles.btnText}>{title}</Text>
    </TouchableOpacity>
  );
}

const INITIAL_PASSWORD = 'ishikawa0919';

export default function SignInScreen() {
  const [email, setEmail]   = useState('');
  const [pw, setPw]         = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const trimmed = email.trim().toLowerCase();
    const pwTrimmed = pw.trim();
if (__DEV__) console.log('[auth][try-signin]', { email: trimmed, pwLen: pwTrimmed.length });
    if (!trimmed) {
      Alert.alert('入力エラー', 'メールアドレスを入力してください');
      return;
    }

    if (!pwTrimmed) {
      Alert.alert('入力エラー', 'パスワードを入力してください（初期: ishikawa0919）');
      return;
    }

    setLoading(true);
    try {
      // 1) 既存Authユーザーなら通常ログイン
      await signInWithEmailAndPassword(auth, trimmed, pw);
      // 成功時は onAuthStateChanged(App.js) が Main を表示
    } catch (e) {
      const code = e?.code || '';
      if (__DEV__) console.log('[auth][signin-error]', code, e?.message);
      if (code === 'auth/user-not-found') {
        try {
          // 2) Authに無い場合：employees に登録があるメールだけ自動作成（初期PW=0919）
          const emp = await fetchUserByEmail(trimmed);
          if (!emp) {
            Alert.alert('ログインエラー', '登録されていないメールアドレスです');
          } else {
            await createUserWithEmailAndPassword(auth, trimmed, INITIAL_PASSWORD);
            Alert.alert('初回作成', 'アカウントを作成しました。パスワードは「ishikawa0919」です。');
            // createUser... 成功時はそのままサインイン状態になります（onAuthStateChangedで遷移）
          }
        } catch (e2) {
          console.log('[auth] provisioning error', e2?.message || e2);
          Alert.alert('エラー', 'ユーザー作成に失敗しました');
        }
      } else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        // SDKによっては invalid-credential が返る場合あり
        Alert.alert('ログインエラー', 'パスワードが違います（初期PWは「ishikawa0919」です）');
      } else if (code === 'auth/invalid-email') {
        Alert.alert('ログインエラー', 'メールアドレスの形式が不正です');
      } else {
        console.log('[auth] sign-in error', code, e?.message || e);
        Alert.alert('ログインエラー', 'サインインに失敗しました');
      }
    } finally {
      setLoading(false);
    }
   };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>ログイン</Text>
        <TextInput
          style={styles.input}
          placeholder="メールアドレス"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="パスワード（初期: ishikawa0919）"
          value={pw}
          onChangeText={setPw}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <PrimaryButton title={loading ? '...' : 'ログイン'} onPress={handleLogin} disabled={loading} />

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    marginBottom: 12,
    borderRadius: 4,
  },
  btn: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnText: {
    color: '#fff', fontWeight: '600', fontSize: 16,
  },  
});
