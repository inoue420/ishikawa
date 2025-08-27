// src/screens/phone/OverallScreen.js
import React, { useState, useContext, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  TouchableWithoutFeedback, Keyboard
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import tw from 'twrnc';
import { DateContext } from '../../DateContext';
import DateHeader from '../../DateHeader';

export default function OverallScreen({ navigation }) {
  // === HomeScreen と同じ日付コンテキスト＆ピッカー ===
  const { date: selectedDate, setDate } = useContext(DateContext);
  const [showPicker, setShowPicker] = useState(false);

  const onDateChange = (_event, d) => {
    setShowPicker(false);
    if (d) setDate(d);
  };

  // 左側：縦ボタン（左寄せ）
  const verticalBtns = [
    { label: '出退勤',             onPress: () => navigation.navigate('Attendance'), enabled: true },
    { label: '日報',               onPress: () => {},                                 enabled: false },
    { label: '資機材登録',         onPress: () => navigation.navigate('Materials'),  enabled: true },
    { label: 'スケジュール/シフト', onPress: () => {},                                 enabled: false },
    { label: 'プロジェクト',       onPress: () => navigation.navigate('HomeStack'),  enabled: true },
    { label: '各種申請',           onPress: () => {},                                 enabled: false },
    { label: '報告',               onPress: () => {},                                 enabled: false },
    { label: '図書',               onPress: () => {},                                 enabled: false },
    { label: '作成',               onPress: () => {},                                 enabled: false },
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

  // 右側：指標入力（指定の8項目） — 確定方式へ変更
  const [metrics, setMetrics] = useState({
    workerCount: '',   // 稼働人数（人）
    sales: '',         // 売上（円）
    laborCost: '',     // 労務費（円）
    transportCost: '', // 交通費（円）
    miscCost: '',      // 諸経費（円）
    incidents: '',     // 事故・クレーム（件）
    rentals: '',       // レンタル・リソース（円）
    newOrders: '',     // 新規受注（件）
  });

  // 入力中は draft にだけ入れる（確定時に metrics へ反映）
  const [draftMetrics, setDraftMetrics] = useState(metrics);
  useEffect(() => {
    // 初期表示/他所でmetricsが変わった場合に同期
    setDraftMetrics(metrics);
  }, []); // 初回のみ同期（必要なら metrics を依存に）

  // 入力値を数字だけにフィルタ
  const numOnly = (v) => v.replace(/[^0-9]/g, '');

  const onChangeDraft = (key, v) => {
    setDraftMetrics(prev => ({ ...prev, [key]: numOnly(v) }));
  };

  // どこかタップして確定
  const commitDraft = () => {
    setMetrics(draftMetrics);
    Keyboard.dismiss();
  };

  // 各フィールドを離れたら確定（念のため）
  const onEndEditingField = () => {
    setMetrics(draftMetrics);
  };

  // 行：ラベル・入力・単位
  const FieldRow = ({ label, keyName, unit }) => (
    <View style={tw`flex-row items-center mb-3`}>
      <Text style={tw`w-4/12 text-gray-700`}>{label}</Text>
      <TextInput
        value={draftMetrics[keyName]}
        onChangeText={(v) => onChangeDraft(keyName, v)}
        onEndEditing={onEndEditingField}
        keyboardType="number-pad"
        placeholder="数値を入力"
        style={tw`flex-1 border rounded-xl p-3 text-sm`}
      />
      <Text style={tw`ml-2 w-8 text-gray-700`}>{unit}</Text>
    </View>
  );

  return (
    <View style={tw`flex-1`}>
      {/* --- 固定ヘッダー（白背景） --- */}
      <DateHeader date={selectedDate} onPressOpenPicker={() => setShowPicker(true)} />
      {showPicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}

      {/* --- 本文のみスクロール（タップで確定） --- */}
      <TouchableWithoutFeedback onPress={commitDraft}>
        <ScrollView
          style={tw`flex-1`}
          contentContainerStyle={tw`p-4 pb-24`}
          keyboardShouldPersistTaps="handled"
        >
          <View style={tw`flex-row`}>
            {/* 左：ボタン列（5/12） */}
            <View style={tw`w-5/12 pr-2`}>
              {verticalBtns.map((item, idx) => (
                <SmallButton key={`v-${idx}`} item={item} />
              ))}
            </View>

            {/* 右：指標入力（7/12） */}
            <View style={tw`w-7/12 pl-2`}>
              <View style={tw`bg-white rounded-2xl p-4 shadow`}>
                <Text style={tw`text-base font-bold mb-4`}>本日の経営状況</Text>

                <FieldRow label="稼働人数"           keyName="workerCount"   unit="人" />
                <FieldRow label="売上"               keyName="sales"         unit="円" />
                <FieldRow label="労務費"             keyName="laborCost"     unit="円" />
                <FieldRow label="交通費"             keyName="transportCost" unit="円" />
                <FieldRow label="諸経費"             keyName="miscCost"      unit="円" />
                <FieldRow label="事故・クレーム"     keyName="incidents"     unit="件" />
                <FieldRow label="レンタル・リソース" keyName="rentals"       unit="円" />
                <FieldRow label="新規受注"           keyName="newOrders"     unit="件" />

                {/* （任意）明示的に確定したい人向けのボタン */}
                {/* <TouchableOpacity onPress={commitDraft} style={tw`mt-2 self-end bg-blue-500 rounded-xl px-3 py-2`}>
                  <Text style={tw`text-white text-sm`}>数値を確定</Text>
                </TouchableOpacity> */}
              </View>
            </View>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </View>
  );
}
