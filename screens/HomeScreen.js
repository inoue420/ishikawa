// screens/HomeScreen.js

import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, Button, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tw from 'twrnc';

export default function HomeScreen({ navigation }) {
  const [counts, setCounts] = useState({ attendance: 0, materials: 0, wip: 0, invoices: 0 });
  const [loading, setLoading] = useState(true);

  const loadCounts = async () => {
    try {
      const keys = {
        attendance: '@attendance_records',
        materials: '@materials_records',
        wip: '@wip_records',
        invoices: '@invoice_records',
      };
      const newCounts = {};
      for (const [keyName, storageKey] of Object.entries(keys)) {
        const data = await AsyncStorage.getItem(storageKey);
        newCounts[keyName] = data ? JSON.parse(data).length : 0;
      }
      setCounts(newCounts);
    } catch (e) {
      console.error('AsyncStorage load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCounts();
    const unsubscribe = navigation.addListener('focus', loadCounts);
    return unsubscribe;
  }, [navigation]);

  if (loading) {
    return (
      <View style={tw`flex-1 justify-center items-center`}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={tw`p-4 bg-gray-100`}>
      <Text style={tw`text-xl font-bold mb-4`}>ダッシュボード</Text>

      <View style={tw`bg-white p-4 rounded-2xl shadow mb-4`}>
        <Text style={tw`text-base text-gray-500 mb-1`}>本日の出退勤</Text>
        <Text style={tw`text-2xl font-bold`}>{counts.attendance}件</Text>
        <Button title="詳細" onPress={() => navigation.navigate('Attendance')} />
      </View>

      <View style={tw`bg-white p-4 rounded-2xl shadow mb-4`}>
        <Text style={tw`text-base text-gray-500 mb-1`}>資材操作数</Text>
        <Text style={tw`text-2xl font-bold`}>{counts.materials}件</Text>
        <Button title="詳細" onPress={() => navigation.navigate('Materials')} />
      </View>

      <View style={tw`bg-white p-4 rounded-2xl shadow mb-4`}>
        <Text style={tw`text-base text-gray-500 mb-1`}>仕掛件数</Text>
        <Text style={tw`text-2xl font-bold`}>{counts.wip}件</Text>
        <Button title="詳細" onPress={() => navigation.navigate('WIP')} />
      </View>

      <View style={tw`bg-white p-4 rounded-2xl shadow mb-4`}>
        <Text style={tw`text-base text-gray-500 mb-1`}>請求書数</Text>
        <Text style={tw`text-2xl font-bold`}>{counts.invoices}件</Text>
        <Button title="詳細" onPress={() => navigation.navigate('Billing')} />
      </View>
    </ScrollView>
  );
}
