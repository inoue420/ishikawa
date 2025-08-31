// src/screens/phone/ProjectDetailScreen.js
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import tw from 'twrnc';
import * as ImagePicker from 'expo-image-picker';
import { getAuth } from 'firebase/auth';

import {
  fetchProjectById,
  fetchAllUsers,
  fetchMaterialsRecords,
  fetchMaterialUsages,
  fetchMaterialsList,
  uploadProjectPhoto,
  listProjectPhotos,
  deleteProjectPhoto,
  addEditLog,
  fetchEditLogs,
  addProjectComment,
  fetchProjectComments,
  fetchUserByEmail,
} from '../../firestoreService';

export default function ProjectDetailScreen({ route }) {
  const { projectId, date } = route.params; // 'YYYY-MM-DD'
  // 送信者解決・ピッカー重複起動防止
  const [picking, setPicking] = useState(false);

  // 送信者を決定するヘルパー（by=従業員ID / byName=employees.name）
  const resolveCurrentUser = async () => {
    try {
      if (me?.id) {
        return { by: me.id, byName: me.name ?? null, source: 'state' };
      }
      const auth = getAuth();
      const email = auth?.currentUser?.email ?? null;
      const displayName = auth?.currentUser?.displayName ?? null;
      if (email) {
        const u = await fetchUserByEmail(email);
        if (u) return { by: u.id, byName: u.name ?? null, source: 'employees(email)' };
        return { by: email, byName: displayName ?? email.split('@')[0], source: 'auth-fallback' };
      }
      // Auth が取れない環境のフォールバック
      if (employees?.length === 1) {
        const e = employees[0];
        return { by: e.id, byName: e.name ?? null, source: 'single-employee' };
      }
      const admin = employees.find(e => e.role === 'admin') || employees.find(e => e.role === 'manager');
      if (admin) {
        return { by: admin.id, byName: admin.name ?? null, source: 'admin/manager' };
      }
    } catch (e) {
      console.log('[resolveCurrentUser] error', e);
    }
    console.warn('[resolveCurrentUser] fallback to unknown');
    return { by: 'unknown', byName: null, source: 'unknown' };
  };
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [usages, setUsages] = useState([]);
  const [materialsList, setMaterialsList] = useState([]);

  // 追加：写真・履歴・コメント・投稿関連
  const [photos, setPhotos] = useState([]);
  const [editLogs, setEditLogs] = useState([]);
  const [comments, setComments] = useState([]);
  const [me, setMe] = useState(null); // { id, name, ... }
  const [commentText, setCommentText] = useState('');
  const [pendingImage, setPendingImage] = useState(null); // { uri }
  const [sending, setSending] = useState(false);


  // id→name の辞書と、参加者名リスト
  const nameById = useMemo(
    () => Object.fromEntries(employees.map(e => [e.id, e.name])),
    [employees]
  );
  const participantNames = useMemo(
    () => (project?.participants ?? []).map(id => nameById[id]).filter(Boolean),
    [project?.participants, nameById]
  );

  // usages と materialsList から「大分類→品名1→アイテム配列」を生成（既存ロジック維持）
  const usageGroups = useMemo(() => {
    const groups = {};
    usages.forEach(u => {
      const master = materialsList.find(m => m.id === u.materialId) || {};
      const category = master.category || '未設定';
      const name1 = master.name1 || '未設定';
      const entry = {
        name2: master.name2 || '',
        partNo: master.partNo || '',
        qty: u.quantity,
      };
      if (!groups[category]) groups[category] = {};
      if (!groups[category][name1]) groups[category][name1] = [];
      groups[category][name1].push(entry);
    });
    return groups;
  }, [usages, materialsList]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // プロジェクト・従業員
        const proj = await fetchProjectById(projectId);
        setProject(proj);
        const emps = await fetchAllUsers();
        setEmployees(emps);

        // ログインユーザー（編集者名の解決に使用）
        try {
          const auth = getAuth();
          const email = auth?.currentUser?.email ?? null;
          const emailLocal = email ? email.split('@')[0] : null;
          const displayName = auth?.currentUser?.displayName ?? null;
          let u = null;
          if (email) {
            // まずは完全一致 → ダメならローカル部でも検索（今回のDB構成に対応）
            u = await fetchUserByEmail(email);
            if (!u && emailLocal) u = await fetchUserByEmail(emailLocal);
          }
          if (u) {
            setMe(u); // employees の { id, name, ... }
            console.log('[me] resolved from employees', u);
          } else {
            // Authが取れない/一致しない → employeesから代表者を選ぶ
            const adminOrMgr = emps.find(e => e.role === 'admin' || e.role === 'manager');
            const fallback = adminOrMgr || emps[0] || null;
            if (fallback) {
              setMe({ id: fallback.id, name: fallback.name });
              console.log('[me] fallback employees', fallback);
            } else if (email) {
              setMe({ id: email, name: displayName || emailLocal || email });
              console.log('[me] fallback auth only', email);
            } else {
              console.warn('[me] could not resolve user; will fallback to unknown at send-time');
            }
          }
        } catch (e) {
          console.log('[me] resolve error', e);
        }

        // 資材記録（当日だけ抽出）
        const allMat = await fetchMaterialsRecords();
        const filteredMat = allMat.filter(m => {
          if (m.project !== projectId) return false;
          const ts = m.timestamp.toDate();
          const localY = ts.getFullYear();
          const localM = String(ts.getMonth() + 1).padStart(2, '0');
          const localD = String(ts.getDate()).padStart(2, '0');
          const localDate = `${localY}-${localM}-${localD}`;
          return localDate === date;
        });
        setMaterials(filteredMat);

        // 使用量・資材マスタ
        const rawUsages = await fetchMaterialUsages(projectId);
        setUsages(rawUsages);
        const allMaterialsList = await fetchMaterialsList();
        setMaterialsList(allMaterialsList);

        // 写真・編集履歴・コメント
        const [ph, logs, cmts] = await Promise.all([
          listProjectPhotos(projectId, date),
          fetchEditLogs(projectId, date),
          fetchProjectComments(projectId, date),
        ]);
        setPhotos(ph);
        setEditLogs(logs);
        setComments(cmts);
      } catch (err) {
        console.error('❌ ProjectDetail load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, date]);

  // 画像を選ぶ（送信時にまとめて投稿）
  const handlePickImage = async () => {
  if (picking) return;
  setPicking(true);
  try {
    console.log('[picker] start');
    // 1) 既存権限チェック
    const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
    console.log('[picker] perm', cur);
    if (!cur.granted) {
      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      console.log('[picker] req', req);
      if (!req.granted) {
        Alert.alert('権限が必要です', '写真へのアクセスを許可してください。');
        return;
      }
    }
    // 2) ピッカー起動（堅めのオプション）
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
      exif: false,
      base64: false,
      allowsMultipleSelection: false,
      // selectionLimit: 1, // SDK により未対応ならコメントアウトでOK
    });
    console.log('[picker] result', result);
    if (result?.canceled) return;
    const asset = result?.assets?.[0];
    console.log('[picker] asset', asset);
    if (!asset?.uri) return;
    setPendingImage({ uri: asset.uri });
  } catch (e) {
    console.error('[picker] error', e);
    Alert.alert('画像の取得でエラーが発生しました。', String(e?.message ?? e));
  }
    finally {
    setPicking(false);
  }
  };

  // 送信（テキストだけ／画像だけ／両方OK）
  const handleSend = async () => {
    if (sending) return;
    if (!commentText && !pendingImage) return;
    setSending(true);
    try {
      const { by, byName, source } = await resolveCurrentUser();
      console.log('[send] sender', { by, byName, source, hasImage: !!pendingImage });
      let uploadedUrl = null;

      // 添付があれば先にアップロード → 写真コレクション → 履歴
      if (pendingImage?.uri) {
        const { id: photoId, url } = await uploadProjectPhoto({
          projectId,
          date,
          localUri: pendingImage.uri,
          uploadedBy: by,
        });
        uploadedUrl = url;
        await addEditLog({
          projectId,
          date,
          action: 'add',
          target: 'photo',
          targetId: photoId,
          by,
          byName
        });
      }

      // コメント追加（画像URLも格納可）
      await addProjectComment({
        projectId,
        date,
        text: commentText,
        imageUrl: uploadedUrl,
        by,
        byName
      });

      // 再取得
      const [ph, logs, cmts] = await Promise.all([
        listProjectPhotos(projectId, date),
        fetchEditLogs(projectId, date),
        fetchProjectComments(projectId, date),
      ]);
      setPhotos(ph);
      setEditLogs(logs);
      setComments(cmts);

      // 入力クリア
      setCommentText('');
      setPendingImage(null);
    } catch (e) {
      console.error('send error', e);
      Alert.alert('送信に失敗しました');
    } finally {
      setSending(false);
    }
  };

  // 画像削除（一覧から個別削除）
  const handleDeletePhoto = async (photo) => {
    Alert.alert('削除しますか？', 'この写真を削除します。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteProjectPhoto({ projectId, photoId: photo.id });
            await addEditLog({
              projectId,
              date,
              action: 'delete',
              target: 'photo',
              targetId: photo.id,
              by: me?.id ?? null,
              byName: me?.name ?? null,
            });
            const [ph, logs] = await Promise.all([
              listProjectPhotos(projectId, date),
              fetchEditLogs(projectId, date),
            ]);
            setPhotos(ph);
            setEditLogs(logs);
          } catch (e) {
            console.error('delete error', e);
            Alert.alert('削除に失敗しました');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={tw`flex-1 justify-center items-center`}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={tw`flex-1`}>
      <ScrollView contentContainerStyle={tw`p-4 pb-28`}>
        <Text style={tw`text-xl font-bold`}>プロジェクト詳細</Text>
        <Text>営業担当: {employees.find(e => e.id === project?.sales)?.name || '—'}</Text>
        <Text>現場調査担当: {employees.find(e => e.id === project?.survey)?.name || '—'}</Text>
        <Text>設計担当: {employees.find(e => e.id === project?.design)?.name || '—'}</Text>
        <Text>管理担当: {employees.find(e => e.id === project?.management)?.name || '—'}</Text>
        <Text>
          参加従業員（{participantNames.length}名）:
          {participantNames.length ? ` ${participantNames.join('、')}` : ' —'}
        </Text>

        {/* ===== 写真セクション ===== */}
        <View style={tw`mt-6`}>
          <Text style={tw`text-lg font-bold`}>写真</Text>
          {photos.length === 0 ? (
            <Text style={tw`mt-3`}>この日の写真はありません</Text>
          ) : (
            <View style={tw`mt-3 flex-row flex-wrap`}>
              {photos.map(p => (
                <View key={p.id} style={tw`w-1/3 p-1`}>
                  <View style={tw`rounded-lg overflow-hidden border border-gray-200`}>
                    <Image source={{ uri: p.url }} style={{ width: '100%', aspectRatio: 1 }} />
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeletePhoto(p)}
                    style={tw`mt-1 px-2 py-1 bg-red-500 rounded`}
                  >
                    <Text style={tw`text-white text-center`}>削除</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ===== 資材使用量セクション（既存） ===== */}
        <Text style={tw`mt-6 text-lg`}>資材使用量: {usages.length}件</Text>
        {usages.length === 0 ? (
          <Text style={tw`mt-2`}>データがありません</Text>
        ) : (
          Object.entries(usageGroups).map(([category, name1Map]) => (
            <View key={category} style={tw`mt-4`}>
              <Text style={tw`text-lg font-bold`}>大分類: {category}</Text>
              {Object.entries(name1Map).map(([name1, items]) => (
                <View key={name1} style={tw`pl-4 mt-2`}>
                  <Text style={tw`text-base font-semibold`}>品名1: {name1}</Text>
                  {items.map((item, idx) => (
                    <View key={idx} style={tw`pl-4 mt-1`}>
                      <Text>品名2: {item.name2}</Text>
                      <Text>品番: {item.partNo}</Text>
                      <Text>数量: {item.qty}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ))
        )}

        {/* ===== コメント（会話） ===== */}
        <View style={tw`mt-8`}>
          <Text style={tw`text-lg font-bold`}>コメント</Text>
          {comments.length === 0 ? (
            <Text style={tw`mt-2`}>コメントはまだありません</Text>
          ) : (
            comments.map(c => {
              const who = nameById[c.by] ?? c.byName ?? c.by ?? '—';
              if (who === '—') console.log('[render comment] no name match', { by: c.by, byName: c.byName, keys: Object.keys(nameById).slice(0,5) });

              const when = c.at?.toDate ? c.at.toDate() : null;
              const y = when ? when.getFullYear() : '';
              const m = when ? String(when.getMonth() + 1).padStart(2, '0') : '';
              const d = when ? String(when.getDate()).padStart(2, '0') : '';
              const hh = when ? String(when.getHours()).padStart(2, '0') : '';
              const mm = when ? String(when.getMinutes()).padStart(2, '0') : '';
              return (
                <View key={c.id} style={tw`mt-3 p-3 rounded-xl bg-gray-100`}>
                  <Text style={tw`text-xs text-gray-600`}>{who}・{y}-{m}-{d} {hh}:{mm}</Text>
                  {c.text ? <Text style={tw`mt-1`}>{c.text}</Text> : null}
                  {c.imageUrl ? (
                    <View style={tw`mt-2 rounded-lg overflow-hidden border border-gray-200`}>
                      <Image source={{ uri: c.imageUrl }} style={{ width: '100%', aspectRatio: 1 }} />
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        {/* ===== 編集履歴（最下部） ===== */}
        <View style={tw`mt-10`}>
          <Text style={tw`text-lg font-bold`}>編集履歴</Text>
          {editLogs.length === 0 ? (
            <Text style={tw`mt-2`}>履歴はありません</Text>
          ) : (
            editLogs.map((log) => {
              const who = nameById[log.by] ?? log.byName ?? log.by ?? '—';
              if (who === '—') console.log('[render log] no name match', { by: log.by, byName: log.byName, keys: Object.keys(nameById).slice(0,5) });
              const when = log.at?.toDate ? log.at.toDate() : null;
              const ymd = when
                ? `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(
                    when.getDate()
                  ).padStart(2, '0')}`
                : '—';
              const hms = when
                ? `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`
                : '';
              const actionJa = log.action === 'add' ? '追加' : log.action === 'delete' ? '削除' : log.action;
              return (
                <View key={log.id} style={tw`mt-2`}>
                  <Text>編集者: {who}</Text>
                  <Text>編集(保存)日時: {ymd} {hms}</Text>
                  <Text>対象: 写真 / 操作: {actionJa}</Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ===== 画面下部の固定入力バー（LINE風） ===== */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={tw`px-3 py-2 bg-white border-t border-gray-200`}>
          {pendingImage?.uri ? (
            <View style={tw`mb-2 flex-row items-center`}>
              <View style={tw`w-16 h-16 mr-2 rounded-lg overflow-hidden border border-gray-200`}>
                <Image source={{ uri: pendingImage.uri }} style={{ width: '100%', height: '100%' }} />
              </View>
              <TouchableOpacity onPress={() => setPendingImage(null)} style={tw`px-3 py-2 bg-gray-200 rounded`}>
                <Text>添付をクリア</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={tw`flex-row items-center`}>
            <TouchableOpacity onPress={handlePickImage} style={tw`px-3 py-2`}>
              <Text>📎</Text>
            </TouchableOpacity>

            <View style={tw`flex-1 px-2`}>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="コメントを入力..."
                style={tw`border border-gray-300 rounded-lg px-3 py-2`}
                multiline
              />
            </View>

            <TouchableOpacity onPress={handleSend} style={tw`px-3 py-2`}>
              <Text>{sending ? '…' : '➤'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
