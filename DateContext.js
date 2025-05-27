// DateContext.js (置き場所: プロジェクトルート／App.jsと同階層)
import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DateContext = createContext({
  date: new Date(),
  setDate: () => {},
});

export const DateProvider = ({ children }) => {
  const [date, setDate] = useState(new Date());

  // マウント時に保存済み日付を読込
  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem('@current_date');
      if (stored) setDate(new Date(stored));
    })();
  }, []);

  // 日付変更時に永続化
  useEffect(() => {
    AsyncStorage.setItem('@current_date', date.toISOString()).catch(console.error);
  }, [date]);

  return (
    <DateContext.Provider value={{ date, setDate }}>
      {children}
    </DateContext.Provider>
  );
};