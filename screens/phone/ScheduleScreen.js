// screens/phone/ScheduleScreen.js
import React, { useEffect, useMemo, useState, useContext, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';
import { CalendarList, LocaleConfig } from 'react-native-calendars';
import { DateContext } from '../../DateContext';
import { fetchProjectsOverlappingRange } from '../../firestoreService';

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

// ===== 表示調整（必要に応じて調整OK） =====
 const MAX_LANES    = 4;   // 1日あたり最大4行
 const CELL_HEIGHT  = 90; // セルの高さ（最終週も入るよう少し余裕）
 const BAR_HEIGHT   = 18;  // バーの高さ
 const HEADER_SPACE = 72;  // 見出し(曜日名＋月名)ぶんの概算高さ
 const CAL_HEIGHT   = HEADER_SPACE + CELL_HEIGHT * 6 + 4; // 6週ぶんを確保

export default function ScheduleScreen({ navigation }) {
  const { date, setDate } = useContext(DateContext);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const cacheRef = useRef(new Map());
  const screenWidth = Dimensions.get('window').width;
  const dayWidth = useMemo(() => screenWidth / 7, [screenWidth]);

  // 表示中の月（1日固定）
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const d = new Date(date);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const theme = useMemo(() => ({
    textMonthFontWeight: '700',
    todayTextColor: '#2563eb',
    arrowColor: '#111827',
  }), []);

  // 月単位ロード（前後3日バッファ）
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const start = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
        const end   = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);
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

  /**
   * 週内で lane（段）を固定し、日ごとに「その日の各段に何を描くか」を決める。
   * dayLayout: {
   *   'YYYY-MM-DD': {
   *     lanes: [ {title, color, isStart, isEnd}, ...MAX_LANES ],
   *     overflow: number // 5件目以降など
   *   }, ...
   * }
   */
  const dayLayout = useMemo(() => {
    const layout = {};
    const weekLane = new Map(); // weekKey(日曜) → Map(projectKey → lane)

    const ensureDay = (k) => {
      if (!layout[k]) layout[k] = { lanes: Array(MAX_LANES).fill(null), overflow: 0 };
      return layout[k];
    };
    const getWeekKey = (d) => {
      const dd = new Date(d); dd.setHours(0,0,0,0);
      const dow = dd.getDay();         // 0:Sun
      const sun = new Date(dd); sun.setDate(dd.getDate() - dow);
      return toDateString(sun);
    };

    projects.forEach((p) => {
      const s0 = fromTimestampOrString(p.startDate);
      const e0 = fromTimestampOrString(p.endDate || p.startDate);
      const s = new Date(s0.getFullYear(), s0.getMonth(), s0.getDate());
      const e = new Date(e0.getFullYear(), e0.getMonth(), e0.getDate());

      const projectKey = String(p.id ?? p.title ?? '');
      const title = String(p.title ?? p.name ?? p.id ?? '（無題）');
      const color = colorFromId(projectKey);

      let cur = new Date(s);
      while (cur <= e) {
        const wk = getWeekKey(cur);
        if (!weekLane.has(wk)) weekLane.set(wk, new Map());
        const laneMap = weekLane.get(wk);

        // 週内 lane をプロジェクトごとに固定
        let lane = laneMap.get(projectKey);
        if (lane == null) {
          const used = new Set(laneMap.values());
          // 空いてる段（0..MAX_LANES-1）を探す
          let found = -1;
          for (let i = 0; i < MAX_LANES; i++) if (!used.has(i)) { found = i; break; }
          if (found === -1) found = MAX_LANES - 1; // あふれたら一旦最終段候補（当日埋まってたら overflow）
          lane = found;
          laneMap.set(projectKey, lane);
        }

        // 週内セグメント（Sun〜Sat）
        const weekStart = new Date(getWeekKey(cur));
        const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
        const segStart  = new Date(Math.max(cur, s));
        const segEnd    = new Date(Math.min(weekEnd, e));

        // セグメント長（週内での連続区間）と中央インデックス
        const segLen = Math.round((segEnd - segStart) / 86400000) + 1;
        const midIdx = Math.floor((segLen - 1) / 2);
        // セグメント上の各日へ配置
        let d = new Date(segStart);
        let idx = 0;
        while (d <= segEnd) {
          const k = toDateString(d);
          const day = ensureDay(k);

          // laneが空いていなければ次の空きへ、なければoverflow
          let targetLane = lane;
          while (targetLane < MAX_LANES && day.lanes[targetLane]) targetLane++;
          if (targetLane >= MAX_LANES) {
            day.overflow += 1;
          } else {
            const isStart = (k === toDateString(segStart));
            const isEnd   = (k === toDateString(segEnd));
            day.lanes[targetLane] = {
              title,
              color,
              isStart,
              isEnd,
              showLabel: idx === midIdx, // ← 週内セグメントの中央日だけラベル表示
              segLen,                    // セグメント長（週内）
              midIdx,                    // 中央位置（0始まり）
            };
          }

          d.setDate(d.getDate() + 1);
          idx += 1;
        }

        // 次の週へ
        const next = new Date(weekEnd); next.setDate(weekEnd.getDate() + 1);
        cur = next;
      }
    });

    return layout;
  }, [projects]);

  const handleSelectDate = useCallback((dateString) => {
    const [y, m, d] = dateString.split('-').map(Number);
    setDate(new Date(y, m - 1, d));
    navigation.navigate('HomeStack', { screen: 'Home' });
  }, [navigation, setDate]);

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={tw`flex-1 justify-center items-center`}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  // ▼ カスタム dayComponent：4行までバー＋他n件、バー内にプロジェクト名
  const DayCell = ({ date: d, state }) => {
    const isDim = state === 'disabled';
    const k = d.dateString;
    const info = dayLayout[k] || { lanes: [], overflow: 0 };

    return (
     <TouchableOpacity
       onPress={() => handleSelectDate(k)}
       activeOpacity={0.8}
       // 横の余白を完全にゼロにして隣日とピッタリ接する
       style={[tw`w-full`, { height: CELL_HEIGHT, paddingTop: 2, paddingHorizontal: 0 }]}
     >
        {/* 日付数字（必ず<Text>で包む） */}
       <Text style={tw.style('text-right text-xs mb-1 mr-1', isDim ? 'text-gray-400' : 'text-gray-900')}>
          {String(d.day)}
        </Text>

        {/* バー群 */}
       <View style={{ gap: 0 }}>
          {info.lanes.slice(0, MAX_LANES).map((laneItem, i) => {
            if (!laneItem) {
              // 空段はスペーサーを入れて高さを維持
              return <View key={`empty-${i}`} style={{ height: BAR_HEIGHT, marginBottom: 2 }} />;
            }
           const { title, color, isStart, isEnd, showLabel, segLen, midIdx } = laneItem;
            return (
              <View
                key={`bar-${i}-${k}`}
                style={{
                  height: BAR_HEIGHT,
                  marginBottom: 2,
                  backgroundColor: color,
                  paddingHorizontal: 4,
                  justifyContent: 'center',
                  alignItems: 'center',
                  position: 'relative',     // オーバーレイの基準
                  overflow: 'visible',      // 横にはみ出すため
                  borderBottomLeftRadius:isStart ? 6 : 0,
                  borderTopRightRadius:  isEnd   ? 6 : 0,
                  borderBottomRightRadius:isEnd  ? 6 : 0,
                }}
              >
               {/* 連続バーの中央日だけタイトルを表示（必ず<Text>で包む） */}
               {/* 中央日のみ“バー全長”に見える横断ラベルを重ねる */}
               {showLabel ? (
                 <View
                   pointerEvents="none"
                   style={{
                     position: 'absolute',
                     top: 0,
                     left: -(midIdx * dayWidth),    // 左側へ日数ぶんはみ出す
                     width: (segLen * dayWidth),    // セグメント全長
                     height: BAR_HEIGHT,
                     justifyContent: 'center',
                     alignItems: 'center',
                   }}
                 >
                   <Text
                     numberOfLines={1}
                     ellipsizeMode="clip"
                     allowFontScaling={false}
                     style={tw`text-[10px] text-white font-semibold`}
                   >
                     {title}
                   </Text>
                 </View>
               ) : null}
              </View>
            );
          })}

          {/* 超過表示 */}
          {info.overflow > 0 && (
            <Text style={tw`text-[10px] text-gray-500 mt-0.5`}>他{info.overflow}件</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={tw`flex-1 bg-white`}>
      <CalendarList
        style={{ height: CAL_HEIGHT }}
        calendarHeight={CAL_HEIGHT}      
        horizontal
        pagingEnabled
        calendarWidth={screenWidth}
        current={toDateString(visibleMonth)}
        monthFormat={'yyyy年 M月'}
        firstDay={0}
        theme={theme}
        // ← ここで custom dayComponent を使って連結風バー＋文字表示
        dayComponent={DayCell}
        onVisibleMonthsChange={(months) => {
          if (!months || !months.length) return;
          const m = months[0];
          if (
            visibleMonth.getFullYear() === m.year &&
            visibleMonth.getMonth() === m.month - 1
          ) return;
          setVisibleMonth(new Date(m.year, m.month - 1, 1));
        }}
        pastScrollRange={12}
        futureScrollRange={12}
        showScrollIndicator={false}
        hideExtraDays={false}
      />
    </SafeAreaView>
  );
}
