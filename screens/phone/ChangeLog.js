// src/screens/phone/ChangeLog.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, FlatList, TouchableOpacity } from 'react-native';
import tw from 'twrnc';
import { fetchProjectChangeLogs, fetchProjects } from '../../firestoreService';

function formatTS(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ''; }
}

const ACTION_ICON = { create: '🆕', update: '✍️', delete: '🗑️' };
const ACTION_LABEL = { create: '作成', update: '編集', delete: '削除' };

export default function ChangeLog() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [projects, setProjects] = useState([]);

  const pnameOf = useMemo(() => {
    const m = {};
    (projects || []).forEach(p => { if (p?.id) m[p.id] = p?.name || p?.title || p?.id; });
    return (id) => m[id] ?? id ?? '(不明PJ)';
  }, [projects]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ls, ps] = await Promise.all([
        fetchProjectChangeLogs(500),
        fetchProjects(),
      ]);
      setLogs(ls || []);
      setProjects(ps || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const renderItem = ({ item }) => {
    const icon = ACTION_ICON[item?.action] ?? '•';
    const label = ACTION_LABEL[item?.action] ?? item?.action ?? '';
    const at = formatTS(item?.at);
    const by = item?.byName || item?.by || 'unknown';
    const pid = item?.targetId || item?.projectId;
    return (
      <View style={tw`px-4 py-3 border-b border-gray-200`}>
        <Text style={tw`text-base`}>
          <Text>{icon} </Text>
          <Text>{label}</Text>
          <Text> / </Text>
          <Text>{pnameOf(pid)}</Text>
        </Text>
        <Text style={tw`text-xs text-gray-600 mt-1`}>
          <Text>{at}</Text>
          <Text> / </Text>
          <Text>by {by}</Text>
        </Text>
        {item?.note ? (
          <Text style={tw`text-xs text-gray-700 mt-1`}>
            <Text>{item.note}</Text>
          </Text>
        ) : null}
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
      <View style={tw`px-4 py-3 border-b border-gray-200 bg-white flex-row justify-between items-center`}>
        <Text style={tw`text-lg font-bold`}><Text>変更履歴</Text></Text>
        <TouchableOpacity onPress={load} style={tw`px-3 py-2 rounded bg-gray-100`}>
          <Text><Text>再読込</Text></Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={logs}
        keyExtractor={(it, i) => it?.id ?? `${it?.targetId ?? it?.projectId}-${it?.at?.seconds ?? i}`}
        renderItem={renderItem}
      />
    </View>
  );
}
