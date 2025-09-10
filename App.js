// App.js
import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { DateProvider } from './DateContext';
import { useIsTablet } from './hooks/useIsTablet';
import TabletNavigator from './navigation/TabletNavigator';
import PhoneNavigator from './navigation/PhoneNavigator';
import SignInScreen from './screens/phone/SignInScreen';
import { createStackNavigator } from '@react-navigation/stack';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';

const RootStack = createStackNavigator();

function MainNavigator({ route }) {
  const { userEmail } = route?.params || {};
  const isTablet = useIsTablet();
  return isTablet ? <TabletNavigator userEmail={ userEmail } /> : <PhoneNavigator   userEmail={ userEmail } />;
}

export default function App() {
  // 起動時に匿名サインインして認証状態を確定
  const [authReady, setAuthReady]   = useState(false);
  const [isSignedIn, setSignedIn]   = useState(false);
  const [userEmail, setUserEmail]   = useState(null);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        console.log('[auth] signed in', {
          uid: user.uid,
          isAnonymous: user.isAnonymous,
          email: user.email ?? null,
        });
        setSignedIn(true);
        setUserEmail(user.email ?? null);
        setAuthReady(true);
      } else {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.log('[auth] anonymous sign-in error', e?.message || e);
          // 失敗しても画面は出す（SignIn へ）
          setSignedIn(false);
          setAuthReady(true);
        }
      }
    });
   return unsub;
  }, []);

  if (!authReady) return null; // 瞬間的なローディング（必要ならスプラッシュに置換可）

  return (
    <DateProvider>
      <NavigationContainer>
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          {isSignedIn ? (
            <RootStack.Screen
              name="Main"
              component={MainNavigator}
              initialParams={{ userEmail }}
            />
          ) : (
            <RootStack.Screen name="SignIn" component={SignInScreen} />
          )}
        </RootStack.Navigator>
      </NavigationContainer>
    </DateProvider>
  );
}