// screens/phone/HomeStackNavigator.js
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen          from './HomeScreen';
import ProjectDetailScreen from './ProjectDetailScreen';

const Stack = createStackNavigator();

export default function HomeStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* ホーム画面 */}
      <Stack.Screen     name="Home"           component={HomeScreen}     />
      {/* プロジェクト詳細画面 */}
      <Stack.Screen    name="ProjectDetail"   component={ProjectDetailScreen}      />
    </Stack.Navigator>
  );
}
