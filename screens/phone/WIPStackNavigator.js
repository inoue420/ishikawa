//src/screens/phone/WIPStackNavigator.js
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import WIPScreen from './WIPScreen';
import InvoiceEditorScreen from './InvoiceEditorScreen';
import PDFPreviewScreen from './PDFPreviewScreen';

const Stack = createStackNavigator();

export default function WIPStackNavigator({ route }) {
  // Tab.Screen initialParams（userEmail など）を受け取る
  const initial = route?.params ?? {};
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="WIPMain"
        component={WIPScreen}
        options={{ title: 'WIP' }}
        initialParams={initial}
      />
      <Stack.Screen
        name="InvoiceEditor"
        component={InvoiceEditorScreen}
        options={{ title: '請求書' }}
      />
      <Stack.Screen
        name="PDFPreview"
        component={PDFPreviewScreen}
        options={{ title: 'PDFプレビュー' }}
      />
    </Stack.Navigator>
  );
}
