// screens/ExportSettingsScreen.js

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Button,
  ScrollView,
  Alert,
  Modal,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Papa from 'papaparse';
import dayjs from 'dayjs';
import tw from 'twrnc';

import {
  fetchProjects,
  fetchAttendanceRecords,
  fetchMaterialsRecords,
  fetchMaterialsList,
  fetchUsers,
} from '../firestoreService';

const { width } = Dimensions.get('window');

export default function ExportSettingsScreen() {
  const [fromDate, setFromDate] = useState(new Date());
  const [toDate, setToDate] = useState(new Date());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const [exportData, setExportData] = useState([]);
  const [loading, setLoading] = useState(false);

  const [previewVisible, setPreviewVisible] = useState(false);

  // ヘッダー項目を定義
  const headers = [
    'プロジェクト名',
    '顧客名',
    '工期(日数)',
    '資材費(総額)',
    '労務費(総額)',
    '平均日あたり人員数',
  ];

  // CSV 生成用に各プロジェクトごとの値を計算
  const buildExportData = useCallback(async () => {
    setLoading(true);
    try {
      // 必要なコレクションを一括取得
      const [
        projectsList,
        attendanceList,
        materialsRecList,
        matList,
        usersList,
      ] = await Promise.all([
        fetchProjects(),
        fetchAttendanceRecords(),
        fetchMaterialsRecords(),
        fetchMaterialsList(),
        fetchUsers(),
      ]);

      // materialsList を名前→単価 のマップに
      const matPriceMap = {};
      matList.forEach((m) => {
        matPriceMap[m.name] = m.unitPrice;
      });

      // usersList を名前→時給 のマップに
      const wageMap = {};
      usersList.forEach((u) => {
        wageMap[u.name] = u.wage; // ユーザー名をキーに時給を取得
      });

      // 各プロジェクトごとに集計するためのオブジェクトを準備
      const projectStats = {};
      projectsList.forEach((proj) => {
        // プロジェクトの工期(日数)を計算
        const start = proj.startDate.toDate();
        const end = proj.endDate.toDate();
        const durationDays =
          Math.floor((end - start) / (1000 * 3600 * 24)) + 1;

        projectStats[proj.name] = {
          clientName: proj.clientName || '',
          durationDays,
          totalMaterialCost: 0,
          totalLaborCost: 0,
          totalPersonDays: 0,
        };
      });

      // 勤怠レコードから「労務費」「人/日」を集計
      attendanceList.forEach((rec) => {
        const projName = rec.project;
        const stat = projectStats[projName];
        if (!stat) return;

        // 日付が範囲内かどうかチェック
        const recDate = rec.date.toDate();
        if (recDate < fromDate || recDate > toDate) return;

        // ユーザーごとに時給を取得して日当を計算
        (rec.users || []).forEach((username) => {
          const hourlyWage = wageMap[username] || 0;
          // 1日8時間として日当を計算
          stat.totalLaborCost += hourlyWage * 8;
          stat.totalPersonDays += 1; // 1人分の日数をカウント
        });
      });

      // 資材レコードから「資材費(総額)」を集計
      materialsRecList.forEach((rec) => {
        const projName = rec.project;
        const stat = projectStats[projName];
        if (!stat) return;

        // 貸出期間が出力期間に重なるかチェック
        const start = rec.lendStart.toDate();
        const end = rec.lendEnd ? rec.lendEnd.toDate() : toDate;
        if (start > toDate || end < fromDate) return;

        // 実際に重なっている期間を計算
        const st = start < fromDate ? fromDate : start;
        const ed = end > toDate ? toDate : end;
        const days = Math.floor((ed - st) / (1000 * 3600 * 24)) + 1;

        (rec.items || []).forEach((it) => {
          const unitPrice = matPriceMap[it] || 0;
          stat.totalMaterialCost += unitPrice * days;
        });
      });

      // 平均日あたり人員数 = totalPersonDays / 工期(日数)
      const rows = [];
      Object.entries(projectStats).forEach(([projName, stat]) => {
        const avgPersonnel =
          stat.durationDays > 0
            ? (stat.totalPersonDays / stat.durationDays).toFixed(2)
            : '0.00';

        rows.push({
          'プロジェクト名': projName,
          '顧客名': stat.clientName,
          '工期(日数)': stat.durationDays.toString(),
          '資材費(総額)': `¥${stat.totalMaterialCost.toLocaleString()}`,
          '労務費(総額)': `¥${stat.totalLaborCost.toLocaleString()}`,
          '平均日あたり人員数': avgPersonnel,
        });
      });

      setExportData(rows);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '集計中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    buildExportData();
  }, [buildExportData]);

  // CSV出力
  const exportCsv = async () => {
    if (exportData.length === 0) {
      Alert.alert('エラー', '出力データがありません');
      return;
    }
    const csv = Papa.unparse({
      fields: headers,
      data: exportData.map((row) => headers.map((h) => row[h])),
    });
    const fileName = `TKC_ProjectCSV_${dayjs().format(
      'YYYYMMDD_HHmmss'
    )}.csv`;
    const fileUri = FileSystem.documentDirectory + fileName;
    await FileSystem.writeAsStringAsync(fileUri, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    await Sharing.shareAsync(fileUri, { mimeType: 'text/csv' });
  };

  // プレビュー表示
  const showPreview = () => {
    if (exportData.length === 0) {
      Alert.alert('エラー', 'プレビュー用データがありません');
      return;
    }
    setPreviewVisible(true);
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {/* 左カラム: CSV設定 */}
      <ScrollView
        style={{ width: '60%' }}
        contentContainerStyle={[tw`p-4`, styles.centerContainer]}
      >
        <Text style={[tw`text-lg font-bold mb-2`, styles.centerText]}>
          出力期間
        </Text>
        <View style={styles.buttonContainer}>
          <Button
            title={`開始日: ${dayjs(fromDate).format('YYYY/MM/DD')}`}
            onPress={() => setShowFromPicker(true)}
          />
          {showFromPicker && (
            <DateTimePicker
              value={fromDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, d) => {
                setShowFromPicker(false);
                if (d) setFromDate(d);
              }}
            />
          )}
        </View>
        <View style={styles.buttonContainer}>
          <Button
            title={`終了日: ${dayjs(toDate).format('YYYY/MM/DD')}`}
            onPress={() => setShowToPicker(true)}
          />
          {showToPicker && (
            <DateTimePicker
              value={toDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, d) => {
                setShowToPicker(false);
                if (d) setToDate(d);
              }}
            />
          )}
        </View>

        <Text style={[tw`text-lg font-bold mt-4 mb-2`, styles.centerText]}>
          フォーマット
        </Text>
        <Text style={[tw`mb-4`, styles.centerText]}>
          プロジェクト別集計 CSV
        </Text>
        <View style={styles.buttonContainer}>
          <Button title="プレビュー" onPress={showPreview} />
        </View>
        <View style={styles.buttonContainer}>
          <Button
            title={loading ? '集計中...' : 'CSV 出力'}
            onPress={exportCsv}
            disabled={loading}
          />
        </View>
      </ScrollView>

      {/* 右カラム: デバッグ情報（必要に応じて表示） */}
      <ScrollView style={{ width: '40%', padding: 16 }}>
        {/* デバッグ表示はオプション */}
      </ScrollView>

      {/* プレビュー用モーダル */}
      <ExportPreviewModal
        visible={previewVisible}
        data={exportData}
        headers={headers}
        onClose={() => setPreviewVisible(false)}
      />
    </View>
  );
}

// プレビュー表示コンポーネント
function ExportPreviewModal({ visible, data, headers, onClose }) {
  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.modalContainer}>
        <Text style={[styles.modalTitle, styles.centerText]}>プレビュー</Text>

        {/* ヘッダー行 */}
        <View style={[styles.row, { backgroundColor: '#f0f0f0' }]}>
          {headers.map((h, idx) => (
            <Text key={idx} style={[styles.cell, { fontWeight: 'bold' }]}>
              {h}
            </Text>
          ))}
        </View>

        <FlatList
          data={data}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => (
            <View style={styles.row}>
              {headers.map((h, idx) => (
                <Text key={idx} style={styles.cell}>
                  {item[h]}
                </Text>
              ))}
            </View>
          )}
        />
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>閉じる</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centerContainer: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  buttonContainer: { width: 240, alignSelf: 'center', marginBottom: 12 },
  modalContainer: { flex: 1, padding: 20, backgroundColor: '#fff' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cell: {
    flex: 1,
    textAlign: 'center',
    borderWidth: 0.5,
    borderColor: '#ccc',
    padding: 4,
  },
  closeBtn: { marginTop: 20, alignSelf: 'center' },
  closeText: { fontSize: 16, color: '#007AFF', textAlign: 'center' },
});
