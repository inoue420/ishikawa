// DateHeader.js
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
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
    // ★ 上部を白で塗りつぶし、余白を確保
    <View style={tw`bg-white w-full px-4 py-3 mb-4`}>
      <View style={tw`flex-row justify-between items-center`}>
        <TouchableOpacity onPress={onPressOpenPicker}>
          <Text style={tw`text-xl font-bold`}>{dateKey(date)}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
