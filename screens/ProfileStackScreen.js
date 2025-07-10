// ./screens/ProfileStackScreen.js
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

// 各画面コンポーネントをインポート
import ProfileScreen          from './ProfileScreen';
import UserRegisterScreen     from './UserRegisterScreen';
import MaterialRegisterScreen from './MaterialRegisterScreen';
import ProjectRegisterScreen  from './ProjectRegisterScreen';
import ExportSettingsScreen   from './ExportSettingsScreen'; 

const ProfileStack = createStackNavigator();

export default function ProfileStackScreen() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerTitleAlign: 'center' }}>
      <ProfileStack.Screen
        name="ProfileMain"
        component={ProfileScreen}
        options={{ title: 'プロフィール' }}
      />
      <ProfileStack.Screen
        name="UserRegister"
        component={UserRegisterScreen}
        options={{ title: 'ユーザー登録' }}
      />
      <ProfileStack.Screen
        name="MaterialRegister"
        component={MaterialRegisterScreen}
        options={{ title: '資材登録' }}
      />
      <ProfileStack.Screen
        name="ProjectRegister"
        component={ProjectRegisterScreen}
        options={{ title: 'プロジェクト登録' }}
      />
      <ProfileStack.Screen
        name="ExportSettings"
        component={ExportSettingsScreen}
        options={{ title: 'CSV出力設定' }}
      />
    </ProfileStack.Navigator>
  );
}
