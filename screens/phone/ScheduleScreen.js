// screens/phone/ScheduleScreen.js
import React, { useEffect, useMemo, useState, useContext, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, TouchableOpacity, ActivityIndicator, Dimensions, TextInput, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';
import { CalendarList, LocaleConfig } from 'react-native-calendars';
import { DateContext } from '../../DateContext';
import {
  fetchProjectsOverlappingRangeVisible,
  findEmployeeByIdOrEmail,
  // 可能なら当月アサインをまとめて取得して参加者名に反映
  fetchAssignmentsByYmdRange,
  fetchAllUsers,
} from '../../firestoreService';

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
// 検索用に正規化（大小無視・空白/全角空白を除去）
const normalizeForSearch = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\u3000/g, '')   // 全角スペース除去
    .replace(/\s+/g, '');     // 半角スペース除去
// ざっくりメール判定（文字列参加者の混入を弾くのに使用）
const isProbablyEmail = (s) => /@/.test(String(s || ''))    

// ===== 従業員インデックス（employeesコレクションを想定）=====
//  byId: { id -> name }, byEmail: { emailLower -> name }, byLoginId: { loginIdLower -> name }
function buildEmployeeIndex(list = []) {
  const out = { byId: {}, byEmail: {}, byLoginId: {} };
  list.forEach(u => {
    if (!u) return;
    const id = u.id || u.employeeId || u.uid;
    const name = (u.name || u.displayName || u.fullName || '').trim();
    const email = (u.email || u.mail || '').trim().toLowerCase();
    const loginId = (u.loginId || u.login_id || '').trim().toLowerCase();
    if (id && name) out.byId[id] = name;
    if (email && name) out.byEmail[email] = name;
    if (loginId && name) out.byLoginId[loginId] = name;
  });
  return out;
}

// 参加者の値（文字列/オブジェクト/id/email 等）を name に解決
function resolveToNameAny(v, empIdx) {
  if (!v) return '';
  if (typeof v === 'object') {
    const n = (v.name || v.displayName || v.fullName || '').trim();
    if (n) return n;
    const id = v.id || v.employeeId;
    if (id && empIdx?.byId?.[id]) return empIdx.byId[id];
    const email = (v.email || '').toLowerCase();
    if (email && empIdx?.byEmail?.[email]) return empIdx.byEmail[email];
    const loginId = (v.loginId || '').toLowerCase();
    if (loginId && empIdx?.byLoginId?.[loginId]) return empIdx.byLoginId[loginId];
    return '';
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return '';
    if (isProbablyEmail(s)) return empIdx?.byEmail?.[s.toLowerCase()] || '';
    // 純粋な人名文字列として採用
    return s;
  }
  return '';
}
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

// ★ name から【場所】を抽出
const parseNameForLocation = (fullName) => {
  const m = String(fullName || '').match(/^【([^】]+)】(.*)$/);
  if (m) return { loc: m[1], plain: (m[2] || '').trim() };
  return { loc: null, plain: String(fullName || '') };
};

// ===== 表示調整（必要に応じて調整OK） =====
 const MAX_LANES    = 4;   // 1日あたり最大4行
 const CELL_HEIGHT  = 90; // セルの高さ（最終週も入るよう少し余裕）
 const BAR_HEIGHT   = 18;  // バーの高さ
 const HEADER_SPACE = 72;  // 見出し(曜日名＋月名)ぶんの概算高さ
 const CAL_HEIGHT   = HEADER_SPACE + CELL_HEIGHT * 6 + 4; // 6週ぶんを確保
 const DAY_MS = 24 * 60 * 60 * 1000;
// フォーカス時のTTL：前回取得から60秒超えていたら当月を更新
 const REFRESH_TTL_MS = 60 * 1000; 

