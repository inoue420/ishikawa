// app.config.js
import 'dotenv/config';

export default ({ config }) => ({
  ...config,            // 既存の app.json の内容を維持
  extra: {
    ...(config.extra ?? {}),
    firebaseApiKey:    process.env.FIREBASE_API_KEY,
    authDomain:        process.env.FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.FIREBASE_PROJECT_ID,
    storageBucket:     process.env.FIREBASE_STORAGE_BUCKET,   // 例: ishikawa-73dd6.appspot.com
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.FIREBASE_APP_ID,
    measurementId:     process.env.FIREBASE_MEASUREMENT_ID,
  },
});
