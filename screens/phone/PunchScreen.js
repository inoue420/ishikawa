// screens/phone/PunchScreen.js
import React, { useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function PunchScreen({ route }) {
  const { userEmail } = route.params;
  const [message, setMessage] = useState('');

  const dateKeyLocal = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  
  const record = async (type) => {
    const now = new Date();
    await addDoc(collection(db, 'attendanceRecords'), {
      userEmail,
      type,
      timestamp: Timestamp.fromDate(now),
      dateStr: dateKeyLocal(now),
    });
    setMessage(`${type === 'in' ? '出勤' : '退勤'}: ${now.toLocaleTimeString()}`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{userEmail}の打刻画面</Text>
      <Button title="出勤" onPress={() => record('in')} />
      <View style={styles.spacer} />
      <Button title="退勤" onPress={() => record('out')} />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center' },
  title: { fontSize: 20, marginBottom: 16, textAlign: 'center' },
  spacer: { height: 12 },
  message: { marginTop: 20, fontSize: 16, color: 'green', textAlign: 'center' },
});