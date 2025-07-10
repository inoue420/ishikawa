// src/hooks/useIsTablet.js
import { useWindowDimensions } from 'react-native';

export const useIsTablet = () => {
  const { width, height } = useWindowDimensions();
  // 最短辺が720(dp)以上ならタブレット
  return Math.min(width, height) >= 720;
};
