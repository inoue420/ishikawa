// screens/phone/HomeStackNavigator.js
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen          from './HomeScreen';
import ProjectDetailScreen from './ProjectDetailScreen';

const Stack = createStackNavigator();

export default function HomeStackNavigator() {
  return (
   <Stack.Navigator     screenOptions={{headerShown: false,}} >
     <Stack.Screen name="HomeList" component={HomeScreen}   />      
     <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} options={{ title: '詳細' }} />
    </Stack.Navigator>
  );
}
