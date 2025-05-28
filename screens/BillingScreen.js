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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import tw from 'twrnc';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const { width } = Dimensions.get('window');
const USER_KEY = '@user_list';
const PROJECT_KEY = '@project_list';
const ATT_KEY = '@attendance_records';
const MAT_REC_KEY = '@materials_records';
const MAT_LIST_KEY = '@materials_list';

export default function BillingScreen() {
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [invoiceLines, setInvoiceLines] = useState([]);
  const [loading, setLoading] = useState(false);

  // format helpers
  const formatISO = d => d.toISOString().slice(0,10);
  const formatDate = d => d.toLocaleDateString();
  const diffDays = (d1, d2) => Math.floor((d2 - d1)/(1000*3600*24)) + 1;

  // build HTML template
  const makeInvoiceHTML = (lines, periodStart, periodEnd, invoiceNo, issueDate, clientName) => {
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
          .meta div { margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #333; padding: 8px; text-align: center; }
          th { background: #f0f0f0; }
          .total { text-align: right; margin-top: 20px; font-size: 16px; }
          footer { margin-top: 60px; font-size: 12px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <header>
          <div class="company">YOUR COMPANY NAME</div>
          <div>〒123-4567 東京都〇〇区△△町1-2-3</div>
          <div>TEL: 03-1234-5678</div>
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
          上記の通り、ご請求申し上げます。<br>
          振込先：〇〇銀行 渋谷支店 普通 1234567<br>
          ご不明点は担当までお問い合わせください。
        </footer>
      </body>
    </html>
    `;
  };

  // aggregate data
  const loadAndCompute = async () => {
    setLoading(true);
    try {
      const users = JSON.parse(await AsyncStorage.getItem(USER_KEY) || '[]');
      const projects = JSON.parse(await AsyncStorage.getItem(PROJECT_KEY) || '[]');
      const atts = JSON.parse(await AsyncStorage.getItem(ATT_KEY) || '[]');
      const mats = JSON.parse(await AsyncStorage.getItem(MAT_REC_KEY) || '[]');
      const matList = JSON.parse(await AsyncStorage.getItem(MAT_LIST_KEY) || '[]');
      const linesMap = {};
      projects.forEach(p => { linesMap[p.name] = { project: p.name, workHours:0, laborCost:0, materialCost:0, total:0 } });
      atts.forEach(rec => {
        const d = new Date(rec.date);
        if (d>=startDate && d<=endDate) {
          const line = linesMap[rec.project]; if (!line) return;
          const hrs = (rec.users?.length||0)*8;
          const cost = (rec.users||[]).reduce((s,u)=>{ const uobj=users.find(x=>x.name===u); return s+(uobj?.wage||0)*8; },0);
          line.workHours+=hrs; line.laborCost+=cost;
        }
      });
      mats.forEach(rec=>{
        const s=new Date(rec.lendStart), e=rec.lendEnd?new Date(rec.lendEnd):endDate;
        if (s<=endDate && e>=startDate) {
          const line=linesMap[rec.project]; if(!line) return;
          const st=s<startDate?startDate:s, ed=e> endDate?endDate:e;
          const days=diffDays(st,ed);
          (rec.items||[]).forEach(it=>{ const m=matList.find(x=>x.name===it); line.materialCost+= (m?.unitPrice||0)*days; });
        }
      });
      const results = Object.values(linesMap).map(l=>({ ...l, total:l.laborCost+l.materialCost })).filter(l=>l.total>0);
      setInvoiceLines(results);
    } catch(e){ console.error(e); Alert.alert('エラー','集計失敗'); }
    finally{ setLoading(false); }
  };

  useEffect(() => { loadAndCompute(); }, [startDate,endDate]);

  // PDF generation
  const generateAndSharePDF = async () => {
    if (invoiceLines.length===0) return Alert.alert('エラー','請求明細がありません');
    const invoiceNo = `INV-${Date.now()}`;
    const issueDate = formatISO(new Date());
    const clientName = ''; // TODO: invoice client name input
    const html = makeInvoiceHTML(invoiceLines, formatISO(startDate), formatISO(endDate), invoiceNo, issueDate, clientName);
    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー','PDF生成／共有に失敗しました');
    }
  };

  return (
    <View style={tw`flex-1 flex-row bg-gray-100`}>
      {/* Left column */}
      <ScrollView style={{ width: width * 0.6, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-4`}>請求期間設定</Text>
        <Text style={tw`mb-2`}>開始日</Text>
        <TouchableOpacity style={tw`bg-white p-4 rounded mb-4 border border-gray-300`} onPress={()=>setShowStartPicker(true)}>
          <Text>{formatISO(startDate)}</Text>
        </TouchableOpacity>
        {showStartPicker && (<DateTimePicker value={startDate} mode="date" display={Platform.OS==='ios'?'spinner':'default'} onChange={(_,d)=>{setShowStartPicker(false); if(d) setStartDate(d);}} />)}
        <Text style={tw`mb-2`}>終了日</Text>
        <TouchableOpacity style={tw`bg-white p-4 rounded mb-4 border border-gray-300`} onPress={()=>setShowEndPicker(true)}>
          <Text>{formatISO(endDate)}</Text>
        </TouchableOpacity>
        {showEndPicker && (<DateTimePicker value={endDate} mode="date" display={Platform.OS==='ios'?'spinner':'default'} onChange={(_,d)=>{setShowEndPicker(false); if(d) setEndDate(d);}} />)}
        <View style={tw`items-center mb-4`}><View style={{width:'50%'}}><Button title={loading?'集計中...':'集計'} onPress={loadAndCompute} disabled={loading}/></View></View>
        <View style={tw`items-center mb-6`}><View style={{width:'50%'}}><Button title="請求書発行" onPress={generateAndSharePDF} /></View></View>
      </ScrollView>
      {/* Right column */}
      <ScrollView style={{ width: width * 0.4, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-4`}>請求明細</Text>
        {invoiceLines.length===0 ? <Text style={tw`text-center text-gray-500`}>集計データがありません</Text> : invoiceLines.map((line,idx)=>(<View key={idx} style={tw`bg-white p-3 rounded mb-2`}><Text style={tw`font-semibold mb-1`}>{line.project}</Text><Text>労働時間: {line.workHours}h</Text><Text>人件費: ¥{line.laborCost}</Text><Text>資材費: ¥{line.materialCost}</Text><Text style={tw`font-bold mt-1`}>合計: ¥{line.total}</Text></View>))}
      </ScrollView>
    </View>
  );
}
