// src/navigation/PhoneNavigator.js
import React, { useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import Ionicons from '@expo/vector-icons/Ionicons';
import HomeStackNavigator from '../screens/phone/HomeStackNavigator';
import ScheduleScreen      from '../screens/phone/ScheduleScreen';
import AttendanceScreen from '../screens/phone/AttendanceScreen';
import MaterialsScreen from '../screens/phone/MaterialsScreen';
import WIPStackNavigator from '../screens/phone/WIPStackNavigator';
// BillingScreen は参照用として残すが、タブには登録しない
// import BillingScreen from '../screens/phone/BillingScreen';
import ProfileStackScreen from '../screens/phone/ProfileStackScreen';
// OverallScreen は残すが、ユーザー要望により下部タブからは非表示
//import OverallStackNavigator from '../screens/phone/OverallStackNavigator';
import { getAuth } from 'firebase/auth';
import { findEmployeeByIdOrEmail, isPrivUser } from '../firestoreService';

const Tab = createBottomTabNavigator();

export default function PhoneNavigator({ userEmail }) {
  const [me, setMe] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const auth = getAuth();
        const email = userEmail || auth?.currentUser?.email || null;
        if (!email) return;
        const emp = await findEmployeeByIdOrEmail(email);
        if (mounted) setMe(emp);
      } catch (_) {}
    })();
    return () => { mounted = false; };
  }, [userEmail]);

  return (
    <Tab.Navigator
      initialRouteName="HomeStack" // ★Overall非表示に伴い、ログイン後の初期タブをHomeへ
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName = 'ellipse-outline';
          switch (route.name) {
            //case 'Overall':    iconName = 'grid-outline'; break;     // ★新規
            case 'Schedule': iconName = 'calendar-outline'; break;
            case 'HomeStack':  iconName = 'home-outline'; break;
            case 'Attendance': iconName = 'time-outline'; break;
            case 'Materials':  iconName = 'cube-outline'; break;
            case 'WIP':        iconName = 'document-text-outline'; break;
            case 'Profile':    iconName = 'person-circle-outline'; break;
            default:           iconName = 'ellipse-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        headerShown: false,
      })}
    >
  {/* Overall はユーザー要望により下部タブから非表示。
      OverallScreen / OverallStackNavigator 自体は残す。 */}

      <Tab.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{ title: '予定' }}
        initialParams={{ userEmail }} // ★ 追加
      />

      {/* ★ その右に Home を配置 */}
      <Tab.Screen
        name="HomeStack"
        component={HomeStackNavigator}
        options={{ title: '本日' }}
        initialParams={{ userEmail }}
      />

      {/* 既存タブは維持（指定がないので残します） */}
      <Tab.Screen
        name="Attendance"
        component={AttendanceScreen}
        options={{ title: '勤怠' }}
        initialParams={{ userEmail }}
      />
      <Tab.Screen
        name="Materials"
        component={MaterialsScreen}
        options={{ title: '資機材' }}
        initialParams={{ userEmail }}      
      />
      <Tab.Screen
        name="WIP"
        component={WIPStackNavigator}
        options={{ title: '出力管理' }}
        initialParams={{ userEmail }} // ★ 追加
      />
      {isPrivUser(me) && (
        <Tab.Screen
          name="Profile"
          component={ProfileStackScreen}
          options={{ title: '設定' }}
          initialParams={{ userEmail }} // ★ 追加
          listeners={({ navigation }) => ({
            tabPress: () => {
              // ★Profileタブを押したら、スタックの中にいても必ず先頭(ProfileMain)へ戻す
              navigation.navigate('Profile', { screen: 'ProfileMain' });
            },
          })}          
        />
      )}

      {/* Billing はタブに出さない（参考用にファイルは残す） */}
    </Tab.Navigator>
  );
}
