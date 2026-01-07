// screens/phone/InvoiceEditorShimizuScreen.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import tw from 'twrnc';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { printToFileAsync } from 'expo-print';
import { Asset } from 'expo-asset';

import { fetchProjectById } from '../../firestoreService';

// assets同梱（要配置：assets/invoice-templates/shimizu.png）
const SHIMIZU_BG_MOD = require('../../assets/invoice-templates/shimizu.png');

const fmtYen = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return v.toLocaleString('ja-JP');
};

const esc = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const toJpDate = (s = '') => {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
  const d = new Date(s || Date.now());
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

// ---- 位置（mm）※テンプレ見た目に合わせて後で微調整 ----
const POS = {
  issueDate: { left: 160, top: 18, size: 11 },

  siteName: { left: 38, top: 49, size: 12 },
  invoiceAmount: { left: 46, top: 78, size: 18 },

  workName: { left: 40, top: 112, size: 12 },
  applicationNo: { left: 100, top: 128, size: 12 },

  checkAdvance: { left: 28, top: 146, size: 14 },
  checkSettlement: { left: 28, top: 156, size: 14 },
  advanceRound: { left: 48, top: 146, size: 12 },

  // 右の金額欄（右寄せ）
  contract: { left: 160, top: 188, size: 12, w: 38, align: 'right' },
  a1: { left: 160, top: 201, size: 12, w: 38, align: 'right' },
  a2: { left: 160, top: 214, size: 12, w: 38, align: 'right' },
  a3: { left: 160, top: 227, size: 12, w: 38, align: 'right' },
  a4: { left: 160, top: 240, size: 12, w: 38, align: 'right' },
  a5: { left: 160, top: 253, size: 12, w: 38, align: 'right' },
  a6: { left: 160, top: 266, size: 12, w: 38, align: 'right' },
};

const buildHtml = ({ bgDataUri, state, computed }) => {
  const place = (text, p) => {
    const w = p.w ? `width:${p.w}mm;` : '';
    const align = p.align ? `text-align:${p.align};` : '';
    return `<div class="t" style="left:${p.left}mm; top:${p.top}mm; font-size:${p.size}pt; ${w}${align}">${esc(
      text ?? ''
    )}</div>`;
  };

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0; }
  body { margin:0; padding:0; }
  .page { position: relative; width: 210mm; height: 297mm; }
  .bg { position:absolute; left:0; top:0; width:210mm; height:297mm; }
  .t { position:absolute; font-family: "Hiragino Sans", "Noto Sans JP", "Helvetica", sans-serif; color:#000; white-space: pre; }
</style>
</head>
<body>
  <div class="page">
    ${bgDataUri ? `<img class="bg" src="${bgDataUri}" />` : ''}

    ${place(toJpDate(state.issueDate), POS.issueDate)}

    ${place(state.siteName, POS.siteName)}
    ${place(fmtYen(computed.total), POS.invoiceAmount)}

    ${place(state.workName, POS.workName)}
    ${place(state.applicationNo, POS.applicationNo)}

    ${state.billingMode === 'advance' ? place('✓', POS.checkAdvance) : place('✓', POS.checkSettlement)}
    ${state.billingMode === 'advance' ? place(String(state.advanceRound || ''), POS.advanceRound) : ''}

    ${place(fmtYen(state.contractAmount), POS.contract)}
    ${place(fmtYen(state.amount1), POS.a1)}
    ${place(fmtYen(state.amount2), POS.a2)}
    ${place(fmtYen(computed.amount3), POS.a3)}
    ${place(fmtYen(state.amount4), POS.a4)}
    ${place(fmtYen(computed.tax), POS.a5)}
    ${place(fmtYen(computed.total), POS.a6)}
  </div>
</body>
</html>
`;
};

export default function InvoiceEditorShimizuScreen() {
  const route = useRoute();
  const navigation = useNavigation();

  const projectId = route?.params?.projectId ?? null;
  const billingAmountParam = route?.params?.billingAmount ?? route?.params?.amount ?? null;

  const seededRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [bgDataUri, setBgDataUri] = useState(null);

  // 入力項目（清水建設用）
  const [issueDate, setIssueDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const [siteName, setSiteName] = useState('');
  const [workName, setWorkName] = useState('');
  const [applicationNo, setApplicationNo] = useState('');

  // 「第__回内金」or「精算金」（排他チェック）
  const [billingMode, setBillingMode] = useState('advance'); // 'advance' | 'settlement'
  const [advanceRound, setAdvanceRound] = useState('1');

  // 金額系（文字列で保持→計算時にNumber）
  const [contractAmount, setContractAmount] = useState('');
  const [amount1, setAmount1] = useState(''); // ① 出来高累計額
  const [amount2, setAmount2] = useState('0'); // ② 受領済内金額
  const [amount4, setAmount4] = useState(''); // ④ 今回出来高請求額
  const [taxRate, setTaxRate] = useState('0.10');

  // 背景PNGをBase64にして埋め込み
  useEffect(() => {
    (async () => {
      try {
        const a = Asset.fromModule(SHIMIZU_BG_MOD);
        await a.downloadAsync();
        const src = a.localUri || a.uri;
        if (!src) return;
        const b64 = await FileSystem.readAsStringAsync(src, { encoding: FileSystem.EncodingType.Base64 });
        setBgDataUri(`data:image/png;base64,${b64}`);
      } catch (e) {
        console.warn(e);
        // 背景無しでも一応出せるが、見た目一致が目的なので後で必ず直す
      }
    })();
  }, []);

  // プロジェクト情報から初期値を注入（手動編集は上書きしない）
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!projectId) {
        setLoading(false);
        return;
      }
      try {
        const p = await fetchProjectById(projectId);
        if (!alive) return;

        if (!seededRef.current) {
          const orderAmount = p?.orderAmount ?? 0;
          const seedCurrent = billingAmountParam != null ? billingAmountParam : (p?.invoiceAmount ?? orderAmount);

          setSiteName(String(p?.location || p?.siteName || ''));
          setWorkName(String(p?.name || p?.title || p?.projectName || ''));
          setContractAmount(String(orderAmount || '0'));

          // ご要望：取極金額・①・②・④は自動初期値（編集可能）
          setAmount1(String(orderAmount || '0'));
          setAmount2('0');
          setAmount4(String(seedCurrent || '0'));

          seededRef.current = true;
        }
      } catch (e) {
        console.warn(e);
        Alert.alert('読み込み失敗', 'プロジェクト情報の取得に失敗しました（手入力で続行できます）');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [projectId, billingAmountParam]);

  const computed = useMemo(() => {
    const a1n = Number(amount1 || 0);
    const a2n = Number(amount2 || 0);
    const a4n = Number(amount4 || 0);
    const rate = Number(taxRate || 0);

    const amount3 = Math.round(a1n - a2n);
    const tax = Math.round(a4n * rate);
    const total = Math.round(a4n + tax);

    return { amount3, tax, total };
  }, [amount1, amount2, amount4, taxRate]);

  const generatePDF = useCallback(async () => {
    const html = buildHtml({
      bgDataUri,
      state: {
        issueDate,
        siteName,
        workName,
        applicationNo,
        billingMode,
        advanceRound,
        contractAmount,
        amount1,
        amount2,
        amount4,
      },
      computed,
    });

    const file = await printToFileAsync({ html });
    const pdfName = `shimizu-invoice-${Date.now()}.pdf`;
    const targetUri = FileSystem.documentDirectory + pdfName;

    try {
      await FileSystem.moveAsync({ from: file.uri, to: targetUri });
      return { uri: targetUri, fileName: pdfName };
    } catch {
      return { uri: file.uri, fileName: pdfName };
    }
  }, [
    bgDataUri,
    issueDate,
    siteName,
    workName,
    applicationNo,
    billingMode,
    advanceRound,
    contractAmount,
    amount1,
    amount2,
    amount4,
    computed,
  ]);

  const onPreview = useCallback(async () => {
    try {
      const { uri, fileName } = await generatePDF();
      navigation.navigate('PDFPreview', { pdfUri: uri, fileName });
    } catch (e) {
      console.warn(e);
      Alert.alert('プレビュー失敗', 'PDFの生成に失敗しました。');
    }
  }, [generatePDF, navigation]);

  const onExport = useCallback(async () => {
    try {
      const { uri } = await generatePDF();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('PDFを保存しました', uri);
      }
    } catch (e) {
      console.warn(e);
      Alert.alert('PDF出力失敗', 'PDFの作成に失敗しました。');
    }
  }, [generatePDF]);

  const Radio = ({ value, label, selected, onPress }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={tw`flex-row items-center mr-4 mb-2`}>
      <Text style={tw`text-lg mr-2`}>{selected ? '☑' : '☐'}</Text>
      <Text style={tw`text-base`}>{label}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 items-center justify-center`}>
        <ActivityIndicator />
        <Text style={tw`mt-2`}>読み込み中...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <ScrollView contentContainerStyle={tw`p-4`}>
        <Text style={tw`text-xl font-bold mb-3`}>請求書（清水建設フォーマット）</Text>

        <Text style={tw`text-sm text-gray-600 mb-2`}>
          ※ 見た目の一致度は「背景PNG」と「座標（mm）」で調整します（POS定義）。
        </Text>

        <Text style={tw`font-bold mt-2`}>発行日</Text>
        <TextInput value={issueDate} onChangeText={setIssueDate} style={tw`border rounded p-2 mt-1`} placeholder="YYYY-MM-DD" />

        <Text style={tw`font-bold mt-3`}>作業所名</Text>
        <TextInput value={siteName} onChangeText={setSiteName} style={tw`border rounded p-2 mt-1`} placeholder="（例）〇〇作業所" />

        <Text style={tw`font-bold mt-3`}>工事名称</Text>
        <TextInput value={workName} onChangeText={setWorkName} style={tw`border rounded p-2 mt-1`} placeholder="（例）〇〇工事" />

        <Text style={tw`font-bold mt-3`}>申込番号</Text>
        <TextInput value={applicationNo} onChangeText={setApplicationNo} style={tw`border rounded p-2 mt-1`} placeholder="（任意）" />

        <Text style={tw`font-bold mt-3`}>内金 / 精算金</Text>
        <View style={tw`flex-row flex-wrap mt-2`}>
          <Radio
            label="第○回 内金"
            selected={billingMode === 'advance'}
            onPress={() => setBillingMode('advance')}
          />
          <Radio
            label="精算金"
            selected={billingMode === 'settlement'}
            onPress={() => setBillingMode('settlement')}
          />
        </View>

        {billingMode === 'advance' && (
          <>
            <Text style={tw`font-bold mt-2`}>第○回（回数）</Text>
            <TextInput
              value={advanceRound}
              onChangeText={(v) => setAdvanceRound(v.replace(/[^0-9]/g, ''))}
              style={tw`border rounded p-2 mt-1 w-24`}
              keyboardType="number-pad"
              placeholder="1"
            />
          </>
        )}

        <Text style={tw`font-bold mt-4`}>金額</Text>

        <Text style={tw`mt-2`}>取極金額</Text>
        <TextInput
          value={contractAmount}
          onChangeText={(v) => setContractAmount(v.replace(/[^0-9]/g, ''))}
          style={tw`border rounded p-2 mt-1`}
          keyboardType="number-pad"
        />

        <Text style={tw`mt-2`}>① 出来高累計額</Text>
        <TextInput
          value={amount1}
          onChangeText={(v) => setAmount1(v.replace(/[^0-9]/g, ''))}
          style={tw`border rounded p-2 mt-1`}
          keyboardType="number-pad"
        />

        <Text style={tw`mt-2`}>② 受領済内金額</Text>
        <TextInput
          value={amount2}
          onChangeText={(v) => setAmount2(v.replace(/[^0-9]/g, ''))}
          style={tw`border rounded p-2 mt-1`}
          keyboardType="number-pad"
        />

        <View style={tw`mt-2`}>
          <Text>③ 出来高累計未精算額（①-②）</Text>
          <Text style={tw`text-lg font-bold mt-1`}>{fmtYen(computed.amount3)} 円</Text>
        </View>

        <Text style={tw`mt-2`}>④ 今回出来高請求額</Text>
        <TextInput
          value={amount4}
          onChangeText={(v) => setAmount4(v.replace(/[^0-9]/g, ''))}
          style={tw`border rounded p-2 mt-1`}
          keyboardType="number-pad"
        />

        <Text style={tw`mt-2`}>税率（固定でもOK）</Text>
        <TextInput
          value={taxRate}
          onChangeText={setTaxRate}
          style={tw`border rounded p-2 mt-1 w-28`}
          keyboardType="decimal-pad"
        />

        <View style={tw`mt-3`}>
          <Text>⑤ 今回出来高消費税</Text>
          <Text style={tw`text-lg font-bold mt-1`}>{fmtYen(computed.tax)} 円</Text>
        </View>

        <View style={tw`mt-3`}>
          <Text>⑥ 今回出来高請求合計（④+⑤）</Text>
          <Text style={tw`text-xl font-bold mt-1`}>{fmtYen(computed.total)} 円</Text>
        </View>

        <View style={tw`flex-row mt-6`}>
          <TouchableOpacity onPress={onPreview} style={tw`border rounded px-4 py-3 mr-2 flex-1`} activeOpacity={0.8}>
            <Text style={tw`text-center`}>プレビュー</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onExport} style={tw`border rounded px-4 py-3 flex-1`} activeOpacity={0.8}>
            <Text style={tw`text-center`}>PDFエクスポート</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.goBack()} style={tw`border rounded px-4 py-3 mt-3`} activeOpacity={0.8}>
          <Text style={tw`text-center`}>戻る</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
