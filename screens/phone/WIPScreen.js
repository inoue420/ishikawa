import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TextInput,
  ActivityIndicator, FlatList, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import tw from 'twrnc';
import {
  fetchProjects,
  updateProjectInvoice,
  updateProjectBillingType,
  fetchBillings,
  addBillingEntry,
  updateBillingStatus,
  updateBillingAmount,
  deleteBillingEntry, 
  fetchClients,
} from '../../firestoreService';

import { submitInvoiceApprovalRequest } from '../../billingApprovalService';

const statusLabel = (s) =>
  ({
    pending: '未請求',
    approval_pending: '承認待ち',
    returned: '差戻し',
    billable: '請求可能',
    issued: '請求中',
    paid: '入金済',
  }[s] || s || '未請求');

export default function WIPScreen() {
  const [loading, setLoading]   = useState(true);
  const [projects, setProjects] = useState([]);
  const [billingsMap, setBillingsMap] = useState({});
  const [inputs, setInputs]     = useState({});
  const [billingInputsMap, setBillingInputsMap] = useState({});
  const [clients, setClients] = useState([]);
  const [clientQuery, setClientQuery] = useState('');
  const [closeFilter, setCloseFilter] = useState('all'); // 'all' | 'day' | 'eom'  
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();
  const route = useRoute();
  const userEmail = String(route?.params?.userEmail || '').trim().toLowerCase();
  const userLoginId = String(route?.params?.loginId || route?.params?.userLoginId || '').trim().toLowerCase();

  // ── ① WIP 一覧を取得（初期表示 / Pull-to-refresh で共通）
  const loadWip = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true);
    try {
      try {
        const cs = await fetchClients();
        setClients(cs);
      } catch (e) {
        console.warn(e);
        setClients([]);
      }
      const all = await fetchProjects();
      const wip = [];
      const initialInputs = {};
      const milestoneProjects = [];
      for (const p of all) {
        wip.push(p);
        // デフォルト請求金額（projectsコレクション内の値）を初期入力へ
        const defAmt = p?.invoiceAmount ?? p?.amount ?? p?.budget ?? '';
        if (defAmt !== '') initialInputs[p.id] = String(defAmt);
        if (p.isMilestoneBilling) milestoneProjects.push(p);
      }

      const nextBillingsMap = {};
      const nextBillingInputsMap = {};
      await Promise.all(
        milestoneProjects.map(async (proj) => {
          try {
            const bs = await fetchBillings(proj.id);
            nextBillingsMap[proj.id] = bs;
            nextBillingInputsMap[proj.id] = bs.reduce((acc, b) => {
              acc[b.id] = b.amount?.toString() || '';
              return acc;
            }, {});
          } catch (e) {
            console.warn(e);
            nextBillingsMap[proj.id] = [];
            nextBillingInputsMap[proj.id] = {};
          }
        })
      );

      wip.sort((a, b) => {
        const ad = a?.endDate?.toDate ? a.endDate.toDate() : new Date(0);
        const bd = b?.endDate?.toDate ? b.endDate.toDate() : new Date(0);
        return ad - bd;
      });

      setProjects(wip);
      setInputs(initialInputs);
      setBillingsMap(nextBillingsMap);
      setBillingInputsMap(nextBillingInputsMap);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWip();
  }, [loadWip]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadWip({ showLoading: false });
    } finally {
      setRefreshing(false);
    }
  }, [loadWip]);

  const pToDate = (v) => {
    if (!v) return null;
    if (v?.toDate) return v.toDate();
    if (typeof v === 'string') {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    const d = new Date(v);
    return isNaN(d) ? null : d;
  };

  const formatYmdLocal = (d) => {
    if (!d) return '—';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const formatCloseLabel = (c) => {
    if (!c) return '';
    if (c.closeType === 'eom') return '末締め';
    const d = Number(c.closeDay);
    if (Number.isFinite(d) && d >= 1 && d <= 31) return `毎月${d}日`;
    return '未設定';
  };

  const clientsById = useMemo(
    () => Object.fromEntries((clients || []).map(c => [c.id, c])),
    [clients]
  );

  const findClientForProject = (p) => {
    if (!p) return null;
    if (p.clientId && clientsById[p.clientId]) return clientsById[p.clientId];
    const lower = String(p.clientName || '').trim().toLowerCase();
    if (!lower) return null;
    return (clients || []).find(c => String(c.nameLower || c.name || '').toLowerCase() === lower) || null;
  };

  const filteredProjects = useMemo(() => {
    const q = String(clientQuery || '').trim().toLowerCase();
    return (projects || []).filter(p => {
      const c = findClientForProject(p);
      const nameHit =
        !q ||
        String(p.clientName || '').toLowerCase().includes(q) ||
        String(c?.name || '').toLowerCase().includes(q);
      if (!nameHit) return false;
      if (closeFilter === 'all') return true;
      if (!c) return false;
      return c.closeType === closeFilter;
    });
  }, [projects, clients, clientsById, clientQuery, closeFilter]);

  // ── 請求書エディタ：顧客テンプレに応じて遷移先を決める
  const resolveInvoiceScreenName = (p) => {
    const c = findClientForProject(p);
    const templateId = String(c?.invoiceTemplateId || '').trim();

    // 推奨：clients.invoiceTemplateId で分岐
    if (templateId === 'shimizu') return 'InvoiceEditorShimizu';

    // フォールバック：名前に「清水建設」を含む場合（暫定）
    const name = String(c?.name || p?.clientName || '').replace(/\s/g, '');
    if (name.includes('清水建設')) return 'InvoiceEditorShimizu';

    return 'InvoiceEditor';
  };

  const resolveTemplateId = (p) => {
    const screen = resolveInvoiceScreenName(p);
    return screen === 'InvoiceEditorShimizu' ? 'shimizu' : 'standard';
  };

  const toNumberSafe = (v) => {
    if (v == null) return null;
    const n = Number(String(v).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  };

  const getBaseAmountForProject = (p) => {
    // 画面で入力した金額があれば優先、無ければプロジェクト情報
    const typed = toNumberSafe(inputs[p.id]);
    if (typed != null) return typed;
    return (
      toNumberSafe(p?.orderAmount) ??
      toNumberSafe(p?.invoiceAmount) ??
      toNumberSafe(p?.amount) ??
      toNumberSafe(p?.budget) ??
      0
    );
  };

  const openInvoiceEditor = (p, opts = {}) => {
    const screen = resolveInvoiceScreenName(p);
    const baseAmount = getBaseAmountForProject(p);
    const billingAmount =
      (opts.billingAmount != null ? toNumberSafe(opts.billingAmount) : null) ??
      baseAmount;

    navigation.navigate(screen, {
      projectId: p.id,
      // InvoiceEditorScreen が参照するキー
      stage: opts.stage ?? null,
      billingAmount,
      // 互換用（あなたの既存実装/他画面が参照していても壊れないように）
      billingId: opts.billingId ?? null,
      amount: billingAmount,
      itemName: opts.itemName ?? (p.title || p.name || p.projectName || '工事費 一式'),
    });
  };

  // ── 承認依頼（通常）
  const requestApprovalProject = async (p) => {
    try {
      const st = p?.invoiceStatus || 'pending';
      if (!['pending', 'returned'].includes(st)) {
        alert(`この状態では申請できません（現在: ${statusLabel(st)}）`);
        return;
      }
      const amountExTax = getBaseAmountForProject(p);
      if (!amountExTax) return alert('金額を入力してください');
      if (!userEmail && !userLoginId) return alert('申請者情報が取得できません（userEmail/loginId）');

      await submitInvoiceApprovalRequest({
        projectId: p.id,
        templateId: resolveTemplateId(p),
        amountExTax,
        totalWithTax: Math.round(amountExTax * 1.1),
        projectName: p.name ?? null,
        clientName: p.clientName ?? null,
        requesterEmail: userEmail || null,
        requesterLoginId: userLoginId || null,
      });
      await loadWip({ showLoading: false });
      alert('承認依頼を送信しました');
    } catch (e) {
      console.error(e);
      alert(e?.message || '承認依頼に失敗しました');
    }
  };

  // ── 承認依頼（出来高）
  const requestApprovalBilling = async (p, b) => {
    try {
      const st = b?.status || 'pending';
      if (!['pending', 'returned'].includes(st)) {
        alert(`この状態では申請できません（現在: ${statusLabel(st)}）`);
        return;
      }
      const typed = toNumberSafe(billingInputsMap[p.id]?.[b.id]);
      const amountExTax = typed != null ? typed : toNumberSafe(b.amount) ?? 0;
      if (!amountExTax) return alert('金額を入力してください');
      if (!userEmail && !userLoginId) return alert('申請者情報が取得できません（userEmail/loginId）');

      await submitInvoiceApprovalRequest({
        projectId: p.id,
        billingId: b.id,
        stage: b.stage ?? null,
        templateId: resolveTemplateId(p),
        amountExTax,
        totalWithTax: Math.round(amountExTax * 1.1),
        projectName: p.name ?? null,
        clientName: p.clientName ?? null,
        requesterEmail: userEmail || null,
        requesterLoginId: userLoginId || null,
      });
      await loadWip({ showLoading: false });
      alert('承認依頼を送信しました');
    } catch (e) {
      console.error(e);
      alert(e?.message || '承認依頼に失敗しました');
    }
  };
  
  // ── ② 通常請求：請求書発行
  const onInvoice = async projId => {
    try {
      const p = projects.find(x => x.id === projId);
      const st = p?.invoiceStatus || 'pending';
      if (st !== 'billable') {
        alert(`承認後のみ発行できます（現在: ${statusLabel(st)}）`);
        return;
      }
      const amt = Number(inputs[projId] || 0);
      if (!amt) return alert('金額を入力してください');
      await updateProjectInvoice(projId, { amount: amt, newStatus: 'issued' });
      setProjects(ps =>
        ps.map(p =>
          p.id === projId
            ? { ...p, invoiceAmount: amt, invoiceStatus: 'issued' }
            : p
        )
      );
    } catch (e) {
      console.error(e);
      alert('請求処理に失敗しました');
    }
  };

  // ── ③ 通常請求：入金確認
  const onPaid = async projId => {
    try {
      const p = projects.find(x => x.id === projId);
      const st = p?.invoiceStatus || 'pending';
      if (st !== 'issued') {
        alert(`請求中のみ入金にできます（現在: ${statusLabel(st)}）`);
        return;
      }
      const amt = Number(inputs[projId] || 0);
      await updateProjectInvoice(projId, { amount: amt, newStatus: 'paid' });
      setProjects(ps => ps.filter(p => p.id !== projId));
    } catch (e) {
      console.error(e);
      alert('入金処理に失敗しました');
    }
  };

  // ── ④ 請求方式切替
 const onToggleBilling = async (projId, currentType) => {
   try {
     // Firestore 上のフラグ切替
     await updateProjectBillingType(projId, !currentType);

     // UI 側ステートも切替
     setProjects(ps =>
       ps.map(p =>
         p.id === projId
           ? { ...p, isMilestoneBilling: !currentType }
           : p
       )
     );

     // 「通常 → 出来高」に切り替えた直後は
     // 必ずマイルストーン1件目を含む請求エントリを取得し、
     // billingsMap と billingInputsMap を初期化する
     if (!currentType) {
       const bs = await fetchBillings(projId);
       // エントリ一覧を WIP に表示
       setBillingsMap(m => ({ ...m, [projId]: bs }));
       // 入力用マップにも空文字 or 既存 amount をセット
       setBillingInputsMap(prev => ({
         ...prev,
         [projId]: bs.reduce((acc, b) => ({
           ...acc,
           [b.id]: prev[projId]?.[b.id] ?? b.amount?.toString() ?? ''
         }), {})
       }));
     }
   } catch (e) {
     console.error(e);
     alert('切替に失敗しました');
   }
 };

  // ── ⑤ マイル請求：請求／入金
  const onBillingAction = async (projId, bill) => {
    try {
      // billable → issued, issued → paid のみ許可（pending/returned は承認依頼へ）
      let next = null;
      let newAmount = null;
      if (bill.status === 'billable') {
        newAmount = Number(billingInputsMap[projId]?.[bill.id] || 0);
        if (!newAmount) return alert('金額を入力してください');
        await updateBillingAmount(projId, bill.id, newAmount);
        next = 'issued';
      } else if (bill.status === 'issued') {
        next = 'paid';
      } else {
        return alert(`この状態では実行できません（現在: ${statusLabel(bill.status)}）`);
      }
      await updateBillingStatus(projId, bill.id, next);
      setBillingsMap((m) => {
        const list = m[projId] || [];
        const updated = list.map((b) =>
          b.id === bill.id ? { ...b, status: next, ...(newAmount!=null ? { amount: newAmount } : {}) } : b
        );
        // 全て paid なら WIP から除外
        const allPaid = updated.every((b) => b.status === 'paid');
        if (allPaid) setProjects((ps) => ps.filter((p) => p.id !== projId));
        return { ...m, [projId]: updated };
      });
    } catch (e) {
      console.error(e);
      alert('マイルストーン処理に失敗しました');
    }
  };

  // ── ⑥ マイル請求：追加
  const onAddMilestone = async projId => {
    try {
      const nextStage = (billingsMap[projId]?.length || 0) + 1;
      await addBillingEntry(projId, { stage: nextStage, amount: 0 });
      const bs = await fetchBillings(projId);
    setBillingsMap(m => ({ ...m, [projId]: bs }));

    // ── ここで入力用マップも再生成
    setBillingInputsMap(prev => ({
      ...prev,
      [projId]: bs.reduce((acc, b) => ({
        ...acc,
        // 既存の入力値があれば優先、なければ Firestore 上の amount を文字列化
        [b.id]: prev[projId]?.[b.id] ?? b.amount?.toString() ?? ''
      }), {})
    }));
    } catch (e) {
      console.error(e);
      alert('追加に失敗しました');
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={tw`flex-1 justify-center items-center`}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }
  const onDeleteBilling = async (projId, billingId) => {
    try {
      await deleteBillingEntry(projId, billingId);
      // ローカル state からも削除
      setBillingsMap(m => ({
        ...m,
        [projId]: (m[projId] || []).filter(b => b.id !== billingId)
      }));
      setBillingInputsMap(prev => {
        const { [billingId]: _, ...rest } = prev[projId] || {};
        return { ...prev, [projId]: rest };
      });
    } catch (e) {
      console.error(e);
      alert('請求エントリの削除に失敗しました');
    }
  };



  return (
    <SafeAreaView edges={['top']} style={tw`flex-1`}>
      <FlatList
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        data={filteredProjects}
        keyExtractor={p => p.id}
        contentContainerStyle={tw`p-4 bg-gray-100`}
        ListHeaderComponent={
          <View style={tw`mb-4`}>
            <Text style={tw`text-xl font-bold mb-2`}>WIP</Text>
            <TextInput
              style={tw`border p-2 rounded bg-white`}
              placeholder="顧客名で検索"
              value={clientQuery}
              onChangeText={setClientQuery}
            />
            <View style={tw`flex-row mt-2`}>
              <TouchableOpacity onPress={() => setCloseFilter('all')} activeOpacity={0.7}
                style={tw`${closeFilter === 'all' ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'} border rounded px-3 py-2 mr-2`}>
                <Text>{closeFilter === 'all' ? '● ' : '○ '}全て</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCloseFilter('day')} activeOpacity={0.7}
                style={tw`${closeFilter === 'day' ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'} border rounded px-3 py-2 mr-2`}>
                <Text>{closeFilter === 'day' ? '● ' : '○ '}毎月◯日</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCloseFilter('eom')} activeOpacity={0.7}
                style={tw`${closeFilter === 'eom' ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'} border rounded px-3 py-2`}>
                <Text>{closeFilter === 'eom' ? '● ' : '○ '}末締め</Text>
              </TouchableOpacity>
            </View>
            <Text style={tw`text-xs text-gray-600 mt-2`}>
              ※締め日が未登録の顧客は「毎月◯日/末締め」では絞り込めません。
            </Text>
          </View>
        }
        renderItem={({ item: p }) => {
          const c = findClientForProject(p);
          const invStatus = p?.invoiceStatus || 'pending';
          return (
        <View style={tw`mb-4 bg-white p-4 rounded-lg shadow`}>
          <Text style={tw`text-lg font-bold mb-1`}>{p.name}</Text>
          <Text>顧客: {p.clientName}{c ? `（締め日: ${formatCloseLabel(c)}）` : ''}</Text>
          <Text>終了予定: {formatYmdLocal(pToDate(p.endDate))}</Text>

          {/* ← 請求方式切替ボタン */}
          <View style={tw`mt-2 mb-4`}>
            <TouchableOpacity
              onPress={() => onToggleBilling(p.id, p.isMilestoneBilling)}
              style={tw`px-4 py-2 bg-gray-200 rounded self-start`}
            >
              <Text>{p.isMilestoneBilling ? '通常請求に切替' : '出来高請求に切替'}</Text>
            </TouchableOpacity>
          </View>

          {!p.isMilestoneBilling ? (
            <>
              <Text style={tw`mt-2 text-gray-700`}>状態: {statusLabel(invStatus)}</Text>
              {invStatus === 'returned' && !!p.invoiceReturnComment && (
                <Text style={tw`mt-1 text-red-600`}>差戻し: {p.invoiceReturnComment}</Text>
              )}
              <TextInput
                style={tw`border p-2 my-2`}
                placeholder="請求金額を入力"
                keyboardType="numeric"
                value={inputs[p.id]?.toString() || ''}
                onChangeText={v => setInputs(i => ({ ...i, [p.id]: v }))}
              />

              {/* 承認フロー */}
              {(invStatus === 'pending' || invStatus === 'returned') && (
                <TouchableOpacity
                  onPress={() => requestApprovalProject(p)}
                  style={tw`mt-1 px-4 py-2 bg-indigo-200 rounded self-start`}
                >
                  <Text>承認依頼</Text>
                </TouchableOpacity>
              )}
              {invStatus === 'approval_pending' && (
                <View style={tw`mt-1 px-4 py-2 bg-gray-200 rounded self-start`}>
                  <Text>承認待ち</Text>
                </View>
              )}
              {invStatus === 'billable' && (
                <TouchableOpacity
                  onPress={() => onInvoice(p.id)}
                  style={tw`mt-1 px-4 py-2 bg-indigo-200 rounded self-start`}
                >
                  <Text>請求書発行</Text>
                </TouchableOpacity>
              )}
              {/* 新規：エディタへ遷移して編集／CSV等へ */}
              <TouchableOpacity
                style={tw`mt-2 px-4 py-2 bg-emerald-200 rounded self-start`}
                onPress={() => openInvoiceEditor(p)}
               >
                <Text>請求書編集へ</Text>
              </TouchableOpacity>
               {invStatus === 'issued' && (
                <View style={tw`mt-2`}>
                  <TouchableOpacity
                    onPress={() => onPaid(p.id)}
                    style={tw`px-4 py-2 bg-green-200 rounded self-start`}
                  >
                    <Text>入金確認</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <>
              <Text style={tw`mt-2 font-bold`}>マイルストーン請求</Text>
              {(billingsMap[p.id] || []).map(b => (
                <View key={b.id} style={tw`mt-2 p-2 border rounded`}>
                  <Text>出来高 {b.stage}</Text>
                  {/* 金額は常に編集可能な入力欄で表示 */}
                  <TextInput
                    style={tw`border p-2 my-1`}
                    placeholder="金額を入力"
                    keyboardType="numeric"
                    value={billingInputsMap[p.id]?.[b.id] ?? b.amount?.toString() ?? ''}
                    onChangeText={v =>
                      setBillingInputsMap(prev => ({
                        ...prev,
                        [p.id]: { ...prev[p.id], [b.id]: v }
                      }))
                    }
                  />                                
                  <Text>金額: {b.amount}</Text>
                  <Text>状態: {statusLabel(b.status)}</Text>
                  {b.status === 'returned' && !!b.returnComment && (
                    <Text style={tw`mt-1 text-red-600`}>差戻し: {b.returnComment}</Text>
                  )}

                  {(b.status === 'pending' || b.status === 'returned') && (
                    <TouchableOpacity
                      onPress={() => requestApprovalBilling(p, b)}
                      style={tw`mt-1 px-3 py-2 bg-indigo-200 rounded self-start`}
                    >
                      <Text>承認依頼</Text>
                    </TouchableOpacity>
                  )}
                  {b.status === 'approval_pending' && (
                    <View style={tw`mt-1 px-3 py-2 bg-gray-200 rounded self-start`}>
                      <Text>承認待ち</Text>
                    </View>
                  )}
                  {(b.status === 'billable' || b.status === 'issued') && (
                    <TouchableOpacity
                      onPress={() => onBillingAction(p.id, b)}
                      style={tw`mt-1 px-3 py-2 bg-indigo-200 rounded self-start`}
                    >
                      <Text>{b.status === 'billable' ? '請求書発行' : '入金確認'}</Text>
                    </TouchableOpacity>
                  )}
                  {/* 出来高ごとに請求書エディタへ */}
                  <TouchableOpacity
                    onPress={() =>
                      openInvoiceEditor(p, {
                        billingId: b.id,
                        stage: b.stage,
                        billingAmount:
                          toNumberSafe(billingInputsMap[p.id]?.[b.id]) ??
                          toNumberSafe(b.amount) ??
                          getBaseAmountForProject(p),
                        itemName: `${p.title || p.name || '工事'}／出来高 ${b.stage}`,
                      })
                    }
                    style={tw`mt-2 px-3 py-2 bg-emerald-200 rounded self-start`}
                  >
                    <Text>請求書編集へ</Text>
                  </TouchableOpacity> 
                  {/* ── 追加：請求エントリ削除ボタン */}
                  <View style={tw`mt-2`}>
                    <TouchableOpacity
                      onPress={() => onDeleteBilling(p.id, b.id)}
                      style={tw`px-3 py-2 bg-red-200 rounded self-start`}
                    >
                      <Text>削除</Text>
                    </TouchableOpacity>
                  </View>                  
                </View>
              ))}
              <TouchableOpacity
                style={tw`mt-2 px-4 py-2 bg-blue-200 rounded`}
                onPress={() => onAddMilestone(p.id)}
              >
                <Text>次の出来高追加</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
