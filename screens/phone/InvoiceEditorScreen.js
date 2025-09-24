//src/screens/phone/InvoiceEditorScreen.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import tw from 'twrnc';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { fetchProjectById } from '../../firestoreService';
import { printToFileAsync } from 'expo-print';

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
const esc = (s='') => String(s)
  .replace(/&/g,'&amp;')
  .replace(/</g,'&lt;')
  .replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;')
  .replace(/'/g,'&#39;');
  
export default function InvoiceEditorScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const projectId = route?.params?.projectId ?? null;
  const stage = route?.params?.stage ?? null;
  const billingAmountParam = route?.params?.billingAmount ?? null;   

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
        // 受注金額(orderAmount) を最優先で単価に使用
        const projectAmount = p?.orderAmount ?? p?.invoiceAmount ?? p?.amount ?? p?.budget ?? 0;
        // 出来高請求で来た場合は billingAmount を優先
        const seedAmount = (billingAmountParam != null) ? billingAmountParam : projectAmount;
        const seedName   = stage ? `出来高 ${stage}` : guess;
        setItems([{ no: 1, name: seedName, qty: '1', unit: '式', unitPrice: String(seedAmount), amount: 0 }]);
        setClientName(p?.clientName || p?.customerName || '　御中');
      } catch (e) {
        console.log(e);
        Alert.alert('読み込み失敗', 'プロジェクト情報の取得に失敗しました。手入力で続行できます。');
      }
    })();
    return () => { alive = false; };
  }, [projectId, stage, billingAmountParam]);

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

  const exportPDF = useCallback(async () => {
    try {
      // 超簡易テンプレ（後で請求書テンプレに差し替え）
      const rows = calcItems.map(it => {
        const qty = it.qty || '';
        const unit = it.unit || '';
        const unitPrice = fmt(it.unitPrice || 0);
        const amount = fmt(it.amount || 0);
        return `
        <tr>
          <td style="text-align:center">${it.no}</td>
          <td>${esc(it.name||'')}</td>
          <td style="text-align:right">${qty}</td>
          <td style="text-align:center">${esc(unit)}</td>
          <td style="text-align:right">${unitPrice}</td>
          <td style="text-align:right">${amount}</td>
        </tr>`;
      }).join('');
      const subtotalStr = fmt(subtotal);
      const taxStr = fmt(tax);
      const totalStr = fmt(total)
      const html = `
      <html><head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 16mm; }
          body { font-family: -apple-system, "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP", sans-serif; font-size:12px; }
          h1 { font-size:20px; text-align:center; margin: 0 0 12px; }
          table { width:100%; border-collapse: collapse; }
          th, td { border:1px solid #999; padding:6px; }
          th { background:#f2f2f2; }
          .right { text-align:right; }
        </style>
      </head><body>
        <h1>請　求　書</h1>
        <div>宛先：${esc(clientName)}</div>
        <div>発行日：${issueDate}　請求書番号：${esc(invoiceNo)}</div>
        <hr/>
        <table>
          <thead>
            <tr><th>No</th><th>内容</th><th>数量</th><th>単位</th><th>単価</th><th>金額</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="right" style="margin-top:12px">
          小計：${subtotalStr}　消費税：${taxStr}　
          <strong>合計：${totalStr}</strong>
        </div>
        <div style="margin-top:16px">
          <div>${esc(company.issuerName)}</div>
          <div>${esc(company.issuerPostal)}　${esc(company.issuerAddress)}</div>
          <div>${esc(company.issuerTel)}　${esc(company.issuerFax)}</div>
          <div>${esc(company.issuerReg)}</div>
          <div>${esc(company.bankLine)}</div>
        </div>
      </body></html>`;
      const file = await printToFileAsync({ html });
      // ファイル名を請求書番号に
      const pdfName = `${(invoiceNo || 'invoice')}.pdf`;
      const targetUri = FileSystem.documentDirectory + pdfName;
      try {
        await FileSystem.moveAsync({ from: file.uri, to: targetUri });
        await Sharing.shareAsync(targetUri);
      } catch {
        // 失敗時は元のURIで共有
        await Sharing.shareAsync(file.uri);
      }
    } catch (e) {
      Alert.alert('PDF出力失敗', 'PDFの作成に失敗しました。');
    }
  }, [calcItems, clientName, issueDate, invoiceNo, subtotal, tax, total, company]);
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

      {/* 明細テーブル（横スクロール対応） */}
      <View style={tw`mb-2`}>
        <Text style={tw`font-bold mb-1`}>明細</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator style={tw`-mx-4`} contentContainerStyle={tw`px-4`}>
        <View style={{ minWidth: 760 }}>
          {/* ヘッダ行 */}
          <View style={tw`flex-row bg-gray-100 p-2 rounded`}>
            <Text style={tw`w-12`}>No</Text>
            <Text style={tw`w-80`}>内容</Text>{/* 320px 相当：長文対応 */}
            <Text style={tw`w-20 text-right`}>数量</Text>
            <Text style={tw`w-16 text-center`}>単位</Text>
            <Text style={tw`w-28 text-right`}>単価</Text>
            <Text style={tw`w-32 text-right`}>金額</Text>
            <Text style={tw`w-16 text-center`}>操作</Text>
          </View>

          {/* データ行 */}
          {calcItems.map(it => (
            <View key={it.no} style={tw`flex-row items-center p-2 border-b`}>
              <Text style={tw`w-12`}>{it.no}</Text>
              <TextInput
                style={[tw`w-80 border rounded px-2 py-1 mr-2`, { minHeight: 40, textAlignVertical: 'top' }]}
                value={it.name}
                onChangeText={v=>updateItem(it.no,'name',v)}
                placeholder="内容"
                multiline
              />
              <TextInput
                style={tw`w-20 border rounded px-2 py-1 mr-2 text-right`}
                value={String(it.qty ?? '')}
                onChangeText={v=>updateItem(it.no,'qty',v.replace(/[^0-9.]/g,''))}
                keyboardType="decimal-pad"
                placeholder="0"
              />
              <TextInput
                style={tw`w-16 border rounded px-2 py-1 mr-2 text-center`}
                value={it.unit ?? ''}
                onChangeText={v=>updateItem(it.no,'unit',v)}
                placeholder="式"
              />
              <TextInput
                style={tw`w-28 border rounded px-2 py-1 mr-2 text-right`}
                value={String(it.unitPrice ?? '')}
                onChangeText={v=>updateItem(it.no,'unitPrice',v.replace(/[^0-9.]/g,''))}
                keyboardType="decimal-pad"
                placeholder="0"
              />
              <Text style={tw`w-32 text-right`}>{fmt(it.amount)}</Text>
              <View style={tw`w-16 items-center`}>
                <TouchableOpacity onPress={()=>removeRow(it.no)} style={tw`px-2 py-1 border rounded`}>
                  <Text>削除</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

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
        <TouchableOpacity onPress={exportPDF} style={tw`border rounded px-4 py-3`}>
          <Text>PDFエクスポート</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={()=>navigation.goBack()} style={tw`border rounded px-4 py-3`}>
          <Text>戻る</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
