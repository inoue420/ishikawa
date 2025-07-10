// screens/SignInScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
// ※実装時に以下を使います
// import { auth } from '../firebaseConfig';
// import { signInWithEmailAndPassword } from 'firebase/auth';

export default function SignInScreen({ navigation }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');

  const handleSignIn = () => {
    // TODO: Firebase Auth 実装
    // signInWithEmailAndPassword(auth, email.trim(), password)
    //   .then(userCredential => { ... })
    //   .catch(error => { ... });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <Text style={styles.title}>サインイン</Text>

      <TextInput
        style={styles.input}
        placeholder="メールアドレス"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="パスワード"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleSignIn}>
        <Text style={styles.buttonText}>サインイン</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkContainer}
        onPress={() => navigation.navigate('SignUp')}
      >
        <Text style={styles.linkText}>
          アカウントをお持ちでない方はこちら
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:              1,
    justifyContent:    'center',
    paddingHorizontal: 24,
    backgroundColor:   '#fff',
  },
  title: {
    fontSize:      32,
    fontWeight:    'bold',
    textAlign:     'center',
    marginBottom:  24,
  },
  input: {
    height:           48,
    borderColor:      '#ccc',
    borderWidth:      1,
    borderRadius:     4,
    paddingHorizontal: 12,
    marginBottom:     16,
  },
  button: {
    height:           48,
    borderRadius:     4,
    backgroundColor:  '#007AFF',
    justifyContent:   'center',
    alignItems:       'center',
    marginVertical:   12,
  },
  buttonText: {
    color:    '#fff',
    fontSize: 16,
  },
  linkContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color:    '#007AFF',
    fontSize: 14,
  },
});
