// App.js
import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { DateProvider }         from './DateContext';
import { useIsTablet }          from './hooks/useIsTablet';

import TabletNavigator from './navigation/TabletNavigator';
import PhoneNavigator  from './navigation/PhoneNavigator';

export default function App() {
  const isTablet = useIsTablet();

  return (
    <DateProvider>
      <NavigationContainer>
        {isTablet
          ? <TabletNavigator />
          : <PhoneNavigator  />}
      </NavigationContainer>
    </DateProvider>
  );
}