export default function ScheduleScreen({ navigation, route }) {
  // 可能な限り上位のナビゲータから userEmail を拾う
  const findUserEmailFromNav = useCallback(() => {
    // 1) 自画面の params
    if (route?.params?.userEmail) return route.params.userEmail;
    try {
      // 2) 親スタック / ルートを遡って探す
      let nav = navigation;
      for (let i = 0; i < 3 && nav?.getParent; i++) {
        nav = nav.getParent();
        const state = nav?.getState?.();
        const routes = state?.routes || [];
        for (const r of routes) {
          const p = r?.params;
          if (p?.userEmail) return String(p.userEmail);
        }
      }
    } catch {}
    return null;
  }, [navigation, route?.params?.userEmail]);
  const { date, setDate } = useContext(DateContext);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  // ▼ 検索用ステート
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [assignMap, setAssignMap] = useState(null); // { [projectId]: Set<employeeName> }
  const [employeeIndex, setEmployeeIndex] = useState(null); // { byId, byEmail, byLoginId }
  // 検索スコープ: 'all' | 'employees' | 'customers'
  const [searchScope, setSearchScope] = useState('all');    
  const [refreshKey, setRefreshKey] = useState(0); // フォーカス時の再フェッチ用トリガ

  const cacheRef = useRef(new Map());
  const lastFetchAtRef = useRef(new Map());   // ym -> 最終取得時刻(ms)
  const prevVisibleMonthRef = useRef(null);   // 直前の表示月
  const screenWidth = Dimensions.get('window').width;
  const dayWidth = useMemo(() => screenWidth / 7, [screenWidth]);
  const userEmail = route?.params?.userEmail ?? findUserEmailFromNav();
  const [me, setMe] = useState(null);
  // me 変化時にキャッシュをリセット（権限に応じた可視性のズレ防止）
  useEffect(() => {
    cacheRef.current = new Map();
  }, [me]);  

  // 表示中の月（1日固定）
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const d = new Date(date);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  // 当月の開始・終了（日付のみ）
  const monthStart = useMemo(() => new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1), [visibleMonth]);
  const monthEnd   = useMemo(() => new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0), [visibleMonth]);

  const theme = useMemo(() => ({
    textMonthFontWeight: '700',
    todayTextColor: '#2563eb',
    arrowColor: '#111827',
  }), []);

  // ログインユーザー me 解決
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!userEmail) return;
      const emp = await findEmployeeByIdOrEmail(userEmail);
      if (mounted) setMe(emp);
    })();
    return () => { mounted = false; };
  }, [userEmail]);
  

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

        // ★ 隣の月に移動してきたら：この月のキャッシュを破棄（再取得させる）
        const prev = prevVisibleMonthRef.current;
        if (prev) {
          const diff =
            (visibleMonth.getFullYear() - prev.getFullYear()) * 12 +
            (visibleMonth.getMonth() - prev.getMonth());
          if (diff !== 0) {
            // 月が変わったら検索用の当月アサインもリセット
            setAssignMap(null);
         }
          if (Math.abs(diff) === 1 && cacheRef.current.has(ym)) {
            cacheRef.current.delete(ym);
          }
        }
        if (cacheRef.current.has(ym)) {
          setProjects(cacheRef.current.get(ym));
          setLoading(false);
          // 次回比較用に現在の月を記録
          prevVisibleMonthRef.current = visibleMonth;
          return;
        }
        const rows = await fetchProjectsOverlappingRangeVisible(rangeStart, rangeEnd, me);
        const data = rows ?? [];
        cacheRef.current.set(ym, data);
        lastFetchAtRef.current.set(ym, Date.now()); // 取得時刻を記録（TTL判定用）
        setProjects(data);
        // 次回比較用に現在の月を記録
        prevVisibleMonthRef.current = visibleMonth;        
      } catch (e) {
        console.error('[Schedule] fetch error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [visibleMonth, me, refreshKey]);

  // 画面フォーカス時に「当月のみ」キャッシュを破棄して再フェッチ
  useFocusEffect(
    useCallback(() => {
      const ym = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth()+1).padStart(2,'0')}`;
      const last = lastFetchAtRef.current.get(ym) || 0;
      if (cacheRef.current.has(ym) && Date.now() - last > REFRESH_TTL_MS) {
        cacheRef.current.delete(ym);
        setAssignMap(null);          // 検索用アサインも更新させる
        setRefreshKey(k => k + 1);   // 再取得を発火
      }
    }, [visibleMonth])
  );

  // employees コレクションを読み込み、インデックス化
  const ensureEmployeeIndex = useCallback(async () => {
    if (employeeIndex) return employeeIndex;
    const list = await fetchAllUsers?.();
    const idx = buildEmployeeIndex(list || []);
    setEmployeeIndex(idx);
    return idx;
  }, [employeeIndex]);  
  // 参加者名の当月分プリロード（検索初回で必要になったら取得）
  const ensureAssignmentsForMonth = useCallback(async () => {
    if (assignMap) return assignMap;
    try {
      const s = new Date(monthStart); s.setHours(0,0,0,0);
      const e = new Date(monthEnd);   e.setHours(23,59,59,999);
      const rows = await fetchAssignmentsByYmdRange?.(s, e);
      if (!rows || !Array.isArray(rows)) return null;
      // ▼ employees を読み込み、id/email/loginId → name を解決可能にする
      const empIdx = await ensureEmployeeIndex();
      const tmp = {};
      rows.forEach((a) => {
        const pid = a?.projectId || a?.project?.id;
        if (!pid) return;
        // 何が来ても name に解決（email / id でも OK）
        const name =
          a?.employeeName ||
          a?.name ||
          resolveToNameAny(a?.employee, empIdx) ||
          resolveToNameAny(a?.employeeId, empIdx) ||
          resolveToNameAny(a?.email, empIdx) ||
          '';
        if (!name || !String(name).trim()) return; // name が無ければスキップ
        if (!tmp[pid]) tmp[pid] = new Set();
        tmp[pid].add(String(name).trim());
      });
      setAssignMap(tmp);
      return tmp;
    } catch (e) {
      console.log('[Schedule] ensureAssignmentsForMonth error', e);
      return null;
    }
  }, [assignMap, monthStart, monthEnd, ensureEmployeeIndex]);

  // ▼ 検索ロジック（query / projects / assignMap が変われば更新）
  const toggleScope = useCallback((mode) => {
    setSearchScope((prev) => (prev === mode ? 'all' : mode));
  }, []);
  useEffect(() => {
    const run = async () => {
      const q = (query || '').trim().toLowerCase();
      if (!q) { setResults([]); return; }
      // 参加者名マップを準備（可能なら）
      const aMap = await ensureAssignmentsForMonth();
      const empIdx = await ensureEmployeeIndex();
      const tokens = q.split(/\s+/).filter(Boolean).map(t => normalizeForSearch(t));
      const inMonth = (p) => {
        const s0 = fromTimestampOrString(p.startDate);
        const e0 = fromTimestampOrString(p.endDate || p.startDate);
        const s = new Date(s0.getFullYear(), s0.getMonth(), s0.getDate());
        const e = new Date(e0.getFullYear(), e0.getMonth(), e0.getDate());
        return !(e < monthStart || s > monthEnd);
      };
      const getCustomer = (p) =>
        p?.customerName || p?.clientName || p?.customer || p?.client || p?.customer_name || '';
      const getParticipants = (p) => {
        // 1) 当月アサインが取れていればそれを使用
        const pid = String(p?.id ?? '');
        const set1 = (aMap && aMap[pid]) ? Array.from(aMap[pid]) : [];
        // 2) プロジェクト側に候補があれば補完
        //    代表的なキー名の総当たり（ID/オブジェクト/文字列に対応）
        const list2Raw =
          p?.participantNames ??
          p?.participants ??
          p?.participantsArray ??
          p?.assignees ??
          p?.assignedEmployees ??
          p?.members ??
          [];
        const list2 = Array.isArray(list2Raw) ? list2Raw : Object.values(list2Raw || {});
        // 何であっても name に解決（email / id も可）
        const names2 = Array.isArray(list2)
          ? list2.map(v => resolveToNameAny(v, empIdx)).filter(s => typeof s === 'string' && s.trim())
          : [];
        const all = new Set([...set1, ...names2].map(s => String(s)));
        return Array.from(all);
      };
      const haystackOf = (p) => {
        // 事前に正規化しておく
        const customer = normalizeForSearch(String(getCustomer(p) || ''));
        const parts = normalizeForSearch(getParticipants(p).join(' '));
        // スコープに応じて対象を限定
        if (searchScope === 'employees') {
          return parts;
        }
        if (searchScope === 'customers') {
          return customer;
        }
        return `${customer}${parts}`;
      };
      const filtered = (projects || [])
        .filter(p => inMonth(p))
        .filter(p => {
          const hs = haystackOf(p);
          return tokens.every(t => hs.includes(t));
        })
        .slice(0, 100); // セーフガード
      setResults(filtered);
    };
    run();
  }, [query, projects, monthStart, monthEnd, ensureAssignmentsForMonth, ensureEmployeeIndex, searchScope]);


  /**
   * 各「日」ごとにアクティブな予定を集め、優先度で上に詰める。
   * 優先順位:
   *   1) 複数日の予定（開始日が昔のものほど上）
   *   2) 単日の予定（開始時間が早いものほど上）
   * レイアウトは dayLayout['YYYY-MM-DD'] に集約。
   */
  const dayLayout = useMemo(() => {
    const layout = {};
    const ensureDay = (k) => {
      if (!layout[k]) layout[k] = { lanes: Array(MAX_LANES).fill(null), overflow: 0 };
      return layout[k];
    };

    // dayKey -> その日に跨っているセグメント配列
    const byDay = new Map(); // Map<string, Array<seg>>
    const pushByDay = (k, seg) => {
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(seg);
    };

    // 1) 予定を日単位のセグメントへ展開し、各日に登録
    projects.forEach((p) => {
      const s0 = fromTimestampOrString(p.startDate);
      const e0 = fromTimestampOrString(p.endDate || p.startDate);
      // 日単位に切り捨て
      const s = new Date(s0.getFullYear(), s0.getMonth(), s0.getDate());
      const e = new Date(e0.getFullYear(), e0.getMonth(), e0.getDate());

      const isMulti = (e - s) >= DAY_MS;              // 複数日判定
      const startMs = s0.getTime();                   // 並べ替えキー（開始日時）
      const projectKey = String(p.id ?? p.title ?? '');
      const rawTitle = String(p.title ?? p.name ?? p.id ?? '（無題）');
      const { loc, plain } = parseNameForLocation(rawTitle);
      const locFinal = p.location || loc || '';
      const prefix = p?.visibility === 'limited' ? '限定公開　' : '';
      const title = locFinal ? `【${prefix}${locFinal}】${plain}` : rawTitle;
      const color = colorFromId(projectKey);

      // 週固定はやめ、セグメント全期間をその日ごとに登録
      const segLen = Math.round((e - s) / DAY_MS) + 1;
      const midIdx = Math.floor((segLen - 1) / 2);
      let d = new Date(s);
      let idx = 0;
      while (d <= e) {
        const k = toDateString(d);
        pushByDay(k, {
          projectKey, title, color,
          segStart: s, segEnd: e, segLen, midIdx,
          isMulti, startMs, dayIdx: idx,
        });
        d.setDate(d.getDate() + 1);
        idx += 1;
      }
    });

    // 2) 各日で優先度ソート → 上から lane に詰める
    for (const [k, segs] of byDay.entries()) {
      // 複数日を最優先（true=0, false=1）→ 開始日時古い順 → タイトル/キー
      segs.sort((a, b) => {
        const ap = a.isMulti ? 0 : 1;
        const bp = b.isMulti ? 0 : 1;
        if (ap !== bp) return ap - bp;
        if (a.startMs !== b.startMs) return a.startMs - b.startMs;
        if (a.title !== b.title) return a.title.localeCompare(b.title);
        return a.projectKey.localeCompare(b.projectKey);
      });

      const info = ensureDay(k);
      let used = 0;
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        if (used >= MAX_LANES) {
          info.overflow += 1;
          continue;
        }
        // この日の表示情報
        const isStart = k === toDateString(seg.segStart);
        const isEnd   = k === toDateString(seg.segEnd);
        const showLabel = (seg.dayIdx === seg.midIdx); // 中央日のみラベル
        info.lanes[used] = {
          title: seg.title,
          color: seg.color,
          isStart,
          isEnd,
          showLabel,
          segLen: seg.segLen,
          midIdx: seg.midIdx,
        };
        used += 1;
      }
    }

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
      {/* ====== 検索バー ====== */}
      <View style={tw`px-3 pt-3 pb-2 bg-white`}>
        <View style={tw`flex-row items-center gap-2`}>
          <View style={tw`flex-1 border border-gray-300 rounded-xl px-3 py-2`}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="参加従業員名・顧客名で検索（当月）"
              placeholderTextColor="#9CA3AF"
              // 下端が欠けないように行高と縦パディングを十分に確保
              style={[
                tw`text-base text-gray-900`,
                Platform.select({
                  android: {
                    paddingTop: 6,
                    paddingBottom: 6,
                    lineHeight: 22,
                    textAlignVertical: 'center',
                  },
                  ios: {
                    paddingTop: 8,
                    paddingBottom: 8,
                    lineHeight: 20,
                  },
                }),
              ]}
              returnKeyType="search"
            />
          </View>
          <TouchableOpacity
            onPress={() => setQuery('')}
            style={tw`px-3 py-2 rounded-xl bg-gray-100`}
            activeOpacity={0.8}
          >
            <Text style={tw`text-sm text-gray-700`}>クリア</Text>
          </TouchableOpacity>
          {/* スコープトグル：従業員 */}
          <TouchableOpacity
            onPress={() => toggleScope('employees')}
            style={tw`${searchScope==='employees' ? 'bg-blue-600' : 'bg-gray-100'} px-3 py-2 rounded-xl`}
            activeOpacity={0.8}
          >
            <Text style={tw`text-sm ${searchScope==='employees' ? 'text-white' : 'text-gray-700'}`}>従業員</Text>
          </TouchableOpacity>
          {/* スコープトグル：顧客 */}
          <TouchableOpacity
            onPress={() => toggleScope('customers')}
            style={tw`${searchScope==='customers' ? 'bg-blue-600' : 'bg-gray-100'} px-3 py-2 rounded-xl`}
            activeOpacity={0.8}
          >
            <Text style={tw`text-sm ${searchScope==='customers' ? 'text-white' : 'text-gray-700'}`}>顧客</Text>
          </TouchableOpacity>
        </View>
        {(() => {
          const scopeLabel =
            searchScope === 'employees' ? '参加従業員のみ' :
            searchScope === 'customers' ? '顧客のみ' : '参加従業員・顧客名';
          return <Text style={tw`mt-1 text-[10px] text-gray-500`}>検索対象：{scopeLabel}（当月範囲）</Text>;
        })()}

      </View>

      {/* ====== 検索結果パネル（あれば） ====== */}
      {query.trim().length > 0 && (
        <View style={tw`px-3 pb-2`}>
          <View style={tw`border border-gray-200 rounded-2xl`}>
            <View style={tw`px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-2xl`}>
              <Text style={tw`text-xs text-gray-700`}>
                {results.length} 件ヒット
              </Text>
            </View>
            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={tw`p-2`}>
              {results.length === 0 ? (
                <Text style={tw`text-xs text-gray-500 px-2 py-1`}>一致なし</Text>
              ) : results.map((p) => {
                  const title = String(p?.title || p?.name || '（無題）');
                  const s0 = fromTimestampOrString(p.startDate);
                  const e0 = fromTimestampOrString(p.endDate || p.startDate);
                  const range = `${toDateString(s0)} 〜 ${toDateString(e0)}`;
                  const customer =
                    p?.customerName || p?.clientName || p?.customer || p?.client || '';
                  const parts = (() => {
                    const pid = String(p?.id ?? '');
                    const aNames = (assignMap && assignMap[pid]) ? Array.from(assignMap[pid]) : [];
                    const pRaw =
                      p?.participantNames ??
                      p?.participants ??
                      p?.participantsArray ??
                      p?.assignees ??
                      p?.assignedEmployees ??
                      p?.members ?? [];
                    const pList = Array.isArray(pRaw) ? pRaw : Object.values(pRaw || {});
                    const pNames = (pList || []).map(v => resolveToNameAny(v, employeeIndex || {})).filter(Boolean);
                    const all = Array.from(new Set([...aNames, ...pNames].map(s => String(s))));
                    return all.join(' / ');
                  })();
                  return (
                    <View key={String(p.id || title)} style={tw`mb-2 p-3 rounded-xl bg-white border border-gray-200`}>
                      <Text style={tw`text-sm font-bold text-gray-900`} numberOfLines={2}>{title}</Text>
                      <Text style={tw`text-[11px] text-gray-600 mt-1`}>{range}</Text>
                      {!!customer && (
                        <Text style={tw`text-[11px] text-gray-700 mt-0.5`}>顧客：{customer}</Text>
                      )}
                      {!!parts && (
                        <Text style={tw`text-[11px] text-gray-700 mt-0.5`}>参加：{parts}</Text>
                      )}
                      <View style={tw`mt-2 flex-row`}>
                        <TouchableOpacity
                          onPress={() => navigation.navigate('HomeStack', {
                            screen: 'ProjectDetail',
                            params: { projectId: p.id, userEmail },
                          })}
                          style={tw`px-3 py-2 rounded-xl bg-blue-600`}
                          activeOpacity={0.8}
                        >
                          <Text style={tw`text-white text-xs font-semibold`}>詳細を開く</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
            </ScrollView>
          </View>
        </View>
      )}    
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
