// screens/LoginScreen.js

import React, { useState } from 'react';
import { ScrollView, View, Text, TextInput, Button, StyleSheet } from 'react-native';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    // デバッグ用：ログイン成功時に Home へリセット遷移
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>ログイン (UI デバッグモード)</Text> 
      <TextInput
        style={styles.input}
        placeholder="メールアドレス"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="パスワード"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button title="ログイン" onPress={handleLogin} />

      <Text style={styles.debugTitle}>スクリーン遷移デバッグ</Text>
      <View style={styles.debugContainer}>
        <Button title="Home" onPress={() => navigation.navigate('Home')} />
        <Button title="Attendance" onPress={() => navigation.navigate('Attendance')} />
        <Button title="Materials" onPress={() => navigation.navigate('Materials')} />
        <Button title="WIP" onPress={() => navigation.navigate('WIP')} />
        <Button title="Billing" onPress={() => navigation.navigate('Billing')} />
        <Button title="Profile" onPress={() => navigation.navigate('Profile')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginBottom: 15,
    borderRadius: 5,
  },
  debugTitle: {
    marginTop: 30,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  debugContainer: {
    marginTop: 10,
    justifyContent: 'space-between',
    height: 200,
  },
});
