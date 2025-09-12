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

const extra = Constants.expoConfig?.extra ?? 
Constants?.manifest?.extra ??
 {};

const firebaseConfig = {
  apiKey: extra.firebaseApiKey,
  authDomain: extra.authDomain,
  projectId: extra.projectId,
  storageBucket: extra.storageBucket,
  messagingSenderId: extra.messagingSenderId,
  appId: extra.appId,
  measurementId: extra.measurementId,
};

console.log("[firebaseConfig] from extra", {
  apiKey: (extra.firebaseApiKey || "").slice(0, 6) + "…",
  storageBucket: firebaseConfig.storageBucket,
});
if (!firebaseConfig.apiKey) {
  console.warn("[firebaseConfig] Missing API key. Check .env / EAS Secrets.");
}

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

console.log("[firebaseConfig] app.options", {
  projectId: app?.options?.projectId,
  apiKey: (app?.options?.apiKey || "").slice(0, 6) + "…",
  storageBucket: app?.options?.storageBucket,
});

export { app };
export const db = getFirestore(app);
export const storage = getStorage(app);
export { auth };
