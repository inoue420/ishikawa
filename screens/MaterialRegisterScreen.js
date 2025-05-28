// screens/MaterialRegisterScreen.js

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  Alert,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tw from 'twrnc';

const { width } = Dimensions.get('window');
const STORAGE_KEY = '@materials_list';

export default function MaterialRegisterScreen() {
  // materials: { name: string, unitPrice: number }
  const [items, setItems] = useState([]);
  const [nameInput, setNameInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');

  // Load items on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await AsyncStorage.getItem(STORAGE_KEY);
        setItems(data ? JSON.parse(data) : []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const saveItems = async list => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error(e);
    }
  };

  const handleAdd = async () => {
    if (!nameInput.trim()) {
      Alert.alert('入力エラー', '資材名を入力してください');
      return;
    }
    const price = parseFloat(priceInput);
    if (isNaN(price) || price <= 0) {
      Alert.alert('入力エラー', '有効な単価を入力してください');
      return;
    }
    setLoading(true);
    const updated = [...items, { name: nameInput.trim(), unitPrice: price }];
    setItems(updated);
    await saveItems(updated);
    setNameInput('');
    setPriceInput('');
    setLoading(false);
  };

  const handleUpdate = async index => {
    if (!editName.trim()) {
      Alert.alert('入力エラー', '資材名を入力してください');
      return;
    }
    const price = parseFloat(editPrice);
    if (isNaN(price) || price <= 0) {
      Alert.alert('入力エラー', '有効な単価を入力してください');
      return;
    }
    const updated = items.map((it, i) =>
      i === index ? { name: editName.trim(), unitPrice: price } : it
    );
    setItems(updated);
    await saveItems(updated);
    setEditingIndex(-1);
    setEditName('');
    setEditPrice('');
  };

  const handleRemove = async index => {
    Alert.alert(
      '確認',
      '本当にこの資材を削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            const updated = items.filter((_, i) => i !== index);
            setItems(updated);
            await saveItems(updated);
            setEditingIndex(-1);
          },
        },
      ]
    );
  };

  const renderItem = ({ item, index }) => (
    <View style={tw`bg-white p-3 rounded mb-2`}>      
      <TouchableOpacity
        onPress={() => {
          setEditingIndex(index);
          setEditName(item.name);
          setEditPrice(String(item.unitPrice));
        }}
      >
        <Text style={tw`font-bold text-lg`}>{item.name}</Text>
        <Text style={tw`text-gray-600`}>単価: ¥{item.unitPrice}/日</Text>
      </TouchableOpacity>

      {editingIndex === index && (
        <View style={tw`mt-2`}>          
          <TextInput
            style={tw`border border-gray-300 p-2 mb-2 rounded`}
            placeholder="資材名"
            value={editName}
            onChangeText={setEditName}
          />
          <TextInput
            style={tw`border border-gray-300 p-2 mb-2 rounded`}
            placeholder="単価"
            keyboardType="numeric"
            value={editPrice}
            onChangeText={setEditPrice}
          />
          <View style={tw`flex-row justify-between`}>            
            <View style={{ width: '60%' }}>
              <Button title="保存" onPress={() => handleUpdate(index)} />
            </View>
            <View style={{ width: '35%' }}>
              <Button title="除去" color="red" onPress={() => handleRemove(index)} />
            </View>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <View style={tw`flex-1 flex-row bg-gray-100`}>
      {/* 左カラム */}
      <View style={{ width: width * 0.6, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-4`}>資材登録</Text>
        <TextInput
          style={tw`border border-gray-300 p-2 mb-2 rounded`}
          placeholder="資材名"
          value={nameInput}
          onChangeText={setNameInput}
        />
        <TextInput
          style={tw`border border-gray-300 p-2 mb-4 rounded`}
          placeholder="単価 (例: 5000)"
          keyboardType="numeric"
          value={priceInput}
          onChangeText={setPriceInput}
        />
        <View style={tw`items-center mb-6`}>
          <View style={{ width: '50%' }}>
            <Button title={loading ? '...' : '追加'} onPress={handleAdd} disabled={loading} />
          </View>
        </View>
      </View>
      {/* 右カラム */}
      <View style={{ width: width * 0.4, padding: 16 }}>
        <Text style={tw`text-2xl font-bold mb-4`}>登録資材一覧</Text>
        {items.length === 0 ? (
          <Text style={tw`text-center text-gray-500`}>資材がまだありません</Text>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(_, i) => i.toString()}
            renderItem={renderItem}
          />
        )}
      </View>
    </View>
  );
}
