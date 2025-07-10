// src/navigation/PhoneNavigator.js
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
// ...（アイコン＆画面はタブレットと同じものを一旦流用）
import Ionicons             from '@expo/vector-icons/Ionicons';
import HomeScreen           from '../screens/tablet/HomeScreen';
import AttendanceScreen     from '../screens/tablet/AttendanceScreen';
import MaterialsScreen      from '../screens/tablet/MaterialsScreen';
import WIPScreen            from '../screens/tablet/WIPScreen';
import BillingScreen        from '../screens/tablet/BillingScreen';
import ProfileStackScreen   from '../screens/tablet/ProfileStackScreen';

const Tab = createBottomTabNavigator();

export default function PhoneNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName = 'ellipse-outline';
          switch (route.name) {
            case 'Home':       iconName = 'home-outline'; break;
            case 'Attendance': iconName = 'time-outline'; break;
            case 'Materials':  iconName = 'cube-outline'; break;
            case 'WIP':        iconName = 'construct-outline'; break;
            case 'Billing':    iconName = 'document-text-outline'; break;
            case 'Profile':    iconName = 'person-circle-outline'; break;
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor:   '#007AFF',
        tabBarInactiveTintColor: 'gray',
        headerShown:             false,
      })}
    >
      <Tab.Screen name="Home"       component={HomeScreen} />
      <Tab.Screen name="Attendance" component={AttendanceScreen} />
      <Tab.Screen name="Materials"  component={MaterialsScreen} />
      <Tab.Screen name="WIP"        component={WIPScreen} />
      <Tab.Screen name="Billing"    component={BillingScreen} />
      <Tab.Screen name="Profile"    component={ProfileStackScreen} />
    </Tab.Navigator>
  );
}
