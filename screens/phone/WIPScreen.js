import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Button,
  ActivityIndicator, FlatList, TouchableOpacity
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
} from '../../firestoreService';

export default function WIPScreen() {
  const [loading, setLoading]   = useState(true);
  const [projects, setProjects] = useState([]);
  const [billingsMap, setBillingsMap] = useState({});
  const [inputs, setInputs]     = useState({});
  const [billingInputsMap, setBillingInputsMap] = useState({});

  // ── ① 画面立ち上げ時に WIP 一覧を取得
  useEffect(() => {
    (async () => {
      setLoading(true);
      const all = await fetchProjects();
      const wip = [];
      for (const p of all) {
        wip.push(p);
        if (p.isMilestoneBilling) {
          const bs = await fetchBillings(p.id);
          // マイルストーン請求のデータを初期化
          setBillingsMap(m => ({ ...m, [p.id]: bs }));
          setBillingInputsMap(prev => ({
            ...prev,
            [p.id]: bs.reduce((acc, b) => ({
              ...acc,
              [b.id]: b.amount?.toString() || ''
            }), {})
          }));
        }
      }
      wip.sort((a, b) => a.endDate.toDate() - b.endDate.toDate());
      setProjects(wip);
      setLoading(false);
    })();
  }, []);

  const pToDate = ts => ts.toDate ? ts.toDate() : new Date(ts);

  // ── ② 通常請求：請求書発行
  const onInvoice = async projId => {
    try {
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
     if (bill.status === 'pending') {
       // 入力中の金額を取得
       const amt = Number(billingInputsMap[projId]?.[bill.id] || 0);
       // 金額保存
       await updateBillingAmount(projId, bill.id, amt);
       // ステータスを発行へ
       await updateBillingStatus(projId, bill.id, 'issued');
     } else {
       // 入金へ
       await updateBillingStatus(projId, bill.id, 'paid');
     }
      const next = bill.status === 'pending' ? 'issued' : 'paid';
      await updateBillingStatus(projId, bill.id, next);
      setBillingsMap(m => {
        const updated = m[projId].map(b =>
          b.id === bill.id ? { ...b, status: next } : b
        );
        return { ...m, [projId]: updated };
      });
      // 全て paid なら一覧から除外
      const remaining = billingsMap[projId].filter(b => b.status !== 'paid' && b.id!==bill.id);
      if (remaining.length === 0) {
        setProjects(ps => ps.filter(p => p.id !== projId));
      }
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

  if (loading) return <ActivityIndicator style={tw`flex-1`} />;
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
    <FlatList
      data={projects}
      keyExtractor={p => p.id}
      contentContainerStyle={tw`p-4 bg-gray-100`}
      renderItem={({ item: p }) => (
        <View style={tw`mb-4 bg-white p-4 rounded-lg shadow`}>
          <Text style={tw`text-lg font-bold mb-1`}>{p.name}</Text>
          <Text>顧客: {p.clientName}</Text>
          <Text>終了予定: {pToDate(p.endDate).toISOString().slice(0,10)}</Text>

          {/* ← 請求方式切替ボタン */}
          <View style={tw`mt-2 mb-4`}>
            <Button
              title={p.isMilestoneBilling ? '通常請求に切替' : '出来高請求に切替'}
              onPress={() => onToggleBilling(p.id, p.isMilestoneBilling)}
            />
          </View>

          {!p.isMilestoneBilling ? (
            <>
              <TextInput
                style={tw`border p-2 my-2`}
                placeholder="請求金額を入力"
                keyboardType="numeric"
                value={inputs[p.id]?.toString() || ''}
                onChangeText={v => setInputs(i => ({ ...i, [p.id]: v }))}
              />
              <Button title="請求書発行" onPress={() => onInvoice(p.id)} />
              {p.invoiceStatus === 'issued' && (
                <View style={tw`mt-2`}>
                  <Button title="入金確認" onPress={() => onPaid(p.id)} />
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
                  <Text>状態: {b.status}</Text>
                  {b.status !== 'paid' && (
                    <Button
                      title={b.status === 'pending' ? '請求書発行' : '入金確認'}
                      onPress={() => onBillingAction(p.id, b)}
                    />
                  )}
                  {/* ── 追加：請求エントリ削除ボタン */}
                  <View style={tw`mt-2`}>
                    <Button
                      title="削除"
                      color="#f00"
                      onPress={() => onDeleteBilling(p.id, b.id)}
                    />
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
      )}
    />
  );
}
