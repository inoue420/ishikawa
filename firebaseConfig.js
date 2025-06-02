// firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDn61Whz74PRXbCKMY2r1FqHmoMfZz8idA",
  authDomain: "ishikawa-73dd6.firebaseapp.com",
  projectId: "ishikawa-73dd6",
  storageBucket: "ishikawa-73dd6.appspot.com",
  messagingSenderId: "605825857189",
  appId: "1:605825857189:web:4961007a489ca0ffc6ff4c",
  measurementId: "G-DL7V0BNQM9"
};

// Firebase を初期化
const app = initializeApp(firebaseConfig);

// Firestore インスタンス
export const db = getFirestore(app);
