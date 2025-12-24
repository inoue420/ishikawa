// src/screens/phone/ProjectDetailScreen.js
import React, { useEffect, useState, useMemo, useLayoutEffect, useCallback } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

import {
  fetchProjectById,
  fetchAllUsers,
  fetchMaterialUsages,
  fetchMaterialsList,
  uploadProjectPhoto,
  listProjectPhotos,
  deleteProjectPhoto,
  addEditLog,
  fetchEditLogs,
  addProjectComment,
  fetchProjectComments,
  findEmployeeByIdOrEmail,
  deleteProject,  
  fetchVehicles,
} from '../../firestoreService';

// 追加：Firestore Timestamp/Date を安全に Date|null へ
const toDateMaybe = (v) => {
  if (!v) return null;
  try {
    if (v?.toDate) return v.toDate();
    if (typeof v === 'string') {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        const y = Number(m[1]);
        const mo = Number(m[2]) - 1;
        const d0 = Number(m[3]);
        const dt = new Date(y, mo, d0, 0, 0, 0, 0);
        return Number.isNaN(dt.getTime()) ? null : dt;
      }
    }
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};



const dateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// ── プロジェクトステータス（Register画面と同じ定義） ──
const STATUS_OPTIONS = [
  { value: 'prospect',    label: '見込み' },
  { value: 'quoted',      label: '見積提出済' },
  { value: 'ordered',     label: '受注確定' },
  { value: 'preparing',   label: '準備中' },
  { value: 'in_progress', label: '施工中' },
  { value: 'completed',   label: '完了' },
  { value: 'billed',      label: '請求済' },
  { value: 'cancelled',   label: '中止' },
];

// ── 工程ステータス（Register画面と揃える） ──
const WORK_STATUS_TYPES = [
  { key: 'assembly',   label: '組立' },
 { key: 'dismantle',  label: '解体' },
  { key: 'additional', label: '追加工事' },
  { key: 'regular',    label: '常用' },
  { key: 'correction', label: '是正' },
  { key: 'pickup',     label: '引き上げ' },
];

// ─────────────────────────────────────────

export default function ProjectDetailScreen({ route }) {
  const navigation = useNavigation();
  // Navigator から渡す userEmail を受け取る（未渡しでも動くように ?? {} で安全化）
  const { projectId, date, userEmail } = route.params ?? {}; // 'YYYY-MM-DD' + userEmail  // 送信者解決・ピッカー重複起動防止
  const [picking, setPicking] = useState(false);

  // 送信者を決定するヘルパー（by=従業員ID / byName=employees.name）
      const [employees, setEmployees] = useState([]);
      const [me, setMe] = useState(null); // { id, name, ... }

      const resolveCurrentUser = useCallback(async () => {
    try {
      // 1) state から
      if (me?.id) return { by: me.id, byName: me.name ?? null, source: 'state' };
      // 2) route.params.userEmail を最優先（doc.id / email / loginId で解決）
      if (userEmail) {
        const emp = await findEmployeeByIdOrEmail(String(userEmail));
        if (emp) return { by: emp.id, byName: emp.name ?? null, source: 'route.userEmail' };
      }
      // 3) 従業員一覧が未取得なら取得してフォールバック      
      let emps = employees;
      if (!emps || emps.length === 0) {
        emps = await fetchAllUsers();
        setEmployees(emps);
      }
      if (emps?.length === 1) {
        const e = emps[0];
        return { by: e.id, byName: e.name ?? null, source: 'single-employee' };
      }
      const admin = emps.find(e => e.role === 'admin') || emps.find(e => e.role === 'manager');
      if (admin) return { by: admin.id, byName: admin.name ?? null, source: 'admin/manager' };
    } catch (e) {
      console.log('[resolveCurrentUser] error', e);
    }
    console.warn('[resolveCurrentUser] fallback to unknown');
    return { by: 'unknown', byName: null, source: 'unknown' };
  }, [me?.id, me?.name, userEmail, employees]);
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [usages, setUsages] = useState([]);
  const [materialsList, setMaterialsList] = useState([]);

  // 追加：写真・履歴・コメント・投稿関連
  const [photos, setPhotos] = useState([]);
  const [editLogs, setEditLogs] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [pendingImage, setPendingImage] = useState(null); // { uri }
  const [sending, setSending] = useState(false);
  // 車両マスタ（作業ステータス表示用）
  const [vehicles, setVehicles] = useState([]);
  const vehiclesById = useMemo(
    () => Object.fromEntries((vehicles || []).map(v => [v.id, v])),
    [vehicles]
  );
  // 作業ステータス（閲覧用）
  const [workStatuses, setWorkStatuses] = useState([]); // FirestoreのworkStatusesをそのまま保持
  const [expandedStatusType, setExpandedStatusType] = useState(null); // 表示するタイプ（assembly等）

  // date が変わったら初期選択を作り直す（別日へ遷移した時に反映）
  useEffect(() => {
    setExpandedStatusType(null);
  }, [date]);

  // id→name の辞書と、参加者名リスト
  const nameById = useMemo(
    () => Object.fromEntries(employees.map(e => [e.id, e.name])),
    [employees]
  );
  const participantNames = useMemo(
    () => (project?.participants ?? []).map(id => nameById[id]).filter(Boolean),
    [project?.participants, nameById]
  );

  // 案件ステータスの表示ラベル
  const statusLabel = useMemo(() => {
    if (!project?.status) return '未設定';
    const hit = STATUS_OPTIONS.find(o => o.value === project.status);
    return hit?.label || project.status;
  }, [project?.status]);

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

        // ログインユーザー（編集者名の解決）：userEmail を最優先で me にセット
        try {
          let u = null;
          if (userEmail) u = await findEmployeeByIdOrEmail(String(userEmail));
          if (!u) {
            const adminOrMgr = emps.find(e => e.role === 'admin' || e.role === 'manager');
            u = adminOrMgr || emps[0] || null;
          }
          if (u) {
            setMe({ id: u.id, name: u.name });
          }
        } catch (e) { /* noop: me 解決失敗は致命ではない */ }


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

  // Firestoreに保存された作業ステータスをローカルstateに反映
  useEffect(() => {
    if (!project || !Array.isArray(project.workStatuses)) {
      setWorkStatuses([]);
      setExpandedStatusType(null);
     return;
    }
    const ws = project.workStatuses.map(ws => ({
      ...ws,
      startDate: toDateMaybe(ws.startDate),
      endDate: toDateMaybe(ws.endDate),
    }));
    setWorkStatuses(ws);
    // ★ 初期チェック：その日(date)に割り当てられている工程を最初から選択
    // 既にユーザーが選択している場合は上書きしない
    if (expandedStatusType) return;
    const target = toDateMaybe(date);
    if (!target) return;
    const t = dateOnly(target).getTime();

    const candidates = ws
      .filter(x => x?.type)
      .filter(x => x?.startDate && x?.endDate)
      .filter(x => {
        const s = dateOnly(x.startDate).getTime();
　       const e = dateOnly(x.endDate).getTime();
        return s <= t && t <= e;
      })
      .sort((a, b) => {
        const af = a.scheduleStatus === 'fixed' ? 0 : 1;
        const bf = b.scheduleStatus === 'fixed' ? 0 : 1;
        if (af !== bf) return af - bf;
        const as = a.startDate ? a.startDate.getTime() : 0;
        const bs = b.startDate ? b.startDate.getTime() : 0;
        if (as !== bs) return as - bs;
        return String(a.type).localeCompare(String(b.type));
      });
     
    if (candidates.length) {
      setExpandedStatusType(candidates[0].type);
    }
  }, [project?.workStatuses, date, expandedStatusType]);

  // 車両マスタ
  useEffect(() => {
    (async () => {
      try {
        const vs = await fetchVehicles();
        setVehicles(vs);
      } catch (e) {
        console.error('[vehicles] load error', e);
      }
    })();
  }, []);  



  // 画像を選ぶ（送信時にまとめて投稿）
  const handlePickImage = async () => {
    if (picking) return;
    setPicking(true);
    try {
      // 1) 既存権限チェック
      const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!cur.granted) {
        const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
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
      });
      if (result?.canceled) return;
      const asset = result?.assets?.[0];
      if (!asset?.uri) return;
      setPendingImage({ uri: asset.uri });
    } catch (e) {
      console.error('[picker] error', e);
      Alert.alert('画像の取得でエラーが発生しました。', String(e?.message ?? e));
    } finally {
      setPicking(false);
    }
  };

  // 送信（テキストだけ／画像だけ／両方OK）
  const handleSend = async () => {
    if (sending) return;
    const text = (commentText || '').trim();
    if (!text && !pendingImage) return;
    setSending(true);
    try {
      const { by, byName, source } = await resolveCurrentUser();
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

      }

      // コメント追加（画像URLも格納可）
      await addProjectComment({
        projectId,
        date,
        text,
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


  // 追加：右上メニュー（編集・コピー・削除）
  const openActionMenu = useCallback(() => {
    const onEdit = () => {
      // 編集：プロジェクトオブジェクトをそのまま初期値として渡す
      const src = project || {};
      navigation.navigate('Profile', {
        screen: 'ProjectRegister',
        params: {
          mode: 'edit',
          projectId: src?.id,
          date,
          userEmail: userEmail ?? null,
          // ★ src には workStatuses / location / visibility / vehiclePlan / participantPlan 等も含まれる
          initialValues: src,
        },
      });
    };

    const onCopy = () => {
      // コピー：こちらもプロジェクトを丸ごと渡す（Register 側で(コピー)付与
      const src = project || {};
      navigation.navigate('Profile', {
        screen: 'ProjectRegister',
        params: {
          mode: 'copy',
          date,
          userEmail: userEmail ?? null,
          initialValues: src,
        },
      });
    };

    const onDelete = async () => {
      Alert.alert('削除しますか？', 'このプロジェクトを削除します。復元はできません。', [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              const { by, byName } = await resolveCurrentUser();
              await deleteProject(project?.id, { by, byName }); // 履歴は内部で自動記録
              Alert.alert('削除しました');
              navigation.goBack();
            } catch (e) {
              console.error('delete project error', e);
              Alert.alert('削除に失敗しました');
            }
          },
        },
      ]);
    };

    Alert.alert(
      '操作を選択',
      '',
      [
        { text: '編集', onPress: onEdit },
        { text: 'コピー', onPress: onCopy },
        { text: '削除', style: 'destructive', onPress: onDelete },
        { text: 'キャンセル', style: 'cancel' },
      ],
      { cancelable: true },
    );
  }, [navigation, project, projectId, date, userEmail, resolveCurrentUser]);

  // 追加：ヘッダー右上にメニュー（⋯）を設置
  useLayoutEffect(() => {
    navigation?.setOptions?.({
      headerRight: () => (
       <TouchableOpacity onPress={openActionMenu} style={tw`mr-3 px-2 py-1`}>
          <Text style={tw`text-xl`}>⋯</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, openActionMenu]);

  // 編集画面から戻って来たときに「プロジェクト本体＋履歴」を最新化
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const [proj, logs] = await Promise.all([
            fetchProjectById(projectId),
            fetchEditLogs(projectId, date),
          ]);
          if (cancelled) return;
          setProject(proj);
          setEditLogs(logs);
        } catch (e) {
          console.log('[focus -> reload project & logs] error', e);
        }
      })();
      return () => { cancelled = true; };
    }, [projectId, date])
  );

  // 画像削除（一覧から個別削除）
  const handleDeletePhoto = async (photo) => {
    Alert.alert('削除しますか？', 'この写真を削除します。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            const { by, byName } = await resolveCurrentUser();
            await deleteProjectPhoto({ projectId, photoId: photo.id });
           try {
            await addEditLog({
              projectId,
              date,
              dateKey: date,
              action: 'delete',
              target: 'photo',
              targetId: null,
              by,
              byName
            });
           } catch(e) { console.log('[addEditLog photo delete] error', e); }

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
      <SafeAreaView edges={['top']} style={tw`flex-1 justify-center items-center`}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={tw`flex-1`}>
      <ScrollView contentContainerStyle={tw`p-4 pb-28`}>
        {/* プロジェクト名 + ステータス */}
        <View style={tw`mb-3`}>
          <View style={tw`flex-row flex-wrap items-center`}>
            <Text style={tw`text-xl font-bold mr-2`}>
              {project?.name || '（名称未設定）'}
            </Text>
            {/* 「見込み」はバッジ非表示 */}
            {project?.status && project.status !== 'prospect' && (
              <View style={tw`px-2 py-1 rounded-full bg-blue-100 border border-blue-300`}>
                <Text style={tw`text-xs`}>{statusLabel}</Text>
              </View>
            )}
          </View>
          <Text style={tw`text-xs text-gray-500 mt-1`}>プロジェクト詳細</Text>
        </View>

        <Text>営業担当: {employees.find(e => e.id === project?.sales)?.name || project?.salesOtherName || '—'}</Text>
        <Text>現場調査担当: {employees.find(e => e.id === project?.survey)?.name || project?.surveyOtherName || '—'}</Text>
        <Text>設計担当: {employees.find(e => e.id === project?.design)?.name || project?.designOtherName || '—'}</Text>
        <Text>管理担当: {employees.find(e => e.id === project?.management)?.name || project?.managementOtherName || '—'}</Text>
        <Text>
          参加従業員（{participantNames.length}名）:
          {participantNames.length ? ` ${participantNames.join('、')}` : ' —'}
        </Text>


        {/* ===== 作業ステータス（閲覧のみ） ===== */}
        <View style={tw`mt-4`}>
          <Text style={tw`text-lg font-bold mb-1`}>作業ステータス</Text>
          {workStatuses.length === 0 ? (
            <Text style={tw`text-gray-500`}>
              登録された作業ステータスはありません。
            </Text>
          ) : (
            <>
              <Text style={tw`text-xs text-gray-600 mb-2`}>
                下のステータスをタップすると、日程・参加従業員・車両の詳細が表示されます（閲覧のみ）。
              </Text>

              {/* ステータス種別ごとのチェックボタン */}
              <View style={tw`flex-row flex-wrap -mx-1 mb-2`}>
                {WORK_STATUS_TYPES.map(st => {
                  // そのタイプのworkStatusが1件も無ければボタンを出さない
                  const exists = workStatuses.some(ws => ws.type === st.key);
                  if (!exists) return null;
                  const selected = expandedStatusType === st.key;
                  return (
                    <TouchableOpacity
                      key={st.key}
                      activeOpacity={0.7}
                      onPress={() =>
                        setExpandedStatusType(prev => prev === st.key ? null : st.key)
                      }
                      style={tw.style(
                        'm-1 px-3 py-2 rounded border',
                        selected
                          ? 'bg-blue-100 border-blue-400'
                          : 'bg-white border-gray-300'
                      )}
                    >
                      <Text>{(selected ? '☑ ' : '☐ ') + st.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 選択されているタイプのステータスを一覧表示（複数件あり得る） */}
              {expandedStatusType && (
                <View>
                  {workStatuses
                    .filter(ws => ws.type === expandedStatusType)
                    .map(ws => {
                      const start = ws.startDate;
                      const end = ws.endDate;
                      const statusJa =
                        ws.scheduleStatus === 'fixed' ? '確定' : '未設定';
                      const empNames = (ws.employeeIds || [])
                        .map(id => nameById[id])
                        .filter(Boolean);
                      const vehicleNames = (ws.vehicleIds || [])
                        .map(id => vehiclesById[id]?.name)
                        .filter(Boolean);

                      const formatDateTime = (d) => {
                        if (!d) return '未設定';
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, '0');
                        const dd = String(d.getDate()).padStart(2, '0');
                        const hh = String(d.getHours()).padStart(2, '0');
                        const mm = String(d.getMinutes()).padStart(2, '0');
                        return `${y}-${m}-${dd} ${hh}:${mm}`;
                      };

                      return (
                        <View
                          key={ws.id}
                          style={tw`mb-3 p-3 border rounded bg-gray-50`}
                        >
                          <View style={tw`flex-row items-center justify-between mb-2`}>
                            <Text style={tw`font-bold`}>
                              {ws.label || '工程'}
                            </Text>
                            <View
                              style={tw`px-2 py-1 rounded-full border ${
                                ws.scheduleStatus === 'fixed'
                                  ? 'bg-green-100 border-green-400'
                                  : 'bg-gray-100 border-gray-400'
                              }`}
                            >
                              <Text style={tw`text-xs`}>{statusJa}</Text>
                            </View>
                          </View>

                          <Text style={tw`mb-1`}>
                            期間: {formatDateTime(start)} ～ {formatDateTime(end)}
                          </Text>
                          <Text style={tw`mb-1`}>
                            参加従業員:
                            {empNames.length ? ` ${empNames.join('、')}` : ' —'}
                          </Text>
                          <Text>
                            車両:
                            {vehicleNames.length ? ` ${vehicleNames.join('、')}` : ' —'}
                          </Text>
                        </View>
                      );
                    })}
                </View>
              )}
            </>
          )}
        </View>



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
              const targetLabel =
                log.target === 'vehicles' ? '車両'
                : log.target === 'participants' ? '参加従業員'
                : log.target === 'photo' ? '写真'
                : log.target === 'project' ? 'プロジェクト'
                : (log.target || '—'); 
              return (
                <View key={log.id} style={tw`mt-2`}>
                  <Text>編集者: {who}</Text>
                  <Text>編集(保存)日時: {ymd} {hms}</Text>
                  <Text>対象: {targetLabel} / 操作: {actionJa}</Text>
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
    </SafeAreaView>
  );
}
