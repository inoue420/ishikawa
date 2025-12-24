// screens/BillingScreen.js

import React, { useEffect, useState, useCallback } from 'react';
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
import DateTimePicker from '@react-native-community/datetimepicker';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import tw from 'twrnc';

import {
  fetchUsers,
  fetchProjects,
  fetchAttendanceRecords,
  fetchMaterialsRecords,
  fetchMaterialsList,
  fetchCompanyProfile,
} from '../../firestoreService';

const { width } = Dimensions.get('window');

export default function BillingScreen() {
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [invoiceLines, setInvoiceLines] = useState([]);
  const [loading, setLoading] = useState(false);

  const [previewHTML, setPreviewHTML] = useState('');
  const [modalVisible, setModalVisible] = useState(false);

  const formatISO = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const diffDays = (d1, d2) =>
    Math.floor((d2 - d1) / (1000 * 3600 * 24)) + 1;

  const makeInvoiceHTML = ({
    lines,
    periodStart,
    periodEnd,
    invoiceNo,
    issueDate,
    clientName,
    companyInfo,
  }) => {
    const { bankName, branchName, accountType, accountNumber, companyName } =
      companyInfo;
    const rows = lines
      .map(
        (l) => `
      <tr>
        <td>${l.project}</td>
        <td>${l.workHours}</td>
        <td>¥${l.laborCost.toLocaleString()}</td>
        <td>¥${l.materialCost.toLocaleString()}</td>
        <td>¥${l.total.toLocaleString()}</td>
      </tr>
    `
      )
      .join('');
    const totalAll = lines.reduce((sum, l) => sum + l.total, 0);
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>請求書</title>
        <style>
          body { font-family: sans-serif; padding: 40px; }
          header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
          .title { font-size: 24px; font-weight: bold; }
          .company { font-size: 14px; text-align: right; }
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
          <div class="title">請求書</div>
          <div class="company">
            ${companyName}<br/>
            〒939-1363 富山県砺波市太郎丸6568-1<br/>
            TEL: 0763-77-3185
          </div>
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
      // Firestore からデータ取得
      const [usersList, projectsList, attendanceList, materialsRecList, matList] =
        await Promise.all([
          fetchUsers(),
          fetchProjects(),
          fetchAttendanceRecords(), // 全件取得して範囲フィルタする
          fetchMaterialsRecords(),
          fetchMaterialsList(),
        ]);

      const linesMap = {};
      projectsList.forEach((p) => {
        linesMap[p.name] = {
          project: p.name,
          workHours: 0,
          laborCost: 0,
          materialCost: 0,
          total: 0,
        };
      });

      // 出勤レコードを日付範囲で集計
      attendanceList.forEach((rec) => {
        const recDate = rec.date.toDate();
        if (recDate >= startDate && recDate <= endDate) {
          const line = linesMap[rec.project];
          if (!line) return;
          const workHrs = (rec.users?.length || 0) * 8;
          const laborCost = (rec.users || []).reduce((sum, u) => {
            const userObj = usersList.find((x) => x.name === u);
            return sum + (userObj?.wage || 0) * 8;
          }, 0);
          line.workHours += workHrs;
          line.laborCost += laborCost;
        }
      });

      // 資材使用レコードを日付範囲で集計
      materialsRecList.forEach((rec) => {
        const start = rec.lendStart.toDate();
        const end = rec.lendEnd ? rec.lendEnd.toDate() : endDate;
        if (start <= endDate && end >= startDate) {
          const line = linesMap[rec.project];
          if (!line) return;
          const st = start < startDate ? startDate : start;
          const ed = end > endDate ? endDate : end;
          const days = diffDays(st, ed);
          (rec.items || []).forEach((it) => {
            const matObj = matList.find((x) => x.name === it);
            line.materialCost += (matObj?.unitPrice || 0) * days;
          });
        }
      });

      // 最終的な合計を計算し、ゼロ以外の行だけ抽出
      const results = Object.values(linesMap)
        .map((l) => ({ ...l, total: l.laborCost + l.materialCost }))
        .filter((l) => l.total > 0);

      setInvoiceLines(results);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '集計失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAndCompute();
  }, [startDate, endDate]);

  const handleProjectInvoice = async (projectLine) => {
    // 請求先（顧客）情報を取得
    const proj = (await fetchProjects()).find(
      (p) => p.name === projectLine.project
    );
    const clientName = proj?.clientName || '';
    const comp = (await fetchCompanyProfile()) || {};

    const invoiceNo = `INV-${Date.now()}`;
    const issueDate = formatISO(new Date());
    const html = makeInvoiceHTML({
      lines: [projectLine],
      periodStart: formatISO(startDate),
      periodEnd: formatISO(endDate),
      invoiceNo,
      issueDate,
      clientName,
      companyInfo: comp,
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
      Alert.alert('エラー', '保存に失敗しました');
    }
  };

  return (
    <View style={tw`flex-1 bg-gray-100`}>
      <ScrollView contentContainerStyle={tw`p-4`}>
        <View style={tw`flex-row justify-between mb-4`}>
          <TouchableOpacity
            style={tw`bg-white p-4 rounded border border-gray-300 flex-1 mr-2`}
            onPress={() => setShowStartPicker(true)}
          >
            <Text>開始日: {formatISO(startDate)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={tw`bg-white p-4 rounded border border-gray-300 flex-1`}
            onPress={() => setShowEndPicker(true)}
          >
            <Text>終了日: {formatISO(endDate)}</Text>
          </TouchableOpacity>
        </View>

        {showStartPicker && (
          <DateTimePicker
            value={startDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, d) => {
              setShowStartPicker(false);
              if (d) setStartDate(d);
            }}
          />
        )}
        {showEndPicker && (
          <DateTimePicker
            value={endDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, d) => {
              setShowEndPicker(false);
              if (d) setEndDate(d);
            }}
          />
        )}

        <View style={tw`flex-row justify-around mb-6`}>
          <View style={{ width: '40%' }}>
            <Button
              title={loading ? '集計中...' : '集計'}
              onPress={loadAndCompute}
              disabled={loading}
            />
          </View>
          <View style={{ width: '40%' }}>
            <Button
              title="プレビュー"
              onPress={() => {
                if (invoiceLines.length > 0) {
                  handleProjectInvoice(invoiceLines[0]);
                }
              }}
            />
          </View>
        </View>

        <Text style={tw`text-xl font-bold mb-2`}>請求明細</Text>
        {invoiceLines.length === 0 ? (
          <Text style={tw`text-center text-gray-500`}>集計データがありません</Text>
        ) : (
          invoiceLines.map((line, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => handleProjectInvoice(line)}
            >
              <View style={tw`bg-white p-3 rounded mb-2`}>
                <Text style={tw`font-semibold mb-1`}>{line.project}</Text>
                <Text>労働時間: {line.workHours}h</Text>
                <Text>人件費: ¥{line.laborCost.toLocaleString()}</Text>
                <Text>資材費: ¥{line.materialCost.toLocaleString()}</Text>
                <Text style={tw`font-bold mt-1`}>
                  合計: ¥{line.total.toLocaleString()}
                </Text>
              </View>
            </TouchableOpacity>
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
              <Button title="閉じる" onPress={() => setModalVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
