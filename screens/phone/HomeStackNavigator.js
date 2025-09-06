// screens/phone/HomeStackNavigator.js
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen          from './HomeScreen';
import ProjectDetailScreen from './ProjectDetailScreen';
import ManagerApprovalScreen from './ManagerApprovalScreen';

const Stack = createStackNavigator();

export default function HomeStackNavigator({ route }) {
  const userEmail = route?.params?.userEmail ?? null; // Tab から受ける
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* ホーム画面 */}
     <Stack.Screen
       name="Home"
       component={HomeScreen}
       options={{ title: 'ホーム' }}
       initialParams={{ userEmail }}  // ★ HomeScreen へ引き継ぎ
     />
      {/* プロジェクト詳細画面 */}
      <Stack.Screen
        name="ProjectDetail"
        component={ProjectDetailScreen}
        initialParams={{ userEmail }} // ★ 追加：詳細からの作成/編集でも実行者名を解決
      />
     <Stack.Screen
       name="ManagerApproval"
       component={ManagerApprovalScreen}
       options={{ title: '承認(上長)' }}
       initialParams={{ userEmail }} // ★ 追加
     />
    </Stack.Navigator>
  );
}
