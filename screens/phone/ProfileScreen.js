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
  StyleSheet,
} from 'react-native';
import tw from 'twrnc';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { getAuth } from 'firebase/auth';

// Firestore service 関数をインポート
import {
  fetchCompanyProfile,
  setCompanyProfile,
  findEmployeeByIdOrEmail,
  isPrivUser,
} from '../../firestoreService';

const { width } = Dimensions.get('window');

export default function ProfileScreen({ navigation }) {
  const [checking, setChecking] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [accountType, setAccountType] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [loading, setLoading] = useState(false);

  // 直リンク対策：マウント時に特権判定し、非特権なら戻す
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const a = getAuth();
        const email = a?.currentUser?.email || null;
        const me = email ? await findEmployeeByIdOrEmail(email) : null;
        if (mounted) {
          if (!isPrivUser(me)) {
            Alert.alert('アクセスできません', 'この画面は役員・管理職・事務のみが閲覧できます。', [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
          }
          setChecking(false);
        }
      } catch (_) {
        if (mounted) {
          Alert.alert('アクセスできません', 'この画面は役員・管理職・事務のみが閲覧できます。', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
          setChecking(false);
        }
      }
    })();
    return () => { mounted = false; };
  }, [navigation]);
 
  // Firestore から既存の会社情報を読み込む
  useEffect(() => {
    (async () => {
      try {
        const comp = await fetchCompanyProfile();
        if (comp) {
          setCompanyName(comp.companyName || '');
          setBankName(comp.bankName || '');
          setBranchName(comp.branchName || '');
          setAccountType(comp.accountType || '');
          setAccountNumber(comp.accountNumber || '');
        }
      } catch (e) {
        console.error('Firestore load error', e);
        Alert.alert('エラー', '会社情報の読み込みに失敗しました');
      }
    })();
  }, []);

  if (checking) {
    // 権限確認中は何も表示しない（フラッシュ防止）
    return <View style={tw`flex-1 bg-white`} />;
  }

  // Firestore に会社情報を保存／更新
  const handleSave = async () => {
    setLoading(true);
    try {
      await setCompanyProfile({
        companyName,
        bankName,
        branchName,
        accountType,
        accountNumber,
      });
      Alert.alert('成功', '会社情報を保存しました');
    } catch (e) {
      console.error('Firestore save error', e);
      Alert.alert('エラー', '保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // ここで画面遷移はしない：onAuthStateChanged(App.js) が自動で
      // 認証なしルート（SignIn など）を表示します
    } catch (e) {
      console.warn('signOut error:', e);
      Alert.alert('ログアウトに失敗しました', e?.message ?? String(e));
    }
  };

  return (
    <View style={tw`flex-1 flex-row bg-gray-100`}>
      {/* Left column: navigation */}
      <ScrollView style={styles.leftColumn} contentContainerStyle={styles.leftContainer}>
        <Text style={styles.menuTitle}>メニュー</Text>
        <View style={styles.buttonWrapper}>
          <Button title="ユーザー登録" onPress={() => navigation.navigate('UserRegister')} />
        </View>
        <View style={styles.buttonWrapper}>
          <Button title="資材登録" onPress={() => navigation.navigate('MaterialRegister')} />
        </View>
        <View style={styles.buttonWrapper}>
          <Button title="プロジェクト登録" onPress={() => navigation.navigate('ProjectRegister')} />
        </View>
        <View style={styles.buttonWrapper}>
          <Button title="車両登録" onPress={() => navigation.navigate('VehicleRegister')} />
        </View>   
        <View style={styles.buttonWrapper}>
          <Button title="顧客情報" onPress={() => navigation.navigate('ClientInfo')} />
        </View>
        <View style={styles.buttonWrapper}>
          <Button title="CSV出力設定へ" onPress={() => navigation.navigate('ExportSettings')} />
        </View>
        <View style={styles.buttonWrapper}>
          <Button title="ログアウト" color="red" onPress={handleLogout} />
        </View>
      </ScrollView>

      {/* Right column: company info */}
      <ScrollView style={styles.rightColumn} contentContainerStyle={styles.rightContainer}>
        <View>
          <Text style={styles.sectionTitle}>会社情報設定</Text>

          <Text style={styles.label}>会社名</Text>
          <TextInput
            style={styles.input}
            placeholder="会社名を入力"
            value={companyName}
            onChangeText={setCompanyName}
          />

          <Text style={styles.label}>銀行名</Text>
          <TextInput
            style={styles.input}
            placeholder="銀行名を入力"
            value={bankName}
            onChangeText={setBankName}
          />

          <Text style={styles.label}>支店名</Text>
          <TextInput
            style={styles.input}
            placeholder="支店名を入力"
            value={branchName}
            onChangeText={setBranchName}
          />

          <Text style={styles.label}>口座種別</Text>
          <TextInput
            style={styles.input}
            placeholder="普通 / 当座"
            value={accountType}
            onChangeText={setAccountType}
          />

          <Text style={styles.label}>口座番号</Text>
          <TextInput
            style={styles.input}
            placeholder="口座番号を入力"
            keyboardType="numeric"
            value={accountNumber}
            onChangeText={setAccountNumber}
          />
        </View>

        <View style={styles.saveButtonWrapper}>
          <Button title={loading ? '保存中...' : '保存'} onPress={handleSave} disabled={loading} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  leftColumn: { width: width * 0.6, backgroundColor: '#f7f7f7' },
  leftContainer: { padding: 16 },
  menuTitle: { ...tw`text-2xl font-bold mb-6` },
  buttonWrapper: { width: width * 0.33, marginBottom: 16 },
  rightColumn: { width: width * 0.4 },
  rightContainer: { flexGrow: 1, padding: 16, justifyContent: 'space-between' },
  sectionTitle: { ...tw`text-2xl font-bold mb-6` },
  label: { ...tw`mb-2` },
  input: { ...tw`border border-gray-300 p-2 mb-4 rounded` },
  saveButtonWrapper: { alignItems: 'center', marginBottom: 20 },
});
