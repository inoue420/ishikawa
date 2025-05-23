// screens/BillingScreen.js

import React, { useEffect, useState } from 'react';
import { View, Text, Button, FlatList, Alert, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tw from 'twrnc';

export default function BillingScreen() {
  const ATT_KEY = '@attendance_records';
  const MAT_KEY = '@materials_records';
  const INV_KEY = '@invoice_records';

  const [attendanceCount, setAttendanceCount] = useState(0);
  const [materialCount, setMaterialCount] = useState(0);
  const [invoices, setInvoices] = useState([]);
  const [saving, setSaving] = useState(false);

  // 初期ロード
  useEffect(() => {
    (async () => {
      try {
        // 出退勤数取得
        const attData = await AsyncStorage.getItem(ATT_KEY);
        setAttendanceCount(attData ? JSON.parse(attData).length : 0);
        // 資材数取得
        const matData = await AsyncStorage.getItem(MAT_KEY);
        setMaterialCount(matData ? JSON.parse(matData).length : 0);
        // 請求履歴取得
        const invData = await AsyncStorage.getItem(INV_KEY);
        setInvoices(invData ? JSON.parse(invData) : []);
      } catch (e) {
        console.error('AsyncStorage load error', e);
      }
    })();
  }, []);

  // 保存
  const saveInvoices = async (arr) => {
    try {
      await AsyncStorage.setItem(INV_KEY, JSON.stringify(arr));
    } catch (e) {
      console.error('AsyncStorage save error', e);
    }
  };

  // 請求書作成
  const handleCreateInvoice = async () => {
    setSaving(true);
    const timestamp = new Date().toISOString();
    const newInvoice = { timestamp, attendanceCount, materialCount };
    const updated = [newInvoice, ...invoices];
    setInvoices(updated);
    await saveInvoices(updated);
    Alert.alert('成功', '請求書を作成しました');
    setSaving(false);
  };

  // レコードレンダー
  const renderInvoice = ({ item }) => (
    <View style={tw`bg-white p-3 rounded mb-2 flex-row justify-between`}>      
      <View>
        <Text style={tw`font-bold`}>{new Date(item.timestamp).toLocaleString()}</Text>
        <Text>出退勤件数: {item.attendanceCount}</Text>
        <Text>資材操作件数: {item.materialCount}</Text>
      </View>
    </View>
  );

  return (
    <View style={tw`flex-1 bg-gray-100 p-4`}>
      <Text style={tw`text-xl font-bold mb-4`}>請求書作成</Text>

      {/* 要約 */}
      <View style={tw`bg-white p-4 rounded mb-4`}>        
        <Text>出退勤件数: {attendanceCount}</Text>
        <Text>資材操作件数: {materialCount}</Text>
      </View>

      <Button
        title={saving ? '作成中...' : '請求書を作成'}
        onPress={handleCreateInvoice}
        disabled={saving}
      />

      <Text style={tw`text-lg font-semibold mt-6 mb-2`}>請求書履歴</Text>
      {invoices.length === 0 ? (
        <Text style={tw`text-center text-gray-500`}>請求書がありません</Text>
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={(_, idx) => idx.toString()}
          renderItem={renderInvoice}
        />
      )}
    </View>
  );
}
