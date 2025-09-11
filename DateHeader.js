// DateHeader.js
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';

export default function DateHeader({ date, onPressOpenPicker }) {
  // YYYY-MM-DD に整形
  const dateKey = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return (
    // ★ 上部の安全領域を確実に確保（Dynamic Island/ノッチ回避）
    <SafeAreaView edges={['top']} style={tw`bg-white`}>
      <View style={tw`px-4 py-2 border-b border-gray-200`}>
        <TouchableOpacity
          onPress={onPressOpenPicker}
          activeOpacity={0.7}
          style={tw`self-start`}
        >
          {/* ★ タップ要素の中身は必ず<Text>で包む */}
          <Text style={tw`text-base font-semibold text-gray-900`}>
            {dateKey(date)}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
