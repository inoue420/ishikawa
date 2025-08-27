// screens/phone/ScheduleScreen.js
import React, { useEffect, useMemo, useState, useContext, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import tw from 'twrnc';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { DateContext } from '../../DateContext';
import { fetchProjectsOverlappingRange } from '../../firestoreService';
import { useRef } from 'react';

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
const hslToHex = (h, s, l) => {
   s/=100; l/=100;
   const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2;
   let [r,g,b]=[0,0,0];
   if (h<60) [r,g,b]=[c,x,0]; else if (h<120) [r,g,b]=[x,c,0];
   else if (h<180) [r,g,b]=[0,c,x]; else if (h<240) [r,g,b]=[0,x,c];
   else if (h<300) [r,g,b]=[x,0,c]; else [r,g,b]=[c,0,x];
   const toHex = v => Math.round((v+m)*255).toString(16).padStart(2,'0');
   return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
 };
 const colorFromId = (id) => {
   let hash = 0;
   for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
   const hue = Math.abs(hash) % 360;
   return hslToHex(hue, 70, 50);
 };

export default function ScheduleScreen({ navigation }) {
  const { date, setDate } = useContext(DateContext);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const cacheRef = useRef(new Map()); 
  // 表示中の月（1日固定）をトラッキング
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const d = new Date(date); return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const theme = useMemo(() => ({
    textMonthFontWeight: '700',
    todayTextColor: '#2563eb',
    arrowColor: '#111827',
  }), []);



  // 表示している月だけロード（前後にバッファ数日つけて帯切れを回避）
  useEffect(() => {
    
    (async () => {
      setLoading(true);
      try {
        const start = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
        const end   = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);
        // バッファ（例：前後3日）…月またぎの帯を自然に見せるため
        const pad = 3;
        const rangeStart = new Date(start); rangeStart.setDate(rangeStart.getDate() - pad); rangeStart.setHours(0,0,0,0);
        const rangeEnd   = new Date(end);   rangeEnd.setDate(rangeEnd.getDate() + pad);   rangeEnd.setHours(23,59,59,999);
        const ym = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth()+1).padStart(2,'0')}`;
        if (cacheRef.current.has(ym)) {
          setProjects(cacheRef.current.get(ym));
          setLoading(false);
          return;
        }
        const rows = await fetchProjectsOverlappingRange(rangeStart, rangeEnd);
       const data = rows ?? [];
       cacheRef.current.set(ym, data);
       setProjects(data);
      } catch (e) {
       console.error('[Schedule] fetch error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [visibleMonth]);

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
    navigation.navigate('HomeStack', { screen: 'Home' });
  }, [navigation, setDate]);


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
        current={toDateString(visibleMonth)}   // ← “表示している月”を制御
        // 上部の月表示を日本語に
        monthFormat={'yyyy年 M月'}
        // 日付タップ
        onDayPress={(d) => handleSelectDate(d.dateString)}
        // 月が変わったら、表示月を更新→その月だけ再取得
        onMonthChange={(m) => {
          // 同じ月を何度もセットしないガード
          if (
            visibleMonth.getFullYear() === m.year &&
            visibleMonth.getMonth() === m.month - 1
          ) return;
          setVisibleMonth(new Date(m.year, m.month - 1, 1));
        }}
        theme={theme}
        // 自前の dayComponent で「カラーバー」を表示
        dayComponent={({ date: d, state }) => {
          const list = projMap[d.dateString] || [];
          const isDim = state === 'disabled'; // 前月・翌月の埋め草
          return (
            <TouchableOpacity onPress={() => handleSelectDate(d.dateString)} style={tw`p-1 h-20 w-full`}>              <Text style={tw.style('text-right text-xs mb-1', isDim ? 'text-gray-400' : 'text-gray-900')}>
                {d.day}
              </Text>
              {/* 最大3本まで横バー、超過は “+n” */}
              {list.slice(0, 3).map((p, i) => (
                <View
                  key={`${p.id ?? p.title ?? i}`}
                  style={{
                    height: 4,
                    borderRadius: 2,
                    marginBottom: 2,
                    backgroundColor: colorFromId(String(p.id ?? p.title ?? i)),
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
