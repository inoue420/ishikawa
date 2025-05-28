// screens/ProfileScreen.js

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tw from 'twrnc';

const { width } = Dimensions.get('window');
const STORAGE_KEY = '@company_profile';

export default function ProfileScreen({ navigation }) {
  const [companyName, setCompanyName] = useState('');
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [accountType, setAccountType] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        if (json) {
          const data = JSON.parse(json);
          setCompanyName(data.companyName || '');
          setBankName(data.bankName || '');
          setBranchName(data.branchName || '');
          setAccountType(data.accountType || '');
          setAccountNumber(data.accountNumber || '');
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
        JSON.stringify({ companyName, bankName, branchName, accountType, accountNumber })
      );
      Alert.alert('成功', '会社情報を保存しました');
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
    <View style={tw`flex-1 flex-row bg-gray-100`}>
      {/* Left column: navigation */}
      <ScrollView style={{ width: width * 0.6, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-6`}>メニュー</Text>
        <View style={tw`mb-4`}>
          <Button
            title="ユーザー登録"
            onPress={() => navigation.navigate('UserRegister')}
          />
        </View>
        <View style={tw`mb-4`}>
          <Button
            title="資材登録"
            onPress={() => navigation.navigate('MaterialRegister')}
          />
        </View>
        <View style={tw`mb-4`}>
          <Button
            title="プロジェクト登録"
            onPress={() => navigation.navigate('ProjectRegister')}
          />
        </View>
        <View>
          <Button
            title="ログアウト"
            color="red"
            onPress={handleLogout}
          />
        </View>
      </ScrollView>

      {/* Right column: company info */}
      <ScrollView style={{ width: width * 0.4, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-6`}>会社情報設定</Text>

        <Text style={tw`mb-2`}>会社名</Text>
        <TextInput
          style={tw`border border-gray-300 p-2 mb-4 rounded`}
          placeholder="会社名を入力"
          value={companyName}
          onChangeText={setCompanyName}
        />

        <Text style={tw`mb-2`}>銀行名</Text>
        <TextInput
          style={tw`border border-gray-300 p-2 mb-4 rounded`}
          placeholder="銀行名を入力"
          value={bankName}
          onChangeText={setBankName}
        />

        <Text style={tw`mb-2`}>支店名</Text>
        <TextInput
          style={tw`border border-gray-300 p-2 mb-4 rounded`}
          placeholder="支店名を入力"
          value={branchName}
          onChangeText={setBranchName}
        />

        <Text style={tw`mb-2`}>口座種別</Text>
        <TextInput
          style={tw`border border-gray-300 p-2 mb-4 rounded`}
          placeholder="普通 / 当座"
          value={accountType}
          onChangeText={setAccountType}
        />

        <Text style={tw`mb-2`}>口座番号</Text>
        <TextInput
          style={tw`border border-gray-300 p-2 mb-6 rounded`}
          placeholder="口座番号を入力"
          keyboardType="numeric"
          value={accountNumber}
          onChangeText={setAccountNumber}
        />

        <View style={tw`items-center`}>         
          <View style={{ width: '60%' }}>
            <Button
              title={loading ? '保存中...' : '保存'}
              onPress={handleSave}
              disabled={loading}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
