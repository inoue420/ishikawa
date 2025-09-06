// src/screens/phone/OverallStackNavigator.js
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import OverallScreen from './OverallScreen';
import ChangeLog from './ChangeLog';

const Stack = createStackNavigator();

export default function OverallStackNavigator({ route }) {
  const userEmail = route?.params?.userEmail ?? null;
  return (
    <Stack.Navigator>
        <Stack.Screen
        name="OverallMain"
        component={OverallScreen}
        initialParams={{ userEmail }}
        options={{ title: 'Overall', headerShown: false }}
        />
      <Stack.Screen
        name="ChangeLog"
        component={ChangeLog}
        initialParams={{ userEmail }}
        options={{ title: '変更履歴' }}
      />
    </Stack.Navigator>
  );
}
