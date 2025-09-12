// firebaseConfig.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth,
} from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
// Expo Constants から extra を取得
import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};

const firebaseConfig = {
  apiKey: extra.firebaseApiKey,
  authDomain: extra.authDomain,
  projectId: extra.projectId,
  storageBucket: extra.storageBucket,
  messagingSenderId: extra.messagingSenderId,
  appId: extra.appId,
  measurementId: extra.measurementId,
};

// Hot Reload 対策で単一インスタンス化
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// React Native の Auth は AsyncStorage 永続化を明示
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // 既に初期化済み（Fast Refresh 等）の場合はこちら
  auth = getAuth(app);
}

export { app };
export const db = getFirestore(app);
export const storage = getStorage(app);
export { auth };
