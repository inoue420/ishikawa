// WIPScreenの成功パターンを参考にしたOverallScreen.js
import React, { useState, useContext, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, RefreshControl
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import tw from 'twrnc';
import { DateContext } from '../../DateContext';
import DateHeader from '../../DateHeader';
import { fetchProjectsOverlappingRange } from '../../firestoreService'; // ★ 追加
import { useFocusEffect } from '@react-navigation/native';

export default function OverallScreen({ navigation, route }) {
  const TTL_MS = 60 * 1000; // 60秒
  const { date: selectedDate, setDate } = useContext(DateContext);
  const [showPicker, setShowPicker] = useState(false);
  const onDateChange = (_event, d) => {
    setShowPicker(false);
    if (d) setDate(d);
  };

  // 表示用フォーマッタ
  const fmtJPY = useCallback((n) => {
    if (n === null || n === undefined) return '';
    const num = Number(n);
    return Number.isFinite(num) ? num.toLocaleString('ja-JP') : '';
  }, []);

  // 合計値（読取専用表示に使う）
  const [totals, setTotals] = useState({
    sales: 0,           // 売上（受注金額合計）
    laborCost: 0,       // 人件費（日割り/単日は実時間）
    transportCost: 0,   // 交通費合計
    miscCost: 0,        // 諸経費合計
    rentals: 0,         // レンタル・リソース費用合計
    newOrders: 0,       // 新規受注件数
  });

  // 指定日の00:00～23:59に正規化（参照を安定化）
  const { dayStart, dayEnd } = useMemo(() => {
    const ds = new Date(
      selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0, 0
    );
    const de = new Date(
      selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59, 999
    );
    return { dayStart: ds, dayEnd: de };
  }, [selectedDate]);

  // 日付のみ比較
  const dateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDaysInclusive = (s, e) =>
    Math.floor((dateOnly(e) - dateOnly(s)) / 86400000) + 1;

  // Firestore Timestamp or Date → Date
  const toDate = (v) => (v?.toDate ? v.toDate() : (v ? new Date(v) : null));

  // ▼ TTL + 重複fetchガード
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastFetchRef = useRef({ key: null, at: 0 });
  const reqSeqRef = useRef(0);
  const refreshingRef = useRef(false);
  const dateKey = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const loadTotals = useCallback(async ({ force = false, withSpinner = false } = {}) => {
    const key = dateKey(selectedDate);
    const now = Date.now();
    const isStale =
      force ||
      lastFetchRef.current.key !== key ||
      now - lastFetchRef.current.at > TTL_MS;
    if (!isStale || refreshingRef.current) return;

    const mySeq = ++reqSeqRef.current;
    refreshingRef.current = true;
    let didSetSpinner = false;
    if (withSpinner) {
      setIsRefreshing(true); didSetSpinner = true;
    }
    try {
      const list = await fetchProjectsOverlappingRange(dayStart, dayEnd);
      if (mySeq !== reqSeqRef.current) return; // 古い応答は破棄

      let sales = 0, labor = 0, transport = 0, misc = 0, rentals = 0, newOrders = 0;
      for (const proj of list) {
        const s = toDate(proj.startDate);
        const e = toDate(proj.endDate) || s;
        sales += Number(proj.orderAmount || 0);
        const totalLabor = Number(proj.laborCost || 0);
        const isMulti = s && e && (s.toDateString() !== e.toDateString());
        if (totalLabor > 0) {
          if (isMulti) {
            const days = Math.max(1, diffDaysInclusive(s, e));
            labor += Math.round(totalLabor / days);
          } else {
            labor += totalLabor;
          }
        }
        transport += Number(proj.travelCost || 0);
        misc      += Number(proj.miscExpense || 0);
        const rr = (proj.rentalResourceCost != null)
          ? Number(proj.rentalResourceCost)
          : Number(proj.areaSqm || 0) * 70000;
        rentals += rr;
        if (proj.projectType === 'new') newOrders += 1;
      }
      setTotals({ sales, laborCost: labor, transportCost: transport, miscCost: misc, rentals, newOrders });
      lastFetchRef.current = { key, at: now };
    } catch (e) {
      console.warn('[OverallScreen] loadTotals error:', e?.message || e);
    } finally {
      refreshingRef.current = false;
      if (didSetSpinner) setIsRefreshing(false);
    }
  }, [selectedDate, dayStart, dayEnd]);

  // 画面フォーカス時：TTLに従って再取得
  useFocusEffect(useCallback(() => { loadTotals({ force: false, withSpinner: false }); }, [loadTotals]));
  // 日付変更時：強制更新
  useEffect(() => { loadTotals({ force: true, withSpinner: false }); }, [selectedDate, loadTotals]); 

  // WIPScreenと同じ方式でinputs管理（手入力が必要な項目だけ使う）
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
    { id: 'changeLog', label: '編集履歴', onPress: () => navigation.navigate('ChangeLog'), enabled: true },
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
        <Text style={tw`text-white text-sm font-bold`}><Text>{item.label}</Text></Text>
      </TouchableOpacity>
      {!item.enabled && (
        <Text style={tw`mt-1 text-gray-600 text-xs`}><Text>リンク未作成</Text></Text>
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
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadTotals({ force: true, withSpinner: true })}
          />
        }        
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

              {/* 稼働人数（要件対象外=手入力のまま） */}
              <View style={tw`flex-row items-center mb-3`}>
                <Text style={tw`w-4/12 text-gray-700`}>稼働人数</Text>
                <TextInput
                  style={tw`flex-1 border p-3 rounded-xl text-sm mr-2 text-right`}
                  placeholder="数値を入力"
                  keyboardType="numeric"
                  value={inputs['workerCount']?.toString() || ''}
                  onChangeText={v => setInputs(i => ({ ...i, ['workerCount']: v }))}
                />
                <Text style={tw`w-8 text-gray-700`}>人</Text>
              </View>

              {/* ▼ 以下、読取専用（自動反映） */}
              <View style={tw`flex-row items-center mb-3`}>
                <Text style={tw`w-4/12 text-gray-700`}>売上</Text>
                <TextInput
                  style={tw`flex-1 border rounded-xl mr-2 bg-gray-100 px-2 py-2 text-xs text-right`}
                  editable={false}
                  selectTextOnFocus={false}
                  value={fmtJPY(totals.sales)}
                />
                <Text style={tw`w-4 text-gray-700`}>円</Text>
              </View>

              <View style={tw`flex-row items-center mb-3`}>
                <Text style={tw`w-4/12 text-gray-700`}>労務費</Text>
                <TextInput
                  style={tw`flex-1 border rounded-xl mr-2 bg-gray-100 px-2 py-2 text-xs text-right`}
                  editable={false}
                  selectTextOnFocus={false}
                  value={fmtJPY(totals.laborCost)}
                />
                <Text style={tw`w-4 text-gray-700`}>円</Text>
              </View>

              <View style={tw`flex-row items-center mb-3`}>
                <Text style={tw`w-4/12 text-gray-700`}>交通費</Text>
                <TextInput
                  style={tw`flex-1 border rounded-xl mr-2 bg-gray-100 px-2 py-2 text-xs text-right`}
                  editable={false}
                  selectTextOnFocus={false}
                  value={fmtJPY(totals.transportCost)}
                />
                <Text style={tw`w-4 text-gray-700`}>円</Text>
              </View>

              <View style={tw`flex-row items-center mb-3`}>
                <Text style={tw`w-4/12 text-gray-700`}>諸経費</Text>
                <TextInput
                  style={tw`flex-1 border rounded-xl mr-2 bg-gray-100 px-2 py-2 text-xs text-right`}
                  editable={false}
                  selectTextOnFocus={false}
                  value={fmtJPY(totals.miscCost)}
                />
                <Text style={tw`w-4 text-gray-700`}>円</Text>
              </View>

              <View style={tw`flex-row items-center mb-3`}>
                <Text style={tw`w-4/12 text-gray-700`}>レンタル・リソース</Text>
                <TextInput
                  style={tw`flex-1 border rounded-xl mr-2 bg-gray-100 px-2 py-2 text-xs text-right`}
                  editable={false}
                  selectTextOnFocus={false}
                  value={fmtJPY(totals.rentals)}
                />
                <Text style={tw`w-4 text-gray-700`}>円</Text>
              </View>

              <View style={tw`flex-row items-center mb-3`}>
                <Text style={tw`w-4/12 text-gray-700`}>新規受注</Text>
                <TextInput
                  style={tw`flex-1 border p-3 rounded-xl text-sm mr-2 bg-gray-100 text-right`}
                  editable={false}
                  selectTextOnFocus={false}
                  value={String(totals.newOrders)}
                />
                <Text style={tw`w-8 text-gray-700`}>件</Text>
              </View>

              {/* 事故・クレーム（手入力のまま） */}
              <View style={tw`flex-row items-center mb-3`}>
                <Text style={tw`w-4/12 text-gray-700`}>事故・クレーム</Text>
                <TextInput
                  style={tw`flex-1 border p-3 rounded-xl text-sm mr-2 text-right`}
                  placeholder="数値を入力"
                  keyboardType="numeric"
                  value={inputs['incidents']?.toString() || ''}
                  onChangeText={v => setInputs(i => ({ ...i, ['incidents']: v }))}
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
