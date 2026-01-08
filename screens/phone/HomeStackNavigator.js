// screens/phone/HomeStackNavigator.js
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen          from './HomeScreen';
import ProjectDetailScreen from './ProjectDetailScreen';
import ManagerApprovalScreen from './ManagerApprovalScreen';

const Stack = createStackNavigator();

export default function HomeStackNavigator({ route }) {
  const userEmail = route?.params?.userEmail ?? null; // Tab から受ける
  // ★ 追加：loginId も Tab から受けられるように（命名揺れ対策）
  const loginId = route?.params?.loginId ?? route?.params?.userLoginId ?? null;
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* ホーム画面 */}
     <Stack.Screen
       name="Home"
       component={HomeScreen}
       options={{ title: 'ホーム' }}
       initialParams={{ userEmail, loginId }}  // ★ HomeScreen へ引き継ぎ
     />
      {/* プロジェクト詳細画面 */}
      <Stack.Screen
        name="ProjectDetail"
        component={ProjectDetailScreen}
        options={{ title: 'プロジェクト詳細', headerShown: true }} // ★ ヘッダーを表示（⋯メニュー用）
        initialParams={{ userEmail, loginId }} // ★ 追加：実行者解決用
      />
     <Stack.Screen
       name="ManagerApproval"
       component={ManagerApprovalScreen}
       options={{ title: '承認(上長)', headerShown: true }} // 任意：ヘッダーが必要なら表示
       initialParams={{ userEmail, loginId }} // ★ 追加
     />
    </Stack.Navigator>
  );
}
