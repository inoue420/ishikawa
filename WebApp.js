 // WebApp.js
 import React from 'react';
 import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
 import { createStackNavigator } from '@react-navigation/stack';

 import HomeScreen from './screens/phone/HomeScreen';
 import UserRegisterScreen from './screens/phone/UserRegisterScreen';

 const Stack = createStackNavigator();

 export default function WebApp() {
   return (
     <NavigationContainer
       linking={{
         prefixes: [typeof window !== 'undefined' ? window.location.origin : '/'],
         config: {
           screens: {
             Home: '',
            UserRegister: 'register',
           },
         },
       }}
       theme={DefaultTheme}
     >
       <Stack.Navigator>
         <Stack.Screen
           name="Home"
           component={HomeScreen}
           options={{ title: 'ISHIKAWA Web' }}
         />
        <Stack.Screen
          name="UserRegister"
          component={UserRegisterScreen}
          options={{ title: 'ユーザー登録' }}
        />
       </Stack.Navigator>
     </NavigationContainer>
   );
 }