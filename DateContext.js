// DateContext.js
import React, { createContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DateContext = createContext({
  date: new Date(),
  formattedDate: '',       // 追加
  setDate: () => {},
});

export function DateProvider({ children }) {
  // 初期値を「今日」に設定
  const [date, setDate] = useState(new Date());

  // （必要なら）AsyncStorage に永続化
  useEffect(() => {
    AsyncStorage.setItem('@selected_date', date.toISOString());
  }, [date]);

  // date が変わるたびにフォーマット
  const formattedDate = useMemo(() => {
    return date.toLocaleDateString('ja-JP', {
      year:  'numeric',
      month: '2-digit',
      day:   '2-digit',
    });
  }, [date]);

  return (
    <DateContext.Provider value={{ date, formattedDate, setDate }}>
      {children}
    </DateContext.Provider>
  );
}
