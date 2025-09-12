// screens/phone/VehicleRegisterScreen.js
import React, { useEffect, useMemo, useState } from 'react';
import { Timestamp } from 'firebase/firestore'; // ★ 追加
import { View, Text, TextInput, Alert, TouchableOpacity, Platform, ScrollView } from 'react-native';
import tw from 'twrnc';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import {
  fetchVehicles, setVehicle, deleteVehicle,
  addVehicleBlock, fetchVehicleBlocksOverlapping,
} from '../../firestoreService';

const PH_TYPE = '__placeholder__';

export default function VehicleRegisterScreen() {
  const [vehicles, setVehicles] = useState([]);
  const [name, setName] = useState('');
  const [plateNo, setPlateNo] = useState('');
  const [vehicleType, setVehicleType] = useState('sales'); // ★ 追加：既定は営業車
  const [memo, setMemo] = useState('');
  const [loading, setLoading] = useState(false);

  const [blkVehicleId, setBlkVehicleId] = useState(PH_TYPE);
  const [blkType, setBlkType] = useState(PH_TYPE); // inspection / repair
  const [blkStart, setBlkStart] = useState(new Date());
  const [blkEnd, setBlkEnd] = useState(new Date());
  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd] = useState(false);

  const load = async () => {
    const list = await fetchVehicles();
    setVehicles(list);
  };
  useEffect(() => { load(); }, []);

  const submitVehicle = async () => {
    if (!name.trim()) return Alert.alert('入力エラー', '車両名を入力してください');
    setLoading(true);
    try {
      await setVehicle(null, {
        name: name.trim(),
        plateNo: plateNo.trim(),
        vehicleType,       // ★ 追加
        memo: memo.trim(),
      });
      setName(''); setPlateNo(''); setMemo('');
      setVehicleType('sales');
      await load();
      Alert.alert('成功', '車両を追加しました');
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '車両の追加に失敗しました');
    } finally { setLoading(false); }
  };

  const submitBlock = async () => {
    if (blkVehicleId === PH_TYPE || blkType === PH_TYPE) {
      return Alert.alert('入力エラー', '車両と区分を選択してください');
    }
    if (blkEnd < blkStart) return Alert.alert('入力エラー', '終了日は開始日以降にしてください');
    try {
      await addVehicleBlock({
        vehicleId: blkVehicleId,
        type: blkType, // 'inspection' | 'repair'
        startDate: Timestamp.fromDate(blkStart),
        endDate:   Timestamp.fromDate(blkEnd),
        note: '',
      });
      Alert.alert('成功', '車検/修理期間を登録しました');
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '期間登録に失敗しました');
    }
  };

  return (
    <ScrollView style={tw`flex-1 p-3`}>
      <Text style={tw`text-xl font-bold mb-2`}>車両登録</Text>

      <Text>車両名</Text>
      <TextInput value={name} onChangeText={setName} style={tw`border p-2 mb-2 rounded`} />
      <Text>ナンバー</Text>
      <TextInput value={plateNo} onChangeText={setPlateNo} style={tw`border p-2 mb-2 rounded`} />
      {/* ★ 追加：区分（営業車 / 積載車） */}
      <Text>区分</Text>
      <View style={tw`flex-row mb-2`}>
        <TouchableOpacity
          onPress={() => setVehicleType('sales')}
          activeOpacity={0.7}
          style={tw.style(
            'border rounded px-4 py-2 mr-2',
            vehicleType === 'sales' ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'
          )}
        >
          <Text>{vehicleType === 'sales' ? '● ' : '○ '}営業車</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setVehicleType('cargo')}
          activeOpacity={0.7}
          style={tw.style(
            'border rounded px-4 py-2',
            vehicleType === 'cargo' ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'
          )}
        >
          <Text>{vehicleType === 'cargo' ? '● ' : '○ '}積載車</Text>
        </TouchableOpacity>
      </View>      
      <Text>メモ</Text>
      <TextInput value={memo} onChangeText={setMemo} style={tw`border p-2 mb-2 rounded`} />
      <TouchableOpacity onPress={submitVehicle} activeOpacity={0.7} style={tw`bg-blue-600 rounded p-3 mb-6 items-center`}>
        <Text style={tw`text-white font-bold`}>{loading ? '保存中...' : '車両を追加'}</Text>
      </TouchableOpacity>

      <Text style={tw`text-xl font-bold mb-2`}>車検・修理 登録（使用不可期間）</Text>
      <Text>車両</Text>
      <View style={tw`border rounded mb-2 overflow-hidden`}>
        <Picker selectedValue={blkVehicleId} onValueChange={setBlkVehicleId}>
          <Picker.Item label="選択してください" value={PH_TYPE} color="#9ca3af" />
          {vehicles.map(v => <Picker.Item key={v.id} label={v.name} value={v.id} />)}
        </Picker>
      </View>
      <Text>区分</Text>
      <View style={tw`border rounded mb-2 overflow-hidden`}>
        <Picker selectedValue={blkType} onValueChange={setBlkType}>
          <Picker.Item label="選択してください" value={PH_TYPE} color="#9ca3af" />
          <Picker.Item label="車検" value="inspection" />
          <Picker.Item label="修理" value="repair" />
        </Picker>
      </View>

      <Text>開始日</Text>
      <TouchableOpacity onPress={() => setShowStart(true)} activeOpacity={0.7} style={tw`border p-2 mb-2 rounded`}>
        <Text>{blkStart.toLocaleDateString()}</Text>
      </TouchableOpacity>
      {showStart && (
        <DateTimePicker mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'calendar'} value={blkStart}
          onChange={(_e, d) => { setShowStart(false); d && setBlkStart(d); }} />
      )}

      <Text>終了日</Text>
      <TouchableOpacity onPress={() => setShowEnd(true)} activeOpacity={0.7} style={tw`border p-2 mb-2 rounded`}>
        <Text>{blkEnd.toLocaleDateString()}</Text>
      </TouchableOpacity>
      {showEnd && (
        <DateTimePicker mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'calendar'} value={blkEnd}
          onChange={(_e, d) => { setShowEnd(false); d && setBlkEnd(d); }} />
      )}

      <TouchableOpacity onPress={submitBlock} activeOpacity={0.7} style={tw`bg-blue-600 rounded p-3 items-center`}>
        <Text style={tw`text-white font-bold`}>期間を登録</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
