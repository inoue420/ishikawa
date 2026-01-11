//src/screens/phone/InvoiceEditorScreen.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import tw from 'twrnc';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { fetchProjectById, batchUpdateProjectInvoices, updateBillingStatus, updateBillingAmount } from '../../firestoreService';
import { printToFileAsync } from 'expo-print';
import { Asset } from 'expo-asset';

// ✅ assets はプロジェクト直下。screens/phone からは ../../
const TEAM_LOGO_MOD   = require('../../assets/ikg-team.png');
const SYMBOL_LOGO_MOD = require('../../assets/ishikawa-symbol.png');


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
// 日付を「YYYY年M月D日」に整形（issueDateがYYYY-MM-DDの場合に最適化）
const toJpDate = (s='') => {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
  const d = new Date(s || Date.now());
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
};

// 宛先末尾の「御中/様/殿」を削除して表示用に整形
const normalizeRecipient = (s='') =>
  String(s).replace(/\s*(御中|様|殿)\s*$/,'').trim();
  
export default function InvoiceEditorScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const projectId = route?.params?.projectId ?? null;
  const stage = route?.params?.stage ?? null;
  const billingAmountParam = route?.params?.billingAmount ?? null;   
  // まとめ請求（標準テンプレのみ）
  const initialItemsParam = route?.params?.initialItems ?? null;
  const initialClientNameParam = route?.params?.clientName ?? null;
  const bundleProjectIds = route?.params?.bundleProjectIds ?? null;
  const billingId = route?.params?.billingId ?? null;

  const [clientName, setClientName] = useState('　御中');
  const [invoiceNo, setInvoiceNo] = useState(() => {
    const d = new Date();
    return `INV-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
  });
  const [issueDate, setIssueDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [company, setCompany] = useState(DEFAULT_COMPANY);
  const [taxRate, setTaxRate] = useState('0.10');
  const [title] = useState('請　求　書');
  const [items, setItems] = useState([{ no: 1, name: '工事費 一式', qty: '1', unit: '式', unitPrice: '0', amount: 0 }]);

  // まとめ請求：初期値を注入（projectId が無い場合でも動作させる）
  useEffect(() => {
    if (initialClientNameParam) {
      setClientName(String(initialClientNameParam));
    }
    if (Array.isArray(initialItemsParam) && initialItemsParam.length) {
      setItems(
        initialItemsParam.map((it, idx) => ({
          no: idx + 1,
          projectId: it?.projectId ?? null,
          name: String(it?.name ?? ''),
          qty: String(it?.qty ?? '1'),
          unit: String(it?.unit ?? '式'),
          unitPrice: String(it?.unitPrice ?? '0'),
          amount: 0,
        }))
      );
    }
  }, [initialClientNameParam, initialItemsParam]);
  
  // --- ロゴ（Base64 data URI） ---
  const [logoTeam, setLogoTeam] = useState(null);
  const [logoSymbol, setLogoSymbol] = useState(null);

  useEffect(() => {
    // 画像アセットをBase64にして埋め込み
    (async () => {
      try {
        const teamAsset   = Asset.fromModule(TEAM_LOGO_MOD);
        const symbolAsset = Asset.fromModule(SYMBOL_LOGO_MOD);
        await Promise.all([teamAsset.downloadAsync(), symbolAsset.downloadAsync()]);
        const teamSrc   = teamAsset.localUri   || teamAsset.uri;
        const symbolSrc = symbolAsset.localUri || symbolAsset.uri;
        if (teamSrc) {
          const teamB64 = await FileSystem.readAsStringAsync(teamSrc, { encoding: FileSystem.EncodingType.Base64 });
          setLogoTeam(`data:image/png;base64,${teamB64}`);
        }
        if (symbolSrc) {
          const symbolB64 = await FileSystem.readAsStringAsync(symbolSrc, { encoding: FileSystem.EncodingType.Base64 });
          setLogoSymbol(`data:image/png;base64,${symbolB64}`);
        }
      } catch (_) {
        // ロゴ未設定でもPDF生成は継続
      }
    })();
  }, []);
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

  // ---- PDF HTMLを構築（プレビュー/エクスポート共通）----
  const buildPdfHtml = useCallback(() => {
    const rows = calcItems.map(it => {
      const qty = it.qty || '';
      const unit = it.unit || '';
      const unitPrice = fmt(it.unitPrice || 0);
      const amount = fmt(it.amount || 0);
      return `
        <tr>
          <td class="c no">${it.no}</td>
          <td class="l name">${esc(it.name||'')}</td>
          <td class="r qty">${qty}</td>
          <td class="c unit">${esc(unit)}</td>
          <td class="r price">¥${unitPrice}</td>
          <td class="r amount">¥${amount}</td>
        </tr>`;
    }).join('');
    const subtotalStr = fmt(subtotal);
    const taxStr = fmt(tax);
    const totalStr = fmt(total);
    const taxPct = (Number(taxRate||0) * 100).toFixed(2);
    return `
      <html><head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 16mm; }
          /* A4幅相当（96dpi想定）で固定：列幅を安定化 */
          body { width: 794px; margin: 0 auto; font-family: -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans CJK JP", sans-serif; font-size:12px; color:#000; }
          .invoice-title { text-align:center; font-size:32px; font-weight:bold; color:#00a5e3; letter-spacing:.5em; margin:40px 0 10px; }
          .horizontal-line { width:100%; border-top:1px solid #8e8e8e; margin-bottom:15px; }
          .header-row { display:flex; justify-content:space-between; margin-bottom:15px; }
          .header-left { width:50%; }
          /* 宛先：企業名の右に「御中」。社名～御中の間に下線を引く */
          .recipient-row{
            display:flex; align-items:flex-end; gap:8px; margin-bottom:6px;
          }
          .recipient-name{
            font-size:28px; font-weight:bold; line-height:1.2; min-width:0;
          }
          /* 社名と「御中」の間の空白部分のみ下線を引く */
          .recipient-underline{
            flex:1; border-bottom:1px solid #000; margin:0 4px 3px 4px;
          }
          .recipient-suffix{
            font-size:20px; font-weight:bold;
          }
          .message { font-size:12px; }
          .header-right { width:50%; text-align:right; }
          .date { font-size:12px; margin-bottom:8px; }
          .logo-container { display:flex; justify-content:flex-end; align-items:flex-start; gap:8px; margin-bottom:5px; }
          /* シンボル＋社名（社名1.5倍＝18px）を同一行に */
          .issuer-row{ display:flex; justify-content:flex-end; align-items:center; gap:8px; margin:4px 0; }
          .issuer-symbol{ height:22px; }
          .issuer-name{ font-size:18px; font-weight:bold; }
          .company-info { font-size:12px; line-height:1.4; text-align:right; }          
          /* 金額ラベルの右に仕切り線 → その直右に金額を配置 */
          .amount-section {
            border:1px solid #000;
            padding:6px 10px;
            margin:6px 0 3px;
            display:flex;
            align-items:center;
            justify-content:flex-start; /* ← 左寄せにして詰める */
            gap:0;                      /* 余白は金額側のpaddingで調整 */
          }
          .amount-label { font-size:18px; font-weight:bold; letter-spacing:.4em; }
          .amount-value {
            font-size:20px;
            font-weight:bold;
            border-left:1px solid #000; /* ← ラベル右の仕切り線 */
            margin-left:8px;            /* 線と金額の最小マージン */
            padding-left:8px;           /* 金額の内側余白 */
          }
          .bank-info { font-size:12px; margin-bottom:15px; }
          table { width:100%; border-collapse:collapse; }
          th, td { border:1px solid #000; padding:4px; font-size:12px; vertical-align:middle; }
          th { background:#00a5e3; color:#fff; text-align:center; font-weight:bold; }
          tbody td { text-align:center; }
          /* 明細セルの左右揃え・等幅数字・折り返し */
          .l{ text-align:left; } .r{ text-align:right; } .c{ text-align:center; }
          .qty,.price,.amount{ font-variant-numeric: tabular-nums; }
          .name{ white-space: pre-wrap; }
          /* 改ページの安定：ヘッダ固定/行分割防止 */
          thead{ display: table-header-group; }
          tfoot{ display: table-row-group; }
          tr{ page-break-inside: avoid; }          
          tbody tr:nth-child(even) { background:#e8f7fb; }
          .no-col{width:6%}.content-col{width:40%;text-align:left}.qty-col{width:8%}.unit-col{width:8%}.unit-price-col{width:14%}.amount-col{width:24%}
          tfoot td { border:1px solid #000; padding:4px; font-size:12px; }
          tfoot .label { text-align:right; font-weight:bold; }
          tfoot .value { text-align:right; }
          tfoot tr.total .value { background:#00a5e3; color:#fff; }
        </style>
      </head><body>
        <div class="invoice-title">請 求 書</div>
        <div class="horizontal-line"></div>
        <div class="header-row">
          <div class="header-left">
            <div class="recipient-row">
              <div class="recipient-name">${esc(normalizeRecipient(clientName))}</div>
              <div class="recipient-suffix">御中</div>
            </div>
            <div class="message">下記の通り、御請求申し上げます。</div>
          </div>
          <div class="header-right">
            <div class="date">発行日：${esc(toJpDate(issueDate))}　請求書番号：${esc(invoiceNo)}</div>
            <div class="logo-container">
              ${logoTeam ? `<img src="${logoTeam}" alt="TEAM ISHIKAWA" style="height:55px" />` : ''}
            </div>
            <div class="issuer-row">
              ${logoSymbol ? `<img src="${logoSymbol}" class="issuer-symbol" alt="Ishikawa Symbol" />` : ''}
              <div class="issuer-name">${esc(company.issuerName)}</div>
            </div>
            <div class="company-info">
              ${esc(company.issuerPostal)} ${esc(company.issuerAddress)}<br/>
              ${esc(company.issuerTel)}　${esc(company.issuerFax)}<br/>
              ${esc(company.issuerReg)}
            </div>
          </div>
        </div>
        <div class="amount-section">
          <div class="amount-label">請 求 金 額</div>
          <div class="amount-value" style="font-variant-numeric: tabular-nums;">¥${totalStr}</div>
        </div>
        <div class="bank-info">${esc(company.bankLine)}</div>
        <table>
          <thead>
            <tr>
              <th class="no-col">No.</th>
              <th class="content-col">内容</th>
              <th class="qty-col">数量</th>
              <th class="unit-col">単位</th>
              <th class="unit-price-col">単価</th>
              <th class="amount-col">金額</th>
            </tr>          
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="4"></td><td class="label">小計</td><td class="value">¥${subtotalStr}</td>
            </tr>
            <tr>
              <td colspan="4"></td><td class="label">消費税&nbsp;@${(Number(taxRate||0)*100).toFixed(2)}%</td>
              <td class="value">¥${taxStr}</td>
            </tr>
            <tr class="total">
              <td colspan="4"></td><td class="label">合計</td><td class="value">¥${totalStr}</td>
            </tr>
          </tfoot>
        </table>
      </body></html>`;
}, [calcItems, clientName, issueDate, invoiceNo, subtotal, tax, total, company, taxRate, logoTeam, logoSymbol]);

  // ---- PDF生成（URIを返す）----
  const generatePDF = useCallback(async () => {
    const html = buildPdfHtml();
    const file = await printToFileAsync({ html });
    const pdfName = `${(invoiceNo || 'invoice')}.pdf`;
    const targetUri = FileSystem.documentDirectory + pdfName;
    try {
      await FileSystem.moveAsync({ from: file.uri, to: targetUri });
      return targetUri;
    } catch {
      return file.uri;
    }
  }, [buildPdfHtml, invoiceNo]);

  // ---- 共有（従来の「PDFエクスポート」）----
  const exportPDF = useCallback(async () => {
    try {
      const uri = await generatePDF();

      // まとめ請求：PDFエクスポート時点で「請求中」へ遷移
      if (Array.isArray(bundleProjectIds) && bundleProjectIds.length > 0) {
        const entries = (items || [])
          .filter((it) => !!it?.projectId)
          .map((it) => ({
            projectId: it.projectId,
            amount: it.unitPrice,
            newStatus: 'issued',
          }));

        if (entries.length > 0) {
          try {
            await batchUpdateProjectInvoices(entries);
          } catch (err) {
            console.log(err);
            Alert.alert(
              'ステータス更新失敗',
              'PDFは作成しましたが、請求中ステータスへの更新に失敗しました。通信状況を確認して、WIP画面から更新してください。'
            );
          }
        }
      } else if (projectId) {
        // 単独請求：PDFエクスポート時点で「請求中」へ遷移（税抜＝subtotalを保存）
        const amountExTax = Number(subtotal || 0);
        try {
          // 出来高（billings）を編集している場合は billing 側を更新
          if (billingId) {
            await updateBillingAmount(projectId, billingId, amountExTax);
            await updateBillingStatus(projectId, billingId, 'issued');
          } else {
            await batchUpdateProjectInvoices([
              { projectId, amount: amountExTax, newStatus: 'issued' },
            ]);
          }
        } catch (err) {
          console.log(err);
          Alert.alert(
            'ステータス更新失敗',
            'PDFは作成しましたが、請求中ステータスへの更新に失敗しました。通信状況を確認して、WIP画面から更新してください。'
          );
        }
      }

      await Sharing.shareAsync(uri);
    } catch (e) {
      Alert.alert('PDF出力失敗', 'PDFの作成に失敗しました。');
    }
  }, [generatePDF, bundleProjectIds, items, projectId, billingId, subtotal]);
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
        {/* 追加：アプリ内プレビュー */}
        <TouchableOpacity
          onPress={async () => {
            try {
              const uri = await generatePDF();
              navigation.navigate('PDFPreview', {
                pdfUri: uri,
                fileName: `${(invoiceNo || 'invoice')}.pdf`,
              });
            } catch (e) {
              Alert.alert('プレビュー失敗', 'PDFの生成に失敗しました。');
            }
          }}
          style={tw`border rounded px-4 py-3`}
        >
          <Text>プレビュー</Text>
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
