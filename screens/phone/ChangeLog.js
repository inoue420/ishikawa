// src/screens/phone/ChangeLog.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, SectionList, TouchableOpacity } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import tw from 'twrnc';
import {
  fetchAllChangeLogsInRange,
  fetchProjects,
} from '../../firestoreService';

const ACTION_LABEL = { create: '作成', update: '編集', delete: '削除' };

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function ymd(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}
function toDateMaybe(tsOrDate) {
  if (!tsOrDate) return null;
  try {
    return tsOrDate?.toDate ? tsOrDate.toDate() : new Date(tsOrDate);
  } catch { return null; }
}

// 丸アイコン（頭文字）
function Avatar({ nameOrId }) {
  const txt = (nameOrId || '?').trim();
  const initial = txt ? txt[0].toUpperCase() : '?';
  return (
    <View style={tw`w-9 h-9 rounded-full bg-gray-200 items-center justify-center mr-3`}>
      <Text style={tw`text-base font-bold`}><Text>{initial}</Text></Text>
    </View>
  );
}

export default function ChangeLog() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);

  // 今日全件は常に表示
  const [todayLogs, setTodayLogs] = useState([]);

  // それ以前は期間指定で表示
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7); // 初期値: 1週間前
    return startOfDay(d);
  });
  const [toDate, setToDate] = useState(() => endOfDay(new Date(new Date().setDate(new Date().getDate() - 1)))); // 初期: 昨日まで

  // ピッカー制御
  const [showPicker, setShowPicker] = useState({ which: null }); // 'from' | 'to' | null

  // 期間指定で取得した「昨日以前」のログ
  const [pastLogs, setPastLogs] = useState([]);

  const pnameOf = useMemo(() => {
    const m = {};
    (projects || []).forEach(p => { if (p?.id) m[p.id] = p?.name || p?.title || p?.id; });
    return (id) => m[id] ?? id ?? '(不明PJ)';
  }, [projects]);

  // 読み込み本体
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // プロジェクト名解決用
      const ps = await fetchProjects();
      setProjects(ps || []);

      // 今日分（0:00〜23:59）全件
      const t0 = startOfDay(new Date());
      const t1 = endOfDay(new Date());
      const today = await fetchAllChangeLogsInRange(t0, t1, 1000);
      setTodayLogs(today || []);

      // 過去分（ユーザー指定期間）。UI仕様: 「昨日まで」「任意期間」を対象
      // ※from/to は画面の状態値を使用
      if (fromDate && toDate) {
        const past = await fetchAllChangeLogsInRange(startOfDay(fromDate), endOfDay(toDate), 2000);
        setPastLogs(past || []);
      } else {
        setPastLogs([]);
      }
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { loadAll(); }, []); // 初回
  // 期間適用ボタンで明示ロードする（from/to変更のたびには自動で読まない）

  // 表示用に SectionList へ整形
  const sections = useMemo(() => {
    // 今日
    const todaySec = {
      title: '今日',
      data: [...todayLogs].sort((a, b) => {
        const ad = toDateMaybe(a.at) || new Date(0);
        const bd = toDateMaybe(b.at) || new Date(0);
        return bd - ad;
      }),
    };

    // 期間指定: 「昨日」「それ以前の各日」
    const groups = {};
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    for (const it of pastLogs) {
      const d = toDateMaybe(it.at);
      if (!d) continue;
      const key = isSameDay(d, yesterday) ? '昨日' : ymd(d);
      if (!groups[key]) groups[key] = [];
      groups[key].push(it);
    }

    const pastSecs = Object.keys(groups)
      .sort((a, b) => {
        // 「昨日」を最優先、その後は日付降順
        if (a === '昨日' && b !== '昨日') return -1;
        if (b === '昨日' && a !== '昨日') return 1;
        return b.localeCompare(a);
      })
      .map(k => ({
        title: k,
        data: groups[k].sort((a, b) => {
          const ad = toDateMaybe(a.at) || new Date(0);
          const bd = toDateMaybe(b.at) || new Date(0);
          return bd - ad;
        }),
      }));

    // 今日セクションは常に先頭
    return [todaySec, ...pastSecs];
  }, [todayLogs, pastLogs]);

  const renderHeader = () => (
    <View style={tw`px-4 py-3 border-b border-gray-200 bg-white`}>
      <View style={tw`flex-row items-center justify-between`}>
        <Text style={tw`text-lg font-bold`}><Text>編集履歴</Text></Text>
        <TouchableOpacity onPress={loadAll} style={tw`px-3 py-2 rounded bg-gray-100`}>
          <Text><Text>再読込</Text></Text>
        </TouchableOpacity>
      </View>

      {/* 期間指定（昨日以前） */}
      <View style={tw`mt-3`}>
        <Text style={tw`text-xs text-gray-600`}><Text>昨日以前は期間指定で表示</Text></Text>
        <View style={tw`flex-row items-center mt-2`}>
          <TouchableOpacity
            onPress={() => setShowPicker({ which: 'from' })}
            style={tw`px-3 py-2 rounded bg-gray-100 mr-2`}
          >
            <Text><Text>開始: {ymd(fromDate)}</Text></Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowPicker({ which: 'to' })}
            style={tw`px-3 py-2 rounded bg-gray-100 mr-2`}
          >
            <Text><Text>終了: {ymd(toDate)}</Text></Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={loadAll}
            style={tw`px-3 py-2 rounded bg-blue-100`}
          >
            <Text><Text>期間を適用</Text></Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* DateTimePicker（必要時のみ表示） */}
      {showPicker.which ? (
        <DateTimePicker
          value={showPicker.which === 'from' ? (fromDate || new Date()) : (toDate || new Date())}
          mode="date"
          display="default"
          onChange={(_e, d) => {
            // Android は選択後にピッカーが閉じる。iOS もOK
            setShowPicker({ which: null });
            if (!d) return;
            if (showPicker.which === 'from') {
              const x = startOfDay(d);
              // from > to にならないように補正
              if (toDate && x > toDate) {
                setFromDate(startOfDay(d));
                setToDate(endOfDay(d));
              } else {
                setFromDate(x);
              }
            } else {
              setToDate(endOfDay(d));
            }
          }}
        />
      ) : null}
    </View>
  );

  const renderSectionHeader = ({ section }) => (
    <View style={tw`px-4 py-2 bg-gray-50 border-t border-b border-gray-200`}>
      <Text style={tw`text-xs text-gray-600`}><Text>{section.title}</Text></Text>
    </View>
  );

  const renderItem = ({ item }) => {
    const at = toDateMaybe(item.at);
    const hhmm = at ? `${String(at.getHours()).padStart(2,'0')}:${String(at.getMinutes()).padStart(2,'0')}` : '';
    const by = item?.byName || item?.by || 'unknown';
    const pid = item?.targetId || item?.projectId;
    const name = item?.projectName || pnameOf(pid);
    const actionLabel = ACTION_LABEL[item?.action] ?? item?.action ?? '';
    let message = '';
    if (item?.target === 'project') {
      message = `${by}さんが「${name}」を${actionLabel}しました`;
    } else if (item?.target === 'comment') {
      message = `${by}さんが「${name}」にコメントを追加しました`;
    } else if (item?.target === 'photo') {
      message = `${by}さんが「${name}」の画像を${item?.action === 'delete' ? '削除' : '追加'}しました`;
    } else {
      message = `${by}さんが「${name}」に変更を加えました`;
    }

    return (
      <View style={tw`px-4 py-3 border-b border-gray-200 bg-white flex-row`}>
        <Avatar nameOrId={by} />
        <View style={tw`flex-1`}>
          <Text style={tw`text-sm`}><Text>{message}</Text></Text>
          {item?.note ? (
            <Text style={tw`text-xs text-gray-700 mt-1`}><Text>{item.note}</Text></Text>
          ) : null}
          <Text style={tw`text-[10px] text-gray-500 mt-1`}><Text>{hhmm}</Text></Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={tw`flex-1 items-center justify-center`}>
        <ActivityIndicator />
        <Text style={tw`mt-2`}><Text>読み込み中...</Text></Text>
      </View>
    );
  }

  return (
    <View style={tw`flex-1 bg-white`}>
      <SectionList
        sections={sections}
        keyExtractor={(it, i) => it?.id ?? `${it?.targetId ?? it?.projectId}-${i}`}
        ListHeaderComponent={renderHeader}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        stickySectionHeadersEnabled={true}
      />
    </View>
  );
}
