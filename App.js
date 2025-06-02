import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DateProvider } from './DateContext';

// Main Screens
import HomeScreen from './screens/HomeScreen';
import AttendanceScreen from './screens/AttendanceScreen';
import MaterialsScreen from './screens/MaterialsScreen';
import WIPScreen from './screens/WIPScreen';
import BillingScreen from './screens/BillingScreen';

// Profile and Registration Screens
import ProfileScreen from './screens/ProfileScreen';
import UserRegisterScreen from './screens/UserRegisterScreen';
import MaterialRegisterScreen from './screens/MaterialRegisterScreen';
import ProjectRegisterScreen from './screens/ProjectRegisterScreen';
import ExportSettingsScreen from './screens/ExportSettingsScreen'; // 追加

const Tab = createBottomTabNavigator();
const ProfileStack = createStackNavigator();

function ProfileStackScreen() {
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

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // TODO: Firebase Auth の状態管理
  }, []);

  return (
    <DateProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            tabBarIcon: ({ color, size }) => {
              let iconName;
              switch (route.name) {
                case 'Home':
                  iconName = 'home-outline';
                  break;
                case 'Attendance':
                  iconName = 'time-outline';
                  break;
                case 'Materials':
                  iconName = 'cube-outline';
                  break;
                case 'WIP':
                  iconName = 'construct-outline';
                  break;
                case 'Billing':
                  iconName = 'document-text-outline';
                  break;
                case 'Profile':
                  iconName = 'person-circle-outline';
                  break;
                default:
                  iconName = 'ellipse-outline';
              }
              return <Ionicons name={iconName} size={size} color={color} />;
            },
            tabBarActiveTintColor: '#007AFF',
            tabBarInactiveTintColor: 'gray',
            headerShown: false,
          })}
        >
          <Tab.Screen name="Home" component={HomeScreen} />
          <Tab.Screen name="Attendance" component={AttendanceScreen} />
          <Tab.Screen name="Materials" component={MaterialsScreen} />
          <Tab.Screen name="WIP" component={WIPScreen} />
          <Tab.Screen name="Billing" component={BillingScreen} />
          <Tab.Screen name="Profile" component={ProfileStackScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </DateProvider>
  );
}
