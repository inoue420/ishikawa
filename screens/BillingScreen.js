// screens/BillingScreen.js

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Button,
  Alert,
  TouchableOpacity,
  Dimensions,
  Platform,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import tw from 'twrnc';

const { width } = Dimensions.get('window');
const USER_KEY = '@user_list';
const PROJECT_KEY = '@project_list';
const ATT_KEY = '@attendance_records';
const MAT_REC_KEY = '@materials_records';
const MAT_LIST_KEY = '@materials_list';
const COMPANY_KEY = '@company_profile';

export default function BillingScreen() {
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [invoiceLines, setInvoiceLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewHTML, setPreviewHTML] = useState('');
  const [modalVisible, setModalVisible] = useState(false);

  const formatISO = d => d.toISOString().slice(0,10);
  const diffDays = (d1, d2) => Math.floor((d2 - d1)/(1000*3600*24)) + 1;

  const makeInvoiceHTML = ({ lines, periodStart, periodEnd, invoiceNo, issueDate, clientName, companyInfo }) => {
    const { bankName, branchName, accountType, accountNumber } = companyInfo;
    const rows = lines.map(l => `
      <tr>
        <td>${l.project}</td>
        <td>${l.workHours}</td>
        <td>¥${l.laborCost.toLocaleString()}</td>
        <td>¥${l.materialCost.toLocaleString()}</td>
        <td>¥${l.total.toLocaleString()}</td>
      </tr>
    `).join('');
    const totalAll = lines.reduce((sum, l) => sum + l.total, 0);
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>請求書</title>
        <style>
          body { font-family: sans-serif; padding: 40px; }
          header { text-align: center; margin-bottom: 40px; }
          .company { font-size: 18px; font-weight: bold; }
          .meta { margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #333; padding: 8px; text-align: center; }
          th { background: #f0f0f0; }
          .total { text-align: right; margin-top: 20px; font-size: 16px; }
          footer { margin-top: 60px; font-size: 12px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <header>
          <div class="company">株式会社　石川組</div>
          <div>〒939-1363 富山県砺波市太郎丸6568-1</div>
          <div>TEL: 0763-77-3185</div>
        </header>
        <section class="meta">
          <div>請求書番号：${invoiceNo}</div>
          <div>発行日：${issueDate}</div>
          <div>請求先：${clientName}</div>
          <div>請求期間：${periodStart} ～ ${periodEnd}</div>
        </section>
        <table>
          <thead>
            <tr>
              <th>プロジェクト</th>
              <th>労働時間(h)</th>
              <th>人件費(¥)</th>
              <th>資材費(¥)</th>
              <th>合計(¥)</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <div class="total">総合計：¥${totalAll.toLocaleString()}</div>
        <footer>
          <div>振込先：${bankName} ${branchName} ${accountType} ${accountNumber}</div>
        </footer>
      </body>
    </html>
    `;
  };

  const loadAndCompute = async () => {
    setLoading(true);
    try {
      const users = JSON.parse(await AsyncStorage.getItem(USER_KEY) || '[]');
      const projects = JSON.parse(await AsyncStorage.getItem(PROJECT_KEY) || '[]');
      const atts = JSON.parse(await AsyncStorage.getItem(ATT_KEY) || '[]');
      const mats = JSON.parse(await AsyncStorage.getItem(MAT_REC_KEY) || '[]');
      const matList = JSON.parse(await AsyncStorage.getItem(MAT_LIST_KEY) || '[]');
      const linesMap = {};
      projects.forEach(p => linesMap[p.name] = { project: p.name, workHours:0, laborCost:0, materialCost:0, total:0 });
      atts.forEach(rec => {
        const d = new Date(rec.date);
        if (d >= startDate && d <= endDate) {
          const line = linesMap[rec.project]; if (!line) return;
          const hrs = (rec.users?.length||0)*8;
          const cost = (rec.users||[]).reduce((s,u)=>{ const uobj=users.find(x=>x.name===u); return s+(uobj?.wage||0)*8; },0);
          line.workHours+=hrs; line.laborCost+=cost;
        }
      });
      mats.forEach(rec=>{
        const s=new Date(rec.lendStart), e=rec.lendEnd?new Date(rec.lendEnd):endDate;
        if (s<=endDate && e>=startDate) {
          const line = linesMap[rec.project]; if(!line) return;
          const st = s<startDate?startDate:s, ed = e>endDate?endDate:e;
          const days = diffDays(st,ed);
          (rec.items||[]).forEach(it=>{ const m=matList.find(x=>x.name===it); line.materialCost+=(m?.unitPrice||0)*days; });
        }
      });
      const results = Object.values(linesMap).map(l=>({ ...l, total:l.laborCost+l.materialCost })).filter(l=>l.total>0);
      setInvoiceLines(results);
    } catch(e) { console.error(e); Alert.alert('エラー','集計失敗'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAndCompute(); }, [startDate,endDate]);

  const handlePreview = async () => {
    if (invoiceLines.length === 0) return Alert.alert('エラー','明細がありません');
    const projList = JSON.parse(await AsyncStorage.getItem(PROJECT_KEY) || '[]');
    const firstProj = projList.find(p => p.name === invoiceLines[0].project);
    const clientName = firstProj?.clientName || '';
    const comp = JSON.parse(await AsyncStorage.getItem(COMPANY_KEY) || '{}');
    const invoiceNo = `INV-${Date.now()}`;
    const issueDate = formatISO(new Date());
    const html = makeInvoiceHTML({
      lines: invoiceLines,
      periodStart: formatISO(startDate),
      periodEnd: formatISO(endDate),
      invoiceNo,
      issueDate,
      clientName,
      companyInfo: comp
    });
    setPreviewHTML(html);
    setModalVisible(true);
  };

  const handleSavePDF = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html: previewHTML });
      const filename = FileSystem.documentDirectory + `invoice-${Date.now()}.pdf`;
      await FileSystem.moveAsync({ from: uri, to: filename });
      Alert.alert('保存完了', `保存先: ${filename}`);
      setModalVisible(false);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー','保存に失敗しました');
    }
  };

  return (
    <View style={tw`flex-1 bg-gray-100`}>
      <ScrollView contentContainerStyle={tw`p-4`}>
        <View style={tw`flex-row justify-between mb-4`}>
          <TouchableOpacity style={tw`bg-white p-4 rounded border border-gray-300 flex-1 mr-2`} onPress={()=>setShowStartPicker(true)}>
            <Text>開始日: {formatISO(startDate)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={tw`bg-white p-4 rounded border border-gray-300 flex-1`} onPress={()=>setShowEndPicker(true)}>
            <Text>終了日: {formatISO(endDate)}</Text>
          </TouchableOpacity>
        </View>
        {showStartPicker && <DateTimePicker value={startDate} mode="date" display={Platform.OS==='ios'?'spinner':'default'} onChange={(_,d)=>{setShowStartPicker(false); if(d) setStartDate(d);}} />}
        {showEndPicker && <DateTimePicker value={endDate} mode="date" display={Platform.OS==='ios'?'spinner':'default'} onChange={(_,d)=>{setShowEndPicker(false); if(d) setEndDate(d);}} />}
        <View style={tw`flex-row justify-around mb-6`}>
          <View style={{ width: '40%' }}><Button title={loading?'集計中...':'集計'} onPress={loadAndCompute} disabled={loading}/></View>
          <View style={{ width: '40%' }}><Button title="プレビュー" onPress={handlePreview} /></View>
        </View>
        <Text style={tw`text-xl font-bold mb-2`}>請求明細</Text>
        {invoiceLines.length===0 ? (
          <Text style={tw`text-center text-gray-500`}>集計データがありません</Text>
        ) : (
          invoiceLines.map((line,idx)=>(
            <View key={idx} style={tw`bg-white p-3 rounded mb-2`}>
              <Text style={tw`font-semibold mb-1`}>{line.project}</Text>
              <Text>労働時間: {line.workHours}h</Text>
              <Text>人件費: ¥{line.laborCost}</Text>
              <Text>資材費: ¥{line.materialCost}</Text>
              <Text style={tw`font-bold mt-1`}>合計: ¥{line.total}</Text>
            </View>
          ))
        )}
      </ScrollView>
      <Modal visible={modalVisible} transparent={false} animationType="slide">
        <View style={{ flex: 1 }}>
          <WebView
            originWhitelist={['*']}
            source={{ html: previewHTML }}
            style={{ flex: 1 }}
          />
          <View style={tw`flex-row justify-around p-4 bg-white`}>   
            <View style={{ width: '45%' }}>
              <Button title="保存PDF" onPress={handleSavePDF} />
            </View>
            <View style={{ width: '45%' }}>
              <Button title="閉じる" onPress={()=>setModalVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
