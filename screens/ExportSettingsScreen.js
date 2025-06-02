import React, { useState, useEffect } from 'react';
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
  Switch
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Papa from 'papaparse';
import dayjs from 'dayjs';
import tw from 'twrnc';

// 出力可能項目定義 (key: データキー, label: CSVヘッダー名)
const exportFieldDefs = [
  { key: 'date',         label: '伝票日付',       default: true },
  { key: 'debitAccount', label: '借方勘定科目',   default: true },
  { key: 'creditAccount',label: '貸方勘定科目',   default: true },
  { key: 'amount',       label: '金額',           default: true },
  { key: 'description',  label: '摘要',           default: true }
];

export default function ExportSettingsScreen() {
  const [fromDate, setFromDate] = useState(new Date());
  const [toDate, setToDate] = useState(new Date());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [availableFieldDefs, setAvailableFieldDefs] = useState([]);
  const [selectedFields, setSelectedFields] = useState({});
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewData, setPreviewData] = useState([]);
  const [debugData, setDebugData] = useState([]);
  const [totalSize, setTotalSize] = useState(0);

  // 初期化: 利用可能なフィールドと選択状態、デバッグ情報
  useEffect(() => {
    (async () => {
      const data = await fetchTransactions(fromDate, toDate);
      if (data.length > 0) {
        const keys = Object.keys(data[0]);
        const available = exportFieldDefs.filter(def => keys.includes(def.key));
        setAvailableFieldDefs(available);
        const initSel = {};
        available.forEach(def => initSel[def.key] = def.default);
        setSelectedFields(initSel);
      }
      const keys = await AsyncStorage.getAllKeys();
      const stores = await AsyncStorage.multiGet(keys);
      let total = 0;
      const debugArr = stores.map(([key, value]) => {
        let parsed;
        try { parsed = JSON.parse(value); } catch { parsed = value || null; }
        const count = Array.isArray(parsed) ? parsed.length : (parsed && typeof parsed === 'object' ? Object.keys(parsed).length : 0);
        const size = value ? value.length : 0;
        total += size;
        return { key, value: parsed, count, size };
      });
      setDebugData(debugArr);
      setTotalSize(total);
    })();
  }, [fromDate, toDate]);

  // ダミー: 実運用ではDB等から取得
  async function fetchTransactions(from, to) {
    return [
      { date: from, debitAccount: '売上高', creditAccount: '売掛金', amount: 50000, description: 'テスト売上' }
    ];
  }

  const showPreview = async () => {
    const data = await fetchTransactions(fromDate, toDate);
    setPreviewData(data);
    setPreviewVisible(true);
  };

  const exportCsv = async () => {
    const data = await fetchTransactions(fromDate, toDate);
    const headers = availableFieldDefs.map(def => def.label);
    const rows = data.map(item => {
      const row = {};
      availableFieldDefs.forEach(def => {
        const raw = item[def.key];
        row[def.label] = def.key === 'date' ? dayjs(raw).format('YYYYMMDD') : String(raw);
      });
      return row;
    });
    const csv = Papa.unparse({ fields: headers, data: rows });
    const fileName = `TKC_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
    const fileUri = FileSystem.documentDirectory + fileName;
    await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(fileUri, { mimeType: 'text/csv' });
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {/* 左カラム: CSV設定 */}
      <ScrollView style={{ width: '60%' }} contentContainerStyle={[tw`p-4`, styles.centerContainer]}>
        <Text style={[tw`text-lg font-bold mb-2`, styles.centerText]}>出力期間</Text>
        <View style={styles.buttonContainer}>
          <Button title={`開始日: ${dayjs(fromDate).format('YYYY/MM/DD')}`} onPress={() => setShowFromPicker(true)} />
          {showFromPicker && <DateTimePicker value={fromDate} mode="date" display="default" onChange={(_, d) => { setShowFromPicker(false); d && setFromDate(d); }} />}
        </View>
        <View style={styles.buttonContainer}>
          <Button title={`終了日: ${dayjs(toDate).format('YYYY/MM/DD')}`} onPress={() => setShowToPicker(true)} />
          {showToPicker && <DateTimePicker value={toDate} mode="date" display="default" onChange={(_, d) => { setShowToPicker(false); d && setToDate(d); }} />}
        </View>
        <Text style={[tw`text-lg font-bold mt-4 mb-2`, styles.centerText]}>出力項目選択</Text>
        {availableFieldDefs.map(def => (
          <View key={def.key} style={styles.switchRow}>
            <Text style={styles.switchLabel}>{def.label}</Text>
            <Switch value={selectedFields[def.key]} onValueChange={val => setSelectedFields(prev => ({ ...prev, [def.key]: val }))} />
          </View>
        ))}
        <Text style={[tw`text-lg font-bold mt-4 mb-2`, styles.centerText]}>フォーマット</Text>
        <Text style={[tw`mb-4`, styles.centerText]}>TKC_売上CSV</Text>
        <View style={styles.buttonContainer}><Button title="プレビュー" onPress={showPreview} /></View>
        <View style={styles.buttonContainer}><Button title="CSV 出力" onPress={exportCsv} /></View>
        <ExportPreviewModal visible={previewVisible} data={previewData} availableDefs={availableFieldDefs} onClose={() => setPreviewVisible(false)} />
      </ScrollView>
      {/* 右カラム: デバッグ情報 */}
      <ScrollView style={{ width: '40%', padding: 16 }}>
        <Text style={tw`text-xl font-bold mb-4`}>Storage Debug Info</Text>
        <Text style={tw`mb-2`}>Total Size: {totalSize} chars</Text>
        {debugData.map(item => (
          <View key={item.key} style={{ marginBottom: 12 }}>
            <Text style={tw`font-bold`}>{item.key} ({item.count} items, {item.size} chars)</Text>
            <Text numberOfLines={2}>{JSON.stringify(item.value)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// プレビュー用モーダル
function ExportPreviewModal({ visible, data, availableDefs, onClose }) {
  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.modalContainer}>
        <Text style={[styles.modalTitle, styles.centerText]}>プレビュー</Text>
        <FlatList data={data} keyExtractor={(_, i) => i.toString()} renderItem={({ item }) => (
          <View style={styles.row}>
            {availableDefs.map(def => {
              const raw = item[def.key];
              const display = def.key === 'date' ? dayjs(raw).format('YYYY/MM/DD') : String(raw);
              return <Text key={def.key} style={styles.cell}>{display}</Text>;
            })}
          </View>
        )} />
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}><Text style={styles.closeText}>閉じる</Text></TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centerContainer: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  buttonContainer: { width: 240, alignSelf: 'center', marginBottom: 12 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', width: 240, marginVertical: 4 },
  switchLabel: { fontSize: 16 },
  modalContainer: { flex: 1, padding: 20, backgroundColor: '#fff' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cell: { flex: 1, textAlign: 'center' },
  closeBtn: { marginTop: 20, alignSelf: 'center' },
  closeText: { fontSize: 16, color: '#007AFF', textAlign: 'center' }
});
