// App.js
import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { DateProvider } from './DateContext';
import { useIsTablet } from './hooks/useIsTablet';
import TabletNavigator from './navigation/TabletNavigator';
import PhoneNavigator from './navigation/PhoneNavigator';
import SignInScreen from './screens/phone/SignInScreen';
import { createStackNavigator } from '@react-navigation/stack';

const RootStack = createStackNavigator();

function MainNavigator() {
  const isTablet = useIsTablet();
  return isTablet ? <TabletNavigator /> : <PhoneNavigator />;
}

export default function App() {
  return (
    <DateProvider>
      <NavigationContainer>
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="SignIn" component={SignInScreen} />
          <RootStack.Screen name="Main" component={MainNavigator} />
        </RootStack.Navigator>
      </NavigationContainer>
    </DateProvider>
  );
}