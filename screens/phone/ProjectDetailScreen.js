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
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

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
  findEmployeeByIdOrEmail,
  setProject as upsertProject,
  deleteProject,  
  fetchProjectsOverlappingRange,
} from '../../firestoreService';
import {
  fetchVehicles,
  fetchVehicleBlocksOverlapping,
  fetchReservationsByYmdRange,
  fetchReservationsForProject,
  saveProjectVehiclePlan,
  fetchAssignmentsByYmdRange,
  fetchAssignmentsForProject,
  saveProjectParticipantPlan,
  setEmployeeAssignment,
} from '../../firestoreService';
import { Timestamp } from 'firebase/firestore';

// 追加：Firestore Timestamp/Date を安全に Date|null へ
const toDateMaybe = (v) => {
  if (!v) return null;
  try {
    return v?.toDate ? v.toDate() : new Date(v);
  } catch {
    return null;
  }
};
// 日付ヘルパー
const dateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const toYmd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
// Set をログしやすい形（配列）に変換
const setMapToPlainObject = (mapObj) =>
  Object.fromEntries(
    Object.entries(mapObj || {}).map(([k, v]) => [k, Array.from(v || [])])
  );

export default function ProjectDetailScreen({ route }) {
  const navigation = useNavigation();
  // Navigator から渡す userEmail を受け取る（未渡しでも動くように ?? {} で安全化）
  const { projectId, date, userEmail } = route.params ?? {}; // 'YYYY-MM-DD' + userEmail  // 送信者解決・ピッカー重複起動防止
  const [picking, setPicking] = useState(false);

  // 送信者を決定するヘルパー（by=従業員ID / byName=employees.name）
  const resolveCurrentUser = async () => {
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
  // 車両まわり
  const [vehicles, setVehicles] = useState([]);
  const vehiclesById = useMemo(
    () => Object.fromEntries((vehicles || []).map(v => [v.id, v])),
    [vehicles]
  );
  // 選択と空き状況
  const [vehicleSelections, setVehicleSelections] = useState({}); // { 'YYYY-MM-DD': { sales?: id, cargo?: id } }
  const [unavailableMap, setUnavailableMap] = useState({});       // { 'YYYY-MM-DD': Set(vehicleId) }
  const [availLoading, setAvailLoading] = useState(false); 
  const [participantSelections, setParticipantSelections] = useState({}); // { 'YYYY-MM-DD': Set<empId> }
  const [unavailableEmpMap, setUnavailableEmpMap] = useState({});         // { 'YYYY-MM-DD': Set<empId> }
  const [empAvailLoading, setEmpAvailLoading] = useState(false);

  // プロジェクトの開始/終了（Date）→ 期間配列
  const projStart = useMemo(() => toDateMaybe(project?.startDate), [project?.startDate]);
  const projEnd   = useMemo(() => toDateMaybe(project?.endDate) || toDateMaybe(project?.startDate), [project?.endDate, project?.startDate]);
  const datesInRange = useMemo(() => {
    if (!projStart || !projEnd) return [];
    const s0 = dateOnly(projStart), e0 = dateOnly(projEnd);
    const arr = [];
    for (let d = new Date(s0); d <= e0; d.setDate(d.getDate() + 1)) arr.push(new Date(d));
    return arr;
  }, [projStart, projEnd]);

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
            console.log('[me] resolved', u);
          }
        } catch (e) { console.log('[me] resolve error', e); }

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
  // 車両マスタ
  useEffect(() => {
    (async () => {
      try {
        const vs = await fetchVehicles();
        setVehicles(vs);
      } catch (e) {
        console.log('[vehicles] load error', e);
      }
    })();
  }, []);  
  // 保存済み vehiclePlan があればプリフィル
  useEffect(() => {
    if (project?.vehiclePlan && Object.keys(project.vehiclePlan).length) {
      setVehicleSelections(project.vehiclePlan);
    }
  }, [project?.vehiclePlan]);
  // 参加者：保存済みがあればプリフィル
  useEffect(() => {
    if (project?.participantPlan && Object.keys(project.participantPlan).length) {
      const next = {};
      Object.entries(project.participantPlan).forEach(([dy, arr]) => next[dy] = new Set(arr || []));
      setParticipantSelections(next);
    }
  }, [project?.participantPlan]);

  // 期間の空き状況（“同じ日なら不可”）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (datesInRange.length === 0) {
        setUnavailableMap({});
        setVehicleSelections(project?.vehiclePlan || {});
        return;
      }
      setAvailLoading(true);
      const s = datesInRange[0];
      const e = datesInRange[datesInRange.length - 1];
      const startKey = toYmd(s);
      const endKey   = toYmd(e);
      const startTs  = Timestamp.fromDate(new Date(`${startKey}T00:00:00`));
      const endTs    = Timestamp.fromDate(new Date(`${endKey}T23:59:59.999`));
      try {
        const [blocks, reservations] = await Promise.all([
          fetchVehicleBlocksOverlapping(startTs, endTs),
          fetchReservationsByYmdRange(startKey, endKey),
        ]);

      // ymd -> Set<vehicleId>
      const map = {};
      datesInRange.forEach(d => { map[toYmd(d)] = new Set(); });

      // 車検/修理：その日の 0:00–23:59 と重なれば不可
      for (const b of blocks) {
        const bs = b.startDate?.toDate?.() ?? new Date(b.startDate);
        const be = b.endDate?.toDate?.()   ?? new Date(b.endDate);
        for (const d of datesInRange) {
          const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0);
          const dayEnd   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23,59,59,999);
          if (dayStart <= be && bs <= dayEnd) {
            map[toYmd(d)].add(b.vehicleId);
          }
        }
      }
      // 他プロジェクトの予約：同じ日なら不可
      for (const r of reservations) {
        if (r.projectId === projectId) continue; // 自案件は編集のため許可
        const dy = r.dateKey || toYmd(r.date?.toDate?.() ?? new Date(r.date));
        if (map[dy]) map[dy].add(r.vehicleId);
      }
      if (!cancelled) setUnavailableMap(map);

      // プリフィル：保存済みがあれば最優先、なければ自案件の予約から推定
      if (project?.vehiclePlan && Object.keys(project.vehiclePlan).length) {
        if (!cancelled) setVehicleSelections(project.vehiclePlan);
      } else {
        const mine = await fetchReservationsForProject(projectId);
        const next = {};
        for (const r of mine) {
          const dy = r.dateKey || toYmd(r.date?.toDate?.() ?? new Date(r.date));
          const v  = vehiclesById[r.vehicleId];
          const t  = (v?.vehicleType || 'sales'); // 'sales' | 'cargo'
          next[dy] = { ...(next[dy] || {}), [t]: r.vehicleId };
        }
        if (!cancelled) setVehicleSelections(next);
      }
      } catch (e) {
        console.log('[availability] error', e);
      } finally {
        if (!cancelled) setAvailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projStart?.getTime(), projEnd?.getTime(), projectId, project?.vehiclePlan, vehiclesById]);
  // 参加者の空き状況（同じ日・他案件割当は不可）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (datesInRange.length === 0) {
        setUnavailableEmpMap({});
        setParticipantSelections(project?.participantPlan || {});
        return;
      }
      setEmpAvailLoading(true);
      const s = datesInRange[0], e = datesInRange[datesInRange.length - 1];
      const startKey = toYmd(s), endKey = toYmd(e);
      try {
        const assignments = await fetchAssignmentsByYmdRange(startKey, endKey);
        const map = {};
        datesInRange.forEach(d => { map[toYmd(d)] = new Set(); });
        for (const a of assignments) {
          if (a.projectId === projectId) continue;
          const dy = a.dateKey || toYmd(a.date?.toDate?.() ?? new Date(a.date));
          if (map[dy]) map[dy].add(a.employeeId);
        }
        if (!cancelled) setUnavailableEmpMap(map);
        // プリフィル：保存済みがなければ自案件割当を推定
        if (!(project?.participantPlan && Object.keys(project.participantPlan).length)) {
          const mine = await fetchAssignmentsForProject(projectId);
          const next = {};
          for (const r of mine) {
            const dy = r.dateKey || toYmd(r.date?.toDate?.() ?? new Date(r.date));
            const set = new Set(next[dy] || []);
            set.add(r.employeeId);
            next[dy] = set;
          }
          if (!cancelled) setParticipantSelections(next);
        }
      } catch (e) {
        console.log('[participants availability] error', e);
      } finally {
        if (!cancelled) setEmpAvailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projStart?.getTime(), projEnd?.getTime(), projectId, project?.participantPlan]);

  // 状態が変わったら都度ダンプ
  useEffect(() => {
    console.log('[vehicles][debug] unavailableMap(state)', setMapToPlainObject(unavailableMap));
  }, [unavailableMap]);
  useEffect(() => {
    console.log('[vehicles][debug] vehicleSelections(state)', vehicleSelections);
  }, [vehicleSelections]);

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
      console.log('[handleSend] params', { projectId, date, hasImg: !!pendingImage, textLen: commentText?.length ?? 0 });
      const { by, byName, source } = await resolveCurrentUser();
      console.log('[send] sender', { by, byName, source, hasImage: !!pendingImage });
      let uploadedUrl = null;

      // 添付があれば先にアップロード → 写真コレクション → 履歴
      if (pendingImage?.uri) {
        console.log('[handleSend] upload start', { uri: pendingImage.uri });
        const { id: photoId, url } = await uploadProjectPhoto({
          projectId,
          date,
          localUri: pendingImage.uri,
          uploadedBy: by,
        });
        console.log('[handleSend] upload done', { photoId, url: String(url).slice(0, 80) });
        uploadedUrl = url;

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
  const onPickVehicle = (ymd, type, vehicleId) => {
    if (availLoading) return;
    const blocked = !!vehicleId && unavailableMap[ymd]?.has(vehicleId);
    if (blocked) {
      Alert.alert('選択不可', 'この日は選択した車両を使用できません（既予約／車検・修理）');
      return;
    }
    setVehicleSelections(prev => ({
      ...prev,
      [ymd]: { ...(prev[ymd] || {}), [type]: vehicleId || undefined }
    }));
  };
  // --- 保存前・競合チェック（日単位） ---
  const checkVehicleConflicts = useCallback(async (selections, dates, selfProjectId) => {
    if (!dates?.length) return [];
    const s = dates[0];
    const e = dates[dates.length - 1];
    const startTs = Timestamp.fromDate(new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0,0,0,0));
    const endTs   = Timestamp.fromDate(new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23,59,59,999));
    const reservations = await fetchReservationsInRange(startTs, endTs);
    const conflicts = [];
    for (const d of dates) {
      const ymd = toYmd(d);
      const sel = selections[ymd] || {};
      for (const t of ['sales','cargo']) {
        const vid = sel[t];
        if (!vid) continue;
        const hit = reservations.find(r => {
          const rYmd = toYmd(r.date?.toDate?.() ?? new Date(r.date));
          const other = !selfProjectId || r.projectId !== selfProjectId;
          return other && r.vehicleId === vid && rYmd === ymd;
        });
        if (hit) conflicts.push({ date: ymd, vehicleId: vid });
      }
    }
    return conflicts;
  }, []);

  const handleSaveVehicles = async () => {
    try {
      const { by, byName } = await resolveCurrentUser();
      // 0) 保存ペイロード生成
      const vehiclePlan = {};
      Object.entries(vehicleSelections || {}).forEach(([ymd, sel]) => {
        const salesId = sel?.sales || null;
        const cargoId = sel?.cargo || null;
        if (salesId || cargoId) vehiclePlan[ymd] = { sales: salesId, cargo: cargoId };
      });


      // 1) 予約保存（Tx + 決め打ちID）※衝突時は例外
      await saveProjectVehiclePlan(projectId, vehiclePlan, datesInRange);
      // 2) プロジェクト側のキャッシュを更新
      await upsertProject(projectId, { vehiclePlan }, { by, byName });
      Alert.alert('保存しました', '車両割当てを更新しました。');
      // ローカル state も同期
      setProject(p => ({ ...(p || {}), vehiclePlan }));
    } catch (e) {
      console.error('[save vehicles] error', e);
      const msg = String(e?.message || e);
      if (msg.startsWith('CONFLICT')) {
        Alert.alert('車両の競合', '他のプロジェクトが同じ日・同じ車両を予約しています。\n別の車両を選択してください。');
      } else {
        Alert.alert('保存に失敗しました');
      }
    }
  };

  const handleSaveParticipants = async () => {
    try {
      const { by, byName } = await resolveCurrentUser();
      const plan = {};
      Object.entries(participantSelections || {}).forEach(([dy, set]) => {
        const arr = Array.isArray(set) ? set : Array.from(set || []);
        if (arr.length) plan[dy] = arr;
      });
      await saveProjectParticipantPlan(projectId, plan, datesInRange);
      // projects にもキャッシュ保存（一覧等で使う）
      const union = Array.from(new Set(Object.values(plan).flat()));
      await upsertProject(projectId, { participantPlan: plan, participants: union }, { by, byName });
      Alert.alert('保存しました', '参加従業員の割当てを更新しました。');
      setProject(p => ({ ...(p || {}), participantPlan: plan, participants: union }));
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.startsWith('CONFLICT')) {
        Alert.alert('参加者の競合', '他のプロジェクトが同じ日に同じ従業員を割当済みです。\n別の従業員を選択してください。');
      } else {
        Alert.alert('保存に失敗しました');
      }
    }
  }; 

  // 追加：右上メニュー（編集・コピー・削除）
  const openActionMenu = useCallback(() => {
    const onEdit = () => {
      // 編集：登録フォームに既存値を事前入力して遷移
      const src = project || {};
      navigation.navigate('Profile', {
        screen: 'ProjectRegister',
        params: {
          mode: 'edit',
          projectId: src?.id,
          userEmail: userEmail ?? null,
          initialValues: {
            name: src.name ?? null,
            clientName: src.clientName ?? null,
            startDate: toDateMaybe(src.startDate),
            endDate: toDateMaybe(src.endDate),
            sales: src.sales ?? null,
            survey: src.survey ?? null,
            design: src.design ?? null,
            management: src.management ?? null,
            participants: Array.isArray(src.participants) ? [...src.participants] : [],
            orderAmount: src.orderAmount ?? null,
            travelCost: src.travelCost ?? null,
            miscExpense: src.miscExpense ?? null,
            areaSqm: src.areaSqm ?? null,
            projectType: src.projectType ?? null,
            invoiceAmount: src.invoiceAmount ?? null,
            invoiceStatus: src.invoiceStatus ?? null,
            isMilestoneBilling: src.isMilestoneBilling ?? null,
            status: src.status ?? null,
          },
        },
      });
    };

    const onCopy = () => {
      // コピー：登録画面の左フォームを事前入力して遷移（ここでは作成しない）
      const src = project || {};
      navigation.navigate('Profile', {
        screen: 'ProjectRegister',
        params: {
          mode: 'copy',
          userEmail: userEmail ?? null,
          initialValues: {
            name: src.name ?? null,
            clientName: src.clientName ?? null,
            startDate: toDateMaybe(src.startDate),
            endDate: toDateMaybe(src.endDate),
            sales: src.sales ?? null,
            survey: src.survey ?? null,
            design: src.design ?? null,
            management: src.management ?? null,
            participants: Array.isArray(src.participants) ? [...src.participants] : [],
            orderAmount: src.orderAmount ?? null,
            travelCost: src.travelCost ?? null,
            miscExpense: src.miscExpense ?? null,
            areaSqm: src.areaSqm ?? null,
            projectType: src.projectType ?? null,
            invoiceAmount: src.invoiceAmount ?? null,
            invoiceStatus: src.invoiceStatus ?? null,
            isMilestoneBilling: src.isMilestoneBilling ?? null,
            status: src.status ?? null,
          },
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
  }, [navigation, project, userEmail, resolveCurrentUser]);

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
        <Text style={tw`text-xl font-bold`}>プロジェクト詳細</Text>
        <Text>営業担当: {employees.find(e => e.id === project?.sales)?.name || '—'}</Text>
        <Text>現場調査担当: {employees.find(e => e.id === project?.survey)?.name || '—'}</Text>
        <Text>設計担当: {employees.find(e => e.id === project?.design)?.name || '—'}</Text>
        <Text>管理担当: {employees.find(e => e.id === project?.management)?.name || '—'}</Text>
        <Text>
          参加従業員（{participantNames.length}名）:
          {participantNames.length ? ` ${participantNames.join('、')}` : ' —'}
        </Text>

        {/* ===== 車両（参加従業員の下） ===== */}
        {/* 参加従業員（各日） */}
        <View style={tw`mt-5`}>
          <Text style={tw`text-lg font-bold`}>参加従業員</Text>
          {datesInRange.length === 0 ? (
            <Text style={tw`mt-2`}>開始日・終了日の設定が必要です。</Text>
          ) : (
            datesInRange.map((d) => {
              const y = toYmd(d);
              const blocked = unavailableEmpMap[y] || new Set();
              const cur = participantSelections[y] || new Set();
              const onToggle = (empId) => {
                if (empAvailLoading) return;
                if (blocked.has(empId)) {
                  Alert.alert('選択不可', 'この日は他プロジェクトで割当済みの従業員です');
                  return;
                }
                setParticipantSelections(prev => {
                  const s = new Set(Array.from(prev[y] || []));
                  if (s.has(empId)) s.delete(empId); else s.add(empId);
                  return { ...prev, [y]: s };
                });
              };
              return (
                <View key={y} style={tw`mt-3 p-3 border rounded`}>
                  <Text style={tw`font-bold mb-2`}>{d.toLocaleDateString()}</Text>
                  <View style={tw`flex-row flex-wrap -mx-1`}>
                    {employees.map(emp => {
                      const isSel = cur.has?.(emp.id) || cur.includes?.(emp.id);
                      const isBlocked = blocked.has(emp.id);
                      return (
                        <TouchableOpacity
                          key={emp.id}
                          disabled={isBlocked || empAvailLoading}
                          onPress={() => onToggle(emp.id)}
                          activeOpacity={0.7}
                          style={tw.style(
                            'm-1 px-3 py-2 rounded border',
                            isBlocked
                              ? 'bg-gray-200 border-gray-300 opacity-50'
                              : (empAvailLoading
                                  ? 'bg-gray-100 border-gray-300 opacity-60'
                                  : (isSel ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'))
                          )}
                        >
                          <Text>{(isSel ? '☑ ' : '☐ ') + (emp.name || '—')}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })
          )}
          <View style={tw`mt-3`}>
            <TouchableOpacity
              onPress={handleSaveParticipants}
              disabled={empAvailLoading}
              activeOpacity={0.7}
              style={tw.style('rounded p-3 items-center', empAvailLoading ? 'bg-blue-300' : 'bg-blue-600')}
            >
              <Text style={tw`text-white font-bold`}>
                {empAvailLoading ? '判定中…' : '参加従業員を保存'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ===== 車両 ===== */}
        <View style={tw`mt-6`}>
          <Text style={tw`text-lg font-bold`}>車両</Text>
          {datesInRange.length === 0 ? (
            <Text style={tw`mt-2`}>開始日・終了日の設定が必要です。</Text>
          ) : (
            datesInRange.map((d) => {
              const ymd = toYmd(d);
              const unavailable = unavailableMap[ymd] || new Set();
              const sel = vehicleSelections[ymd] || {};
              const salesList = vehicles.filter(v => (v?.vehicleType || 'sales') === 'sales');
              const cargoList = vehicles.filter(v => (v?.vehicleType || 'sales') === 'cargo');
              const RenderGroup = ({ title, type, list }) => (
                <View style={tw`mb-3`}>
                 <Text style={tw`mb-1`}>{title}{availLoading ? '（判定中…）' : ''}</Text>
                  {list.length === 0 ? (
                    <Text style={tw`text-gray-500`}>該当車両なし</Text>
                  ) : (
                    <View style={tw`flex-row flex-wrap -mx-1`}>
                      {list.map(v => {
                        const isBlocked = unavailable.has(v.id);
                        const isSelected = sel[type] === v.id;
                        return (
                          <TouchableOpacity
                            key={v.id}
                            disabled={isBlocked || availLoading}
                            onPress={() => onPickVehicle(ymd, type, isSelected ? undefined : v.id)}
                            activeOpacity={0.7}
                            style={tw.style(
                              'm-1 px-3 py-2 rounded border',
                              isBlocked
                                ? 'bg-gray-200 border-gray-300 opacity-50'
                                : (availLoading
                                    ? 'bg-gray-100 border-gray-300 opacity-60'
                                    : (isSelected
                                    ? 'bg-blue-100 border-blue-400'
                                    : 'bg-white border-gray-300'
                                  ))
                            )}
                          >
                            <Text>{isSelected ? '☑ ' : '☐ '}{v.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
              return (
                <View key={ymd} style={tw`mt-3 p-3 border rounded`}>
                  <Text style={tw`font-bold mb-2`}>{d.toLocaleDateString()}</Text>
                  <RenderGroup title="営業車枠" type="sales" list={salesList} />
                  <RenderGroup title="積載車枠" type="cargo" list={cargoList} />
                </View>
              );
            })
          )}
          <View style={tw`mt-3`}>
            <TouchableOpacity
              onPress={handleSaveVehicles}
              disabled={availLoading}
              activeOpacity={0.7}
              style={tw.style('rounded p-3 items-center', availLoading ? 'bg-blue-300' : 'bg-blue-600')}
            >
            <Text style={tw`text-white font-bold`}>
              {availLoading ? '判定中…' : '車両を保存'}
            </Text>
          </TouchableOpacity>
          </View>
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
    </SafeAreaView>
  );
}
