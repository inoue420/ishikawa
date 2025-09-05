// src/screens/phone/OverallStackNavigator.js
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import OverallScreen from './OverallScreen';
import ChangeLog from './ChangeLog';

const Stack = createStackNavigator();

export default function OverallStackNavigator() {
  return (
    <Stack.Navigator>
        <Stack.Screen
        name="OverallMain"
        component={OverallScreen}
        options={{ title: 'Overall', headerShown: false }}
        />
      <Stack.Screen
        name="ChangeLog"
        component={ChangeLog}
        options={{ title: '変更履歴' }}
      />
    </Stack.Navigator>
  );
}
