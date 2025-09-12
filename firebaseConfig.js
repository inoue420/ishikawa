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

const firebaseConfig = {
  apiKey: "AIzaSyDn61Whz74PRXbCKMY2r1FqHmoMfZz8idA",
  authDomain: "ishikawa-73dd6.firebaseapp.com",
  projectId: "ishikawa-73dd6",
  storageBucket: "ishikawa-73dd6.firebasestorage.app",
  messagingSenderId: "605825857189",
  appId: "1:605825857189:web:4961007a489ca0ffc6ff4c",
  measurementId: "G-DL7V0BNQM9",
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
