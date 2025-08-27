// screens/phone/ScheduleScreen.js
import React, { useEffect, useMemo, useState, useContext, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import tw from 'twrnc';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { DateContext } from '../../DateContext';
import { fetchProjects } from '../../firestoreService';

// ---------- 日本語ローカライズ ----------
LocaleConfig.locales['ja'] = {
  monthNames: ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
  monthNamesShort: ['1','2','3','4','5','6','7','8','9','10','11','12'],
  dayNames: ['日曜日','月曜日','火曜日','水曜日','木曜日','金曜日','土曜日'],
  dayNamesShort: ['日','月','火','水','木','金','土'],
  today: '今日'
};
LocaleConfig.defaultLocale = 'ja';

// ---------- util ----------
const toDateString = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const fromTimestampOrString = (v) => (v?.toDate ? v.toDate() : new Date(v));
const colorFromId = (id) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 70% 50%)`;
};

export default function ScheduleScreen({ navigation }) {
  const { date, setDate } = useContext(DateContext);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);

  // 1回ロード（必要なら月単位の遅延ロードにも拡張可能）
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const all = await fetchProjects();
        setProjects(all ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 日付キー → その日に重なるプロジェクト配列
  const projMap = useMemo(() => {
    const map = {};
    for (const p of projects) {
      const s = fromTimestampOrString(p.startDate);
      const e = fromTimestampOrString(p.endDate || p.startDate);
      const cur = new Date(s); cur.setHours(0,0,0,0);
      const last = new Date(e); last.setHours(0,0,0,0);
      while (cur <= last) {
        const k = toDateString(cur);
        (map[k] ||= []).push(p);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [projects]);

  const handleSelectDate = useCallback((dateString) => {
    // DateContext の日付を更新し、Home へ遷移
    const [y, m, d] = dateString.split('-').map(Number);
    setDate(new Date(y, m - 1, d));
    navigation.navigate('Home');
  }, [navigation, setDate]);

  const initialDate = useMemo(() => toDateString(date), [date]);

  if (loading) {
    return (
      <View style={tw`flex-1 items-center justify-center`}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={tw`flex-1 bg-gray-50`}>
      <Calendar
        // ← ココがキモ：横スワイプで月移動
        enableSwipeMonths={true}
        // 初期表示（月の切替は自動反映）
        initialDate={initialDate}
        // 上部の月表示を日本語に
        monthFormat={'yyyy年 M月'}
        // 日付タップ
        onDayPress={(d) => handleSelectDate(d.dateString)}
        // 月が変わったら DateContext も先頭日に合わせておくと一貫性UP（任意）
        onMonthChange={(m) => {
          const d = new Date(m.year, m.month - 1, 1);
          setDate(d);
        }}
        // 見た目の微調整
        theme={{
          textMonthFontWeight: '700',
          todayTextColor: '#2563eb',
          arrowColor: '#111827',
        }}
        // 自前の dayComponent で「カラーバー」を表示
        dayComponent={({ date: d, state, onPress }) => {
          const list = projMap[d.dateString] || [];
          const isDim = state === 'disabled'; // 前月・翌月の埋め草
          return (
            <TouchableOpacity onPress={onPress} style={tw`p-1 h-20 w-full`}>
              <Text style={tw.style('text-right text-xs mb-1', isDim ? 'text-gray-400' : 'text-gray-900')}>
                {d.day}
              </Text>
              {/* 最大3本まで横バー、超過は “+n” */}
              {list.slice(0, 3).map((p) => (
                <View
                  key={p.id}
                  style={{
                    height: 4,
                    borderRadius: 2,
                    marginBottom: 2,
                    backgroundColor: colorFromId(p.id),
                  }}
                />
              ))}
              {list.length > 3 && (
                <Text style={tw`text-[10px] text-gray-500`}>+{list.length - 3}</Text>
              )}
            </TouchableOpacity>
          );
        }}
        // 週の開始曜日（日本は一般に日曜）
        firstDay={0}
      />
    </View>
  );
}
