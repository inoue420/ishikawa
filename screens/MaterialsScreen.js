// screens/MaterialsScreen.js

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Button,
  Alert,
  ScrollView,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import tw from 'twrnc';

const { width } = Dimensions.get('window');

export default function MaterialsScreen() {
  const RECORD_KEY = '@materials_records';
  const ITEM_KEY = '@materials_list';
  const PROJECT_KEY = '@project_list';

  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const loadData = async () => {
    try {
      const itemData = await AsyncStorage.getItem(ITEM_KEY);
      setItems(itemData ? JSON.parse(itemData) : []);
      const projData = await AsyncStorage.getItem(PROJECT_KEY);
      setProjects(projData ? JSON.parse(projData) : []);
      const recData = await AsyncStorage.getItem(RECORD_KEY);
      setRecords(recData ? JSON.parse(recData) : []);
    } catch (e) {
      console.error('AsyncStorage load error', e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const saveRecords = async list => {
    try {
      await AsyncStorage.setItem(RECORD_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('AsyncStorage save error', e);
    }
  };

  const handleAction = async type => {
    if (!selectedItem) return Alert.alert('入力エラー', '資材を選択してください');
    if (!selectedProject) return Alert.alert('入力エラー', 'プロジェクトを選択してください');

    setLoading(true);
    const timestamp = new Date().toISOString();
    const newRecord = { item: selectedItem, project: selectedProject, type, timestamp };
    const updated = [newRecord, ...records];
    setRecords(updated);
    await saveRecords(updated);
    Alert.alert('成功', type === 'lend' ? '貸出を記録しました' : '返却を記録しました');
    setShowItemPicker(false);
    setShowProjectPicker(false);
    setLoading(false);
  };

  return (
    <View style={tw`flex-1 flex-row bg-gray-100`}>      
      {/* 左カラム：操作フォーム (60%) */}
      <ScrollView style={{ width: width * 0.6, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-6`}>資材貸出管理</Text>

        <Text style={tw`mb-2 font-semibold`}>資材</Text>
        <TouchableOpacity
          style={tw`bg-white p-4 rounded mb-4 border border-gray-300`}
          onPress={() => setShowItemPicker(v => !v)}
        >
          <Text>{selectedItem || 'タップして選択'}</Text>
        </TouchableOpacity>
        {showItemPicker && (
          <View style={tw`bg-white rounded mb-4 border border-gray-200`}>            
            <Picker
              selectedValue={selectedItem}
              onValueChange={val => { setSelectedItem(val); setShowItemPicker(false); }}
              style={{ height: 200 }}
            >
              <Picker.Item label="選択してください" value="" />
              {items.map((it,i)=>(<Picker.Item key={i} label={it} value={it}/>))}
            </Picker>
          </View>
        )}

        <Text style={tw`mb-2 font-semibold`}>プロジェクト</Text>
        <TouchableOpacity
          style={tw`bg-white p-4 rounded mb-4 border border-gray-300`}
          onPress={() => setShowProjectPicker(v => !v)}
        >
          <Text>{selectedProject || 'タップして選択'}</Text>
        </TouchableOpacity>
        {showProjectPicker && (
          <View style={tw`bg-white rounded mb-4 border border-gray-200`}>            
            <Picker
              selectedValue={selectedProject}
              onValueChange={val => { setSelectedProject(val); setShowProjectPicker(false); }}
              style={{ height: 200 }}
            >
              <Picker.Item label="選択してください" value="" />
              {projects.map((p,i)=>(<Picker.Item key={i} label={p.name} value={p.name}/>))}
            </Picker>
          </View>
        )}

        <View style={tw`items-center mt-4 mb-6`}><View style={{ width: '50%' }}>
          <Button
            title={loading ? '...' : '貸出'}
            onPress={() => handleAction('lend')}
            disabled={loading}
          />
        </View></View>

        <View style={tw`items-center mb-6`}><View style={{ width: '50%' }}>
          <Button
            title={loading ? '...' : '返却'}
            onPress={() => handleAction('return')}
            disabled={loading}
          />
        </View></View>
      </ScrollView>

      {/* 右カラム：履歴一覧 (40%) */}
      <ScrollView style={{ width: width * 0.4, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-4`}>履歴</Text>
        {records.length === 0 ? (
          <Text style={tw`text-center text-gray-500`}>記録がありません</Text>
        ) : (
          records.map((rec,idx)=>(
            <View key={idx} style={tw`bg-white p-3 rounded mb-2 flex-row justify-between`}>              
              <View style={tw`flex-1 pr-2`}>                
                <Text style={tw`font-medium`}>{rec.item}</Text>
                <Text style={tw`text-sm`}>{rec.project}</Text>
                <Text style={tw`text-sm`}>{rec.type==='lend'?'貸出':'返却'}</Text>
              </View>
              <Text style={tw`text-sm text-gray-600`}>{new Date(rec.timestamp).toLocaleString()}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
