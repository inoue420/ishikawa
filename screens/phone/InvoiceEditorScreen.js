//src/screens/phone/InvoiceEditorScreen.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import tw from 'twrnc';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { fetchProjectById } from '../../firestoreService';

const DEFAULT_COMPANY = {
  issuerName: '株式会社石川組',
  issuerPostal: '〒939-1363',
  issuerAddress: '富山県砺波市太郎丸6568-1',
  issuerTel: 'TEL 0763-77-1191',
  issuerFax: 'FAX 0763-77-3185',
  issuerReg: '登録番号：T4230001017140',
  bankLine: 'お振込先：北國銀行　砺波支店　普通　20675　株式会社石川組',
};
const fmt = (n) => (n === '' || n == null || isNaN(Number(n)) ? '' : Number(n).toLocaleString('ja-JP'));

export default function InvoiceEditorScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const projectId = route?.params?.projectId ?? null;

  const [clientName, setClientName] = useState('　御中');
  const [invoiceNo, setInvoiceNo] = useState(() => {
    const d = new Date();
    return `INV-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${d.getHours()}${String(d.getMinutes()).padStart(2,'0')}`;
  });
  const [issueDate, setIssueDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [company, setCompany] = useState(DEFAULT_COMPANY);
  const [taxRate, setTaxRate] = useState('0.10');
  const [title] = useState('請　求　書');
  const [items, setItems] = useState([{ no: 1, name: '工事費 一式', qty: '1', unit: '式', unitPrice: '0', amount: 0 }]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!projectId) return;
      try {
        const p = await fetchProjectById(projectId);
        if (!alive || !p) return;
        const guess = p?.title || p?.name || p?.projectName || '工事費 一式';
        setItems([{ no: 1, name: guess, qty: '1', unit: '式', unitPrice: String(p?.budget ?? '0'), amount: 0 }]);
        setClientName(p?.clientName || p?.customerName || '　御中');
      } catch (e) {
        console.log(e);
        Alert.alert('読み込み失敗', 'プロジェクト情報の取得に失敗しました。手入力で続行できます。');
      }
    })();
    return () => { alive = false; };
  }, [projectId]);

  const calcItems = useMemo(() => items.map(it => {
    const qty = Number(it.qty || 0);
    const unitPrice = Number(it.unitPrice || 0);
    return { ...it, amount: Math.round(qty * unitPrice) };
  }), [items]);
  const subtotal = useMemo(() => calcItems.reduce((s, it) => s + (it.amount || 0), 0), [calcItems]);
  const tax = useMemo(() => Math.round(subtotal * Number(taxRate || 0)), [subtotal, taxRate]);
  const total = useMemo(() => subtotal + tax, [subtotal, tax]);

  const addRow = useCallback(() => {
    setItems(prev => {
      const nextNo = (prev[prev.length - 1]?.no ?? 0) + 1;
      return [...prev, { no: nextNo, name: '', qty: '', unit: '', unitPrice: '', amount: 0 }];
    });
  }, []);
  const removeRow = useCallback((no) => setItems(prev => prev.filter(x => x.no !== no).map((x, i) => ({ ...x, no: i+1 }))), []);
  const updateItem = useCallback((no, key, val) => setItems(prev => prev.map(x => x.no === no ? { ...x, [key]: val } : x)), []);

  const exportCSV = useCallback(async () => {
    try {
      const header = ['No','内容','数量','単位','単価','金額'];
      const lines = [header.join(',')];
      calcItems.forEach(it => {
        lines.push([
          it.no,
          `"${(it.name || '').replace(/"/g,'""')}"`,
          it.qty || '',
          `"${(it.unit || '').replace(/"/g,'""')}"`,
          it.unitPrice || '',
          it.amount || 0,
        ].join(','));
      });
      lines.push('');
      lines.push(['小計','','','','',subtotal].join(','));
      lines.push([`消費税 @ ${Math.round(Number(taxRate)*10000)/100}%`,'','','','',tax].join(','));
      lines.push(['合計','','','','',total].join(','));
      const csv = '\uFEFF' + lines.join('\r\n');
      const uri = FileSystem.documentDirectory + `${invoiceNo || 'invoice'}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { dialogTitle: '請求書CSVを共有', mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
      } else {
        Alert.alert('CSVを保存しました', uri);
      }
    } catch (e) {
      console.log(e);
      Alert.alert('エクスポート失敗', 'CSVの作成に失敗しました。');
    }
  }, [calcItems, subtotal, tax, total, taxRate, invoiceNo]);

  return (
    <ScrollView style={tw`flex-1 bg-white`} contentContainerStyle={tw`p-4`}>
      <View style={tw`mb-4`}>
        <Text style={tw`text-2xl font-bold`}>請　求　書</Text>
      </View>
      <View style={tw`mb-3`}>
        <Text style={tw`mb-1`}>宛先</Text>
        <TextInput style={tw`border rounded px-3 py-2`} value={clientName} onChangeText={setClientName} placeholder="○○株式会社 御中" />
      </View>
      <View style={tw`flex-row gap-3 mb-4`}>
        <View style={tw`flex-1`}>
          <Text style={tw`mb-1`}>発行日</Text>
          <TextInput style={tw`border rounded px-3 py-2`} value={issueDate} onChangeText={setIssueDate} placeholder="YYYY-MM-DD" />
        </View>
        <View style={tw`flex-1`}>
          <Text style={tw`mb-1`}>請求書番号</Text>
          <TextInput style={tw`border rounded px-3 py-2`} value={invoiceNo} onChangeText={setInvoiceNo} placeholder="INV-YYYYMMDD-XX" />
        </View>
      </View>

      <View style={tw`mb-5 border rounded p-3 bg-gray-50`}>
        <Text style={tw`font-bold mb-1`}>{company.issuerName}</Text>
        <TextInput style={tw`border rounded px-2 py-1 mb-1`} value={company.issuerPostal} onChangeText={v=>setCompany(s=>({...s,issuerPostal:v}))} />
        <TextInput style={tw`border rounded px-2 py-1 mb-1`} value={company.issuerAddress} onChangeText={v=>setCompany(s=>({...s,issuerAddress:v}))} />
        <TextInput style={tw`border rounded px-2 py-1 mb-1`} value={company.issuerTel} onChangeText={v=>setCompany(s=>({...s,issuerTel:v}))} />
        <TextInput style={tw`border rounded px-2 py-1 mb-1`} value={company.issuerFax} onChangeText={v=>setCompany(s=>({...s,issuerFax:v}))} />
        <TextInput style={tw`border rounded px-2 py-1 mb-1`} value={company.issuerReg} onChangeText={v=>setCompany(s=>({...s,issuerReg:v}))} />
        <TextInput style={tw`border rounded px-2 py-1`} value={company.bankLine} onChangeText={v=>setCompany(s=>({...s,bankLine:v}))} />
      </View>

      <View style={tw`mb-2`}>
        <Text style={tw`font-bold mb-1`}>明細</Text>
        <View style={tw`flex-row bg-gray-100 p-2 rounded`}>
          <Text style={tw`w-10`}>No</Text>
          <Text style={tw`flex-1`}>内容</Text>
          <Text style={tw`w-16 text-right`}>数量</Text>
          <Text style={tw`w-12 text-center`}>単位</Text>
          <Text style={tw`w-20 text-right`}>単価</Text>
          <Text style={tw`w-24 text-right`}>金額</Text>
        </View>
      </View>

      {calcItems.map(it => (
        <View key={it.no} style={tw`flex-row items-center p-2 border-b`}>
          <Text style={tw`w-10`}>{it.no}</Text>
          <TextInput style={tw`flex-1 border rounded px-2 py-1 mr-2`} value={it.name} onChangeText={v=>updateItem(it.no,'name',v)} placeholder="内容" />
          <TextInput style={tw`w-16 border rounded px-2 py-1 mr-2 text-right`} value={String(it.qty ?? '')} onChangeText={v=>updateItem(it.no,'qty',v.replace(/[^0-9.]/g,''))} keyboardType="decimal-pad" placeholder="0" />
          <TextInput style={tw`w-12 border rounded px-2 py-1 mr-2 text-center`} value={it.unit ?? ''} onChangeText={v=>updateItem(it.no,'unit',v)} placeholder="式" />
          <TextInput style={tw`w-20 border rounded px-2 py-1 mr-2 text-right`} value={String(it.unitPrice ?? '')} onChangeText={v=>updateItem(it.no,'unitPrice',v.replace(/[^0-9.]/g,''))} keyboardType="decimal-pad" placeholder="0" />
          <Text style={tw`w-24 text-right`}>{fmt(it.amount)}</Text>
          <TouchableOpacity onPress={()=>removeRow(it.no)} style={tw`ml-2 px-2 py-1 border rounded`}>
            <Text>削除</Text>
          </TouchableOpacity>
        </View>
      ))}

      <View style={tw`mt-3`}>
        <TouchableOpacity onPress={addRow} style={tw`self-start border rounded px-3 py-2`}>
          <Text>＋ 行を追加</Text>
        </TouchableOpacity>
      </View>

      <View style={tw`mt-6 items-end gap-1`}>
        <Text>小計：{fmt(subtotal)} 円</Text>
        <View style={tw`flex-row items-center`}>
          <Text>税率</Text>
          <TextInput style={tw`border rounded px-2 py-1 mx-2 w-16 text-right`} value={taxRate} onChangeText={setTaxRate} keyboardType="decimal-pad" />
          <Text>消費税：{fmt(tax)} 円</Text>
        </View>
        <Text style={tw`text-xl font-bold`}>合計：{fmt(total)} 円</Text>
      </View>

      <View style={tw`mt-6 flex-row gap-3`}>
        <TouchableOpacity onPress={exportCSV} style={tw`border rounded px-4 py-3`}>
          <Text>CSVエクスポート</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={()=>navigation.goBack()} style={tw`border rounded px-4 py-3`}>
          <Text>戻る</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
