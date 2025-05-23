// screens/ProfileScreen.js

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, Alert, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tw from 'twrnc';

export default function ProfileScreen({ navigation }) {
  const STORAGE_KEY = '@user_profile';
  const [name, setName] = useState('');
  const [role, setRole] = useState('staff');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        if (json) {
          const data = JSON.parse(json);
          setName(data.name || '');
          setRole(data.role || 'staff');
        }
      } catch (e) {
        console.error('AsyncStorage load error', e);
      }
    })();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ name, role })
      );
      Alert.alert('成功', 'プロフィールを保存しました');
    } catch (e) {
      console.error('AsyncStorage save error', e);
      Alert.alert('エラー', '保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <ScrollView contentContainerStyle={tw`flex-1 bg-gray-100 p-4`}>
      <Text style={tw`text-xl font-bold mb-4`}>プロフィール</Text>

      <Text style={tw`mb-2`}>名前</Text>
      <TextInput
        style={tw`border border-gray-300 p-2 mb-4 rounded`}
        placeholder="名前を入力"
        value={name}
        onChangeText={setName}
      />

      <Text style={tw`mb-2`}>権限</Text>
      <View style={tw`flex-row mb-4 justify-around`}>
        <Button
          title="管理者"
          onPress={() => setRole('admin')}
          color={role === 'admin' ? undefined : 'gray'}
        />
        <Button
          title="現場担当"
          onPress={() => setRole('staff')}
          color={role === 'staff' ? undefined : 'gray'}
        />
      </View>

      <Button
        title={loading ? '保存中...' : '保存'}
        onPress={handleSave}
        disabled={loading}
      />

      <View style={tw`mt-6`}>
        <View style={tw`mb-2`}>
          <Button
            title="ユーザー登録"
            onPress={() => navigation.navigate('UserRegister')}
          />
        </View>
        <View style={tw`mb-2`}>
          <Button
            title="資材登録"
            onPress={() => navigation.navigate('MaterialRegister')}
          />
        </View>
        <View style={tw`mb-2`}>
          <Button
            title="プロジェクト登録"
            onPress={() => navigation.navigate('ProjectRegister')}
          />
        </View>
        <View>
          <Button
            title="ログアウト"
            onPress={handleLogout}
            color="red"
          />
        </View>
      </View>
    </ScrollView>
  );
}
