// WIPScreenの成功パターンを参考にしたOverallScreen.js
import React, { useState, useContext } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import tw from 'twrnc';
import { DateContext } from '../../DateContext';
import DateHeader from '../../DateHeader';

export default function OverallScreen({ navigation }) {
  const { date: selectedDate, setDate } = useContext(DateContext);
  const [showPicker, setShowPicker] = useState(false);

  const onDateChange = (_event, d) => {
    setShowPicker(false);
    if (d) setDate(d);
  };

  // WIPScreenと同じ方式でinputs管理
  const [inputs, setInputs] = useState({});

  // 左側ボタンの定義
  const verticalBtns = [
    { id: 'attendance', label: '出退勤', onPress: () => navigation.navigate('Attendance'), enabled: true },
    { id: 'daily_report', label: '日報', onPress: () => {}, enabled: false },
    { id: 'materials', label: '資機材登録', onPress: () => navigation.navigate('Materials'), enabled: true },
    { id: 'schedule', label: 'スケジュール/シフト', onPress: () => {}, enabled: false },
    { id: 'project', label: 'プロジェクト', onPress: () => navigation.navigate('HomeStack'), enabled: true },
    { id: 'application', label: '各種申請', onPress: () => {}, enabled: false },
    { id: 'report', label: '報告', onPress: () => {}, enabled: false },
    { id: 'library', label: '図書', onPress: () => {}, enabled: false },
    { id: 'create', label: '作成', onPress: () => {}, enabled: false },
  ];

  const SmallButton = ({ item }) => (
    <View style={tw`mb-4 items-start`}>
      <TouchableOpacity
        disabled={!item.enabled}
        onPress={item.onPress}
        style={tw.style(
          `w-2/3 rounded-2xl px-2 py-2`,
          item.enabled ? `bg-blue-500` : `bg-gray-300`
        )}
      >
        <Text style={tw`text-white text-sm font-bold`}>{item.label}</Text>
      </TouchableOpacity>
      {!item.enabled && (
        <Text style={tw`mt-1 text-gray-600 text-xs`}>リンク未作成</Text>
      )}
    </View>
  );

  return (
    <View style={tw`flex-1 bg-gray-100`}>
      {/* ヘッダー */}
      <DateHeader date={selectedDate} onPressOpenPicker={() => setShowPicker(true)} />
      {showPicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}

      {/* メインコンテンツ */}
      <ScrollView 
        style={tw`flex-1`} 
        contentContainerStyle={tw`p-4`}
      >
        <View style={tw`flex-row`}>
          {/* 左：ボタン列 */}
          <View style={tw`w-5/12 pr-2`}>
            {verticalBtns.map((item) => (
              <SmallButton key={item.id} item={item} />
            ))}
          </View>

          {/* 右：入力フィールド */}
          <View style={tw`w-7/12 pl-2`}>
            <View style={tw`bg-white rounded-2xl p-4 shadow`}>
              <Text style={tw`text-base font-bold mb-4`}>本日の経営状況</Text>

              {/* WIPScreenと全く同じ方式のTextInput */}
              <View style={tw`flex-row items-center mb-3`}>
                <Text style={tw`w-4/12 text-gray-700`}>稼働人数</Text>
                <TextInput
                  style={tw`flex-1 border p-3 rounded-xl text-sm mr-2`}
                  placeholder="数値を入力"
                  keyboardType="numeric"
                  value={inputs['workerCount']?.toString() || ''}
                  onChangeText={v => setInputs(i => ({ ...i, ['workerCount']: v }))}
                />
                <Text style={tw`w-8 text-gray-700`}>人</Text>
              </View>

              <View style={tw`flex-row items-center mb-3`}>
                <Text style={tw`w-4/12 text-gray-700`}>売上</Text>
                <TextInput
                  style={tw`flex-1 border p-3 rounded-xl text-sm mr-2`}
                  placeholder="数値を入力"
                  keyboardType="numeric"
                  value={inputs['sales']?.toString() || ''}
                  onChangeText={v => setInputs(i => ({ ...i, ['sales']: v }))}
                />
                <Text style={tw`w-8 text-gray-700`}>円</Text>
              </View>

              <View style={tw`flex-row items-center mb-3`}>
                <Text style={tw`w-4/12 text-gray-700`}>労務費</Text>
                <TextInput
                  style={tw`flex-1 border p-3 rounded-xl text-sm mr-2`}
                  placeholder="数値を入力"
                  keyboardType="numeric"
                  value={inputs['laborCost']?.toString() || ''}
                  onChangeText={v => setInputs(i => ({ ...i, ['laborCost']: v }))}
                />
                <Text style={tw`w-8 text-gray-700`}>円</Text>
              </View>

              <View style={tw`flex-row items-center mb-3`}>
                <Text style={tw`w-4/12 text-gray-700`}>交通費</Text>
                <TextInput
                  style={tw`flex-1 border p-3 rounded-xl text-sm mr-2`}
                  placeholder="数値を入力"
                  keyboardType="numeric"
                  value={inputs['transportCost']?.toString() || ''}
                  onChangeText={v => setInputs(i => ({ ...i, ['transportCost']: v }))}
                />
                <Text style={tw`w-8 text-gray-700`}>円</Text>
              </View>

              <View style={tw`flex-row items-center mb-3`}>
                <Text style={tw`w-4/12 text-gray-700`}>諸経費</Text>
                <TextInput
                  style={tw`flex-1 border p-3 rounded-xl text-sm mr-2`}
                  placeholder="数値を入力"
                  keyboardType="numeric"
                  value={inputs['miscCost']?.toString() || ''}
                  onChangeText={v => setInputs(i => ({ ...i, ['miscCost']: v }))}
                />
                <Text style={tw`w-8 text-gray-700`}>円</Text>
              </View>

              <View style={tw`flex-row items-center mb-3`}>
                <Text style={tw`w-4/12 text-gray-700`}>事故・クレーム</Text>
                <TextInput
                  style={tw`flex-1 border p-3 rounded-xl text-sm mr-2`}
                  placeholder="数値を入力"
                  keyboardType="numeric"
                  value={inputs['incidents']?.toString() || ''}
                  onChangeText={v => setInputs(i => ({ ...i, ['incidents']: v }))}
                />
                <Text style={tw`w-8 text-gray-700`}>件</Text>
              </View>

              <View style={tw`flex-row items-center mb-3`}>
                <Text style={tw`w-4/12 text-gray-700`}>レンタル・リソース</Text>
                <TextInput
                  style={tw`flex-1 border p-3 rounded-xl text-sm mr-2`}
                  placeholder="数値を入力"
                  keyboardType="numeric"
                  value={inputs['rentals']?.toString() || ''}
                  onChangeText={v => setInputs(i => ({ ...i, ['rentals']: v }))}
                />
                <Text style={tw`w-8 text-gray-700`}>円</Text>
              </View>

              <View style={tw`flex-row items-center mb-3`}>
                <Text style={tw`w-4/12 text-gray-700`}>新規受注</Text>
                <TextInput
                  style={tw`flex-1 border p-3 rounded-xl text-sm mr-2`}
                  placeholder="数値を入力"
                  keyboardType="numeric"
                  value={inputs['newOrders']?.toString() || ''}
                  onChangeText={v => setInputs(i => ({ ...i, ['newOrders']: v }))}
                />
                <Text style={tw`w-8 text-gray-700`}>件</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}