// screens/phone/HomeScreen.js
import React, { useEffect, useState, useContext, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Button, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import tw from 'twrnc';
import { DateContext } from '../../DateContext';
import { fetchProjectsOverlappingRangeVisible, findEmployeeByIdOrEmail, isPrivUser } from '../../firestoreService';
import { useFocusEffect } from '@react-navigation/native';

export default function HomeScreen({ navigation, route }) {
  console.log('[HomeScreen] got userEmail =', route?.params?.userEmail);
  const { date: selectedDate, setDate } = useContext(DateContext);
  const TTL_MS = 60 * 1000; // 60秒
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const userEmail = route?.params?.userEmail ?? null;
  const [me, setMe] = useState(null);

  // 追加: 従業員マップ（id/loginId/email → name）
  const [employeeMap, setEmployeeMap] = useState({});
  // TTL / 重複fetchガード
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastFetchRef = useRef({ key: null, at: 0 });
  const reqSeqRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!userEmail) return;
      const emp = await findEmployeeByIdOrEmail(userEmail); // email or loginId どちらでも可
      if (mounted) setMe(emp);
    })();
    return () => { mounted = false; };
  }, [userEmail]);

  // util
  const dateKey = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const asDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (v?.toDate) return v.toDate();
    // 'YYYY-MM-DD' は UTC 解釈されるため、ローカル日付としてパースする
    if (typeof v === 'string') {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        const y = Number(m[1]);
        const mo = Number(m[2]) - 1;
        const d0 = Number(m[3]);
        const dt = new Date(y, mo, d0);
        return Number.isNaN(dt.getTime()) ? null : dt;
      }
    }
    const d = new Date(v);
    return isNaN(d) ? null : d;
  };
  const fmtHM = (d) => {
    if (!d) return '—';
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  };
  const initialOf = (name) => {
    if (!name) return '?';
    const ch = name.trim().charAt(0);
    return /[A-Za-z]/.test(ch) ? ch.toUpperCase() : ch; // 日本語はそのまま先頭文字
  };
  // ── 作業ステータス（工程）頭文字（選択日分） ──
  // ProjectRegisterScreen の WORK_STATUS_TYPES に合わせる（不足は表示しない）
  const WORK_STATUS_LABEL_MAP = {
    assembly: '組立',
    dismantle: '解体',
    additional: '追加工事',
    regular: '常用',
    correction: '是正',
    pickup: '引き上げ',
  };

  const dateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  // ★ 追加：選択日に該当する「工程(workStatus)」を1つ決める（タイトルと時刻で共通利用）
  //  - workStatuses[].dateKeys があればそれも判定に使う（ScheduleScreen と揃える）
  const pickWorkStatusForDate = (proj, targetDate) => {
    const list = Array.isArray(proj?.workStatuses) ? proj.workStatuses : [];
    if (!list.length) return null;
    const t = dateOnly(targetDate).getTime();
    const targetKey = dateKey(targetDate);

    const matches = list
      .map((ws) => {
        const s = asDate(ws?.startDate);
        const e = asDate(ws?.endDate);
        const byKey =
          Array.isArray(ws?.dateKeys) &&
          ws.dateKeys.map(String).includes(String(targetKey));
        return { ...ws, _s: s, _e: e, _byKey: byKey };
      })
      .filter((ws) => {
        // dateKeys があればそれを最優先
        if (ws._byKey) return true;
        // 無ければ start/end の範囲一致で判定
        if (ws._s && ws._e) {
          const s = dateOnly(ws._s).getTime();
          const e = dateOnly(ws._e).getTime();
          return s <= t && t <= e;
        }
        return false;
      })
      // PDSと同じ優先度に寄せる：確定→開始が早い→type
      .sort((a, b) => {
        const af = a.scheduleStatus === 'fixed' ? 0 : 1;
        const bf = b.scheduleStatus === 'fixed' ? 0 : 1;
        if (af !== bf) return af - bf;
        // startDate が無い（dateKeysのみ）ケースは「選択日」を基準に安定ソート
        const as = a._s ? a._s.getTime() : t;
        const bs = b._s ? b._s.getTime() : t;
        if (as !== bs) return as - bs;
        return String(a.type).localeCompare(String(b.type));
      });

    return matches[0] || null;
  };


  // ★ name から【場所】を抽出
  const parseNameForLocation = (fullName) => {
    const m = String(fullName || '').match(/^【([^】]+)】(.*)$/);
    if (m) return { loc: m[1], plain: (m[2] || '').trim() };
    return { loc: null, plain: String(fullName || '') };
  };
  // ★ 表示名：限定公開なら「限定公開　」を括弧内の先頭に入れる
  const displayTitle = (proj, wsPicked) => {
    const raw = proj.name || proj.title || '（名称未設定）';
    const { loc, plain } = parseNameForLocation(raw);
    const locFinal = proj.location || loc || '';
    if (!locFinal) return raw; // 念のため
    const prefix = proj?.visibility === 'limited' ? '限定公開　' : '';
    const label = String(wsPicked?.label || WORK_STATUS_LABEL_MAP[wsPicked?.type] || '').trim();
    const workInitial = label ? label.charAt(0) : '';
    const locLabel = workInitial ? `${workInitial}　${locFinal}` : locFinal;
    return `【${prefix}${locLabel}】${plain}`;
  };

  const onDateChange = (_, d) => {
    setShowPicker(false);
    if (d) setDate(d);
  };

  // ▼ 取得処理（TTL+重複fetchガード、サーバ側フィルタ）
  const loadProjects = useCallback(async ({ force = false, withSpinner = false } = {}) => {
    const key = dateKey(selectedDate);
    const now = Date.now();
    const isStale =
      force ||
      lastFetchRef.current.key !== key ||
      now - lastFetchRef.current.at > TTL_MS;
    if (!isStale || refreshingRef.current) return;

    const mySeq = ++reqSeqRef.current;
    refreshingRef.current = true;
    if (projects.length === 0) setLoading(true);
    let didSetSpinner = false;
    if (withSpinner) {
      setIsRefreshing(true); didSetSpinner = true;
    }
    try {
      // 選択日の 00:00〜23:59:59
      const selStart = new Date(selectedDate); selStart.setHours(0, 0, 0, 0);
      const selEnd   = new Date(selectedDate); selEnd.setHours(23, 59, 59, 999);

      // ★ 可視性（public + 条件付き limited）を考慮した取得
       const list = await fetchProjectsOverlappingRangeVisible(selStart, selEnd, me);
       if (mySeq !== reqSeqRef.current) return; // 古い応答は破棄

      // 表示順：開始時刻昇順
      const sorted = (list || []).sort((a, b) => {
        const dA = asDate(a.startDate) || asDate(a.start) || asDate(a.startAt) || 0;
        const dB = asDate(b.startDate) || asDate(b.start) || asDate(b.startAt) || 0;
        return (dA ? dA.getTime() : 0) - (dB ? dB.getTime() : 0);
      });

      // ★ workStatuses を持つプロジェクトは「選択日が稼働日」のときだけ Home に表示
      //    （組立/解体などの“飛び日”の中間期間は表示しない）
      const filtered = sorted.filter((p) => {
        const wss = Array.isArray(p?.workStatuses) ? p.workStatuses : [];
        if (!wss.length) return true; // workStatuses無しは従来通り
        return !!pickWorkStatusForDate(p, selectedDate);
      });
      setProjects(filtered);

      // 従業員名マップ
      const idFields = ['management', 'sales', 'design', 'survey'];
      const ids = Array.from(new Set(sorted.flatMap(p => idFields.map(k => p?.[k]).filter(Boolean))));
      const pairs = await Promise.all(ids.map(async (id) => {
        try {
          const emp = await findEmployeeByIdOrEmail(id);
          const name = emp?.name || emp?.displayName || '';
          return [id, name || String(id)];
        } catch {
          return [id, String(id)];
        }
      }));
      const map = {}; pairs.forEach(([id, name]) => { map[id] = name; });
      setEmployeeMap(map);

      lastFetchRef.current = { key, at: now };
    } catch (e) {
      console.error('[HomeScreen] loadProjects error:', e?.message || e);
    } finally {
      refreshingRef.current = false;
      if (didSetSpinner) setIsRefreshing(false);
      setLoading(false);
    }
  }, [selectedDate, projects.length, me]);

  // 画面フォーカス時：TTLに従って再取得
  useFocusEffect(useCallback(() => { loadProjects({ force: false, withSpinner: false }); }, [loadProjects]));
  // 日付変更時：強制更新
  useEffect(() => { loadProjects({ force: true, withSpinner: false }); }, [selectedDate, loadProjects]);
  // 権限（me）変化時：強制更新
  useEffect(() => { if (me) loadProjects({ force: true, withSpinner: false }); }, [me, loadProjects]);

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={tw`flex-1 justify-center items-center`}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  // 参加メンバー表示: management/sales/design/survey をまとめて重複排除して名前化
  const membersOf = (p) => {
    const ids = ['management','sales','design','survey'].map(k => p?.[k]).filter(Boolean);
    const uniq = Array.from(new Set(ids));
    return uniq.map(id => employeeMap[id] || id);
  };

  return (
    <SafeAreaView edges={['top']} style={tw`flex-1 bg-gray-100`}>
      {/* 日付選択 */}
      <View style={tw`flex-row items-center p-4 bg-white border-b border-gray-300`}>
        <TouchableOpacity style={tw`flex-1`} onPress={() => setShowPicker(true)}>
          <Text style={tw`text-lg`}>{dateKey(selectedDate)}</Text>
        </TouchableOpacity>
      </View>
      {showPicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}

      <ScrollView
        contentContainerStyle={tw`p-4`}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadProjects({ force: true, withSpinner: true })}
          />
        }
      >
        {projects.length === 0 ? (
          <Text style={tw`text-center text-gray-500`}>本日のプロジェクトはありません</Text>
        ) : (
          projects.map(proj => {
            // ★ 選択日の工程を先に決める（この工程のstart/endを左側に出す）
            const wsPicked = pickWorkStatusForDate(proj, selectedDate);
            const start =
              wsPicked?._s ||
              asDate(proj.startDate) || asDate(proj.start) || asDate(proj.startAt);
            const end =
              wsPicked?._e ||
              asDate(proj.endDate) || asDate(proj.end) || asDate(proj.endAt);
            const startTime = fmtHM(start);
            const endTime   = fmtHM(end);
            const memberNames = membersOf(proj);
            const creatorName = employeeMap[proj?.management] || '';
            const creatorInitial = initialOf(creatorName);

            return (
              <TouchableOpacity
                key={proj.id}
                onPress={() => {
                  // 限定公開 + 非特権者は閲覧不可
                  if (proj?.visibility === 'limited' && !isPrivUser(me)) {
                    Alert.alert('閲覧できません', 'このプロジェクトは限定公開です（役員・部長・事務のみ）。');
                    return;
                  }
                  navigation.navigate('ProjectDetail', {
                    projectId: proj.id,
                    date: dateKey(selectedDate),
                    userEmail, // ★ ついでに渡しておくとPDS側の投稿者解決が安定
                  });
                }}
                activeOpacity={0.75}
                style={tw`mb-3`}
              >
                {/* タップ要素<Text>ルール対応（不可視） */}
                <Text style={tw`hidden`}>open</Text>

                {/* ここから置き換え */}
                <View style={tw`flex-row items-stretch`}>
                  {/* 左：開始/終了（上下に離す）＋ 縦バー */}
                  <View style={tw`w-16 pr-2 items-end justify-between pt-1 pb-1`}>
                    <View style={tw`absolute left-14 top-4 bottom-2 w-0.5 bg-green-400 rounded`} />
                    <Text style={tw`text-gray-800 mt-2`}>{startTime}</Text>
                    <Text style={tw`text-gray-400 `}>{endTime}</Text>
                  </View>

                  {/* 中央：カード（高さ確保のため minHeight を付与） */}
                  <View style={[tw`flex-1 bg-white rounded-xl shadow p-3 border border-gray-100 relative`, { minHeight: 56 }]}>
                    <Text style={tw`text-base font-bold`} numberOfLines={1}>
                      {displayTitle(proj, wsPicked)}
                    </Text>
                    <Text style={tw`text-gray-500 mt-1`} numberOfLines={1}>
                      {memberNames.length ? memberNames.join('、') : 'メンバー未設定'}
                    </Text>
                    {/* 視覚ラベル：限定公開 */}
                    {proj?.visibility === 'limited' && (
                      <View style={tw`absolute top-2 left-2 bg-amber-100 border border-amber-300 rounded px-2 py-0.5`}>
                        <Text style={tw`text-amber-800 text-xs`}>限定公開</Text>
                      </View>
                    )}
                  </View>

                  {/* 右：作成者頭文字アイコン（縦中央） */}
                  <View style={tw`ml-3 w-10 h-10 rounded-full bg-pink-400 items-center justify-center self-center`}>
                    <Text style={tw`text-white font-bold`}>{creatorInitial}</Text>
                  </View>
                </View>
                {/* ここまで置き換え */}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* 承認ボタン（部長/役員） */}
      {me?.loginId && (me?.role === 'manager' || me?.role === 'executive') && (
        <View style={tw`p-4 border-t border-gray-200 bg-white`}>
          <Button
            title={me?.role === 'executive'
              ? '出勤認証（直属の部長の申請）'
              : '出勤認証（自分の部下のみ）'}
            onPress={() =>
              navigation.navigate('ManagerApproval', { managerLoginId: me.loginId, approverRole: me.role })
            }
          />
        </View>
      )}
    </SafeAreaView>
  );
}
