// screens/phone/HomeScreen.js
import React, { useEffect, useState, useContext } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Button } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import tw from 'twrnc';
import { DateContext } from '../../DateContext';
import { fetchProjects, findEmployeeByIdOrEmail } from '../../firestoreService';

export default function HomeScreen({ navigation, route }) {
  console.log('[HomeScreen] got userEmail =', route?.params?.userEmail);
  const { date: selectedDate, setDate } = useContext(DateContext);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const userEmail = route?.params?.userEmail ?? null;
  const [me, setMe] = useState(null);

  // 追加: 従業員マップ（id/loginId/email → name）
  const [employeeMap, setEmployeeMap] = useState({});

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

  const onDateChange = (_, d) => {
    setShowPicker(false);
    if (d) setDate(d);
  };

  // プロジェクト取得・フィルタ + 従業員名マップ作成
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const all = await fetchProjects();

        // 選択日の 00:00〜23:59:59
        const selStart = new Date(selectedDate); selStart.setHours(0, 0, 0, 0);
        const selEnd   = new Date(selectedDate); selEnd.setHours(23, 59, 59, 999);
        const selKey   = dateKey(selectedDate);

        const filtered = (all || []).filter(p => {
          const s = asDate(p.startDate) || asDate(p.start) || asDate(p.startAt) || asDate(p.scheduledStart);
          const e = asDate(p.endDate)   || asDate(p.end)   || asDate(p.endAt)   || s;
          const overlap = (s && e) ? (s <= selEnd && e >= selStart) : false;
          const hasKey  = p?.dateKey === selKey || p?.scheduledDate === selKey || (Array.isArray(p?.dates) && p.dates.includes(selKey));
          return overlap || hasKey || (!s && !e); // 未設定も一旦表示
        }).sort((a, b) => {
          const dA = asDate(a.startDate) || asDate(a.start) || asDate(a.startAt) || 0;
          const dB = asDate(b.startDate) || asDate(b.start) || asDate(b.startAt) || 0;
          return (dA ? dA.getTime() : 0) - (dB ? dB.getTime() : 0);
        });

        setProjects(filtered);

        // --- ここで従業員名マップを構築（projects.management 等のIDを name に解決）---
        const idFields = ['management', 'sales', 'design', 'survey'];
        const ids = Array.from(new Set(
          filtered.flatMap(p => idFields.map(k => p?.[k]).filter(Boolean))
        ));

        // findEmployeeByIdOrEmail は email/loginId向けだが、loginId=「b」のように docId と同値を前提に解決を試行
        const pairs = await Promise.all(ids.map(async (id) => {
          try {
            const emp = await findEmployeeByIdOrEmail(id);
            const name = emp?.name || emp?.displayName || '';
            return [id, name || String(id)];
          } catch {
            return [id, String(id)];
          }
        }));
        const map = {};
        pairs.forEach(([id, name]) => { map[id] = name; });
        setEmployeeMap(map);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedDate]);

  if (loading) {
    return (
      <View style={tw`flex-1 justify-center items-center`}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // 参加メンバー表示: management/sales/design/survey をまとめて重複排除して名前化
  const membersOf = (p) => {
    const ids = ['management','sales','design','survey'].map(k => p?.[k]).filter(Boolean);
    const uniq = Array.from(new Set(ids));
    return uniq.map(id => employeeMap[id] || id);
  };

  return (
    <View style={tw`flex-1 bg-gray-100`}>
      {/* 日付選択 */}
      <View style={tw`flex-row items-center mt-4 p-4 bg-white border-b border-gray-300`}>
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

      <ScrollView contentContainerStyle={tw`p-4`}>
        {projects.length === 0 ? (
          <Text style={tw`text-center text-gray-500`}>本日のプロジェクトはありません</Text>
        ) : (
          projects.map(proj => {
            const start = asDate(proj.startDate) || asDate(proj.start) || asDate(proj.startAt);
            const end   = asDate(proj.endDate)   || asDate(proj.end)   || asDate(proj.endAt);
            const startTime = fmtHM(start);
            const endTime   = fmtHM(end);
            const memberNames = membersOf(proj);
            const creatorName = employeeMap[proj?.management] || '';
            const creatorInitial = initialOf(creatorName);

            return (
              <TouchableOpacity
                key={proj.id}
                onPress={() =>
                  navigation.navigate('ProjectDetail', { projectId: proj.id, date: dateKey(selectedDate) })
                }
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
                  <View style={[tw`flex-1 bg-white rounded-xl shadow p-3 border border-gray-100`, { minHeight: 56 }]}>
                    <Text style={tw`text-base font-bold`} numberOfLines={1}>
                      {proj.name || proj.title || '（名称未設定）'}
                    </Text>
                    <Text style={tw`text-gray-500 mt-1`} numberOfLines={1}>
                      {memberNames.length ? memberNames.join('、') : 'メンバー未設定'}
                    </Text>
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
    </View>
  );
}
