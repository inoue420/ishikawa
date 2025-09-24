import React, { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  const navigation = useNavigation();

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
      let next = 'paid';
      let newAmount = null;
      if (bill.status === 'pending') {
        // 入力中の金額を保存して 'issued' へ
        newAmount = Number(billingInputsMap[projId]?.[bill.id] || 0);
        await updateBillingAmount(projId, bill.id, newAmount);
        next = 'issued';
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
            <TouchableOpacity
              onPress={() => onToggleBilling(p.id, p.isMilestoneBilling)}
              style={tw`px-4 py-2 bg-gray-200 rounded self-start`}
            >
              <Text>{p.isMilestoneBilling ? '通常請求に切替' : '出来高請求に切替'}</Text>
            </TouchableOpacity>
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
              {/* 即時発行（従来動作を維持） */}
              <TouchableOpacity
                onPress={() => onInvoice(p.id)}
                style={tw`mt-1 px-4 py-2 bg-indigo-200 rounded self-start`}
              >
                <Text>請求書発行（即時）</Text>
              </TouchableOpacity>
              {/* 新規：エディタへ遷移して編集／CSV等へ */}
              <TouchableOpacity
                style={tw`mt-2 px-4 py-2 bg-emerald-200 rounded self-start`}
                onPress={() => navigation.navigate('InvoiceEditor', { projectId: p.id })}
              >
                <Text>請求書編集へ</Text>
              </TouchableOpacity>
              {p.invoiceStatus === 'issued' && (
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
                  <Text>状態: {b.status}</Text>
                  {b.status !== 'paid' && (
                    <TouchableOpacity
                      onPress={() => onBillingAction(p.id, b)}
                      style={tw`mt-1 px-3 py-2 bg-indigo-200 rounded self-start`}
                    >
                      <Text>{b.status === 'pending' ? '請求書発行' : '入金確認'}</Text>
                    </TouchableOpacity>
                  )}
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
        )}
      />
    </SafeAreaView>
  );
}
