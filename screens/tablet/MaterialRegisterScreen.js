// screens/MaterialRegisterScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  Alert,
  Dimensions,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import tw from 'twrnc';
import {
  fetchMaterialsList,
  addMaterialListItem,
  updateMaterial,
  deleteMaterial,
} from '../../firestoreService';

const { width } = Dimensions.get('window');

export default function MaterialRegisterScreen() {
  // materials: { id: string, name: string, unitPrice: number }
  const [items, setItems] = useState([]);
  const [nameInput, setNameInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');

  // Load materials from Firestore
  const loadItems = useCallback(async () => {
    try {
      const list = await fetchMaterialsList();
      setItems(list);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '資材データの取得に失敗しました');
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadItems();
    setRefreshing(false);
  }, [loadItems]);

  // Add new material
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
    try {
      await addMaterialListItem({ name: nameInput.trim(), unitPrice: price });
      setNameInput('');
      setPriceInput('');
      await loadItems();
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '資材の追加に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // Save edits
  const handleUpdate = async () => {
    if (!editName.trim()) {
      Alert.alert('入力エラー', '資材名を入力してください');
      return;
    }
    const price = parseFloat(editPrice);
    if (isNaN(price) || price <= 0) {
      Alert.alert('入力エラー', '有効な単価を入力してください');
      return;
    }
    setLoading(true);
    try {
      await updateMaterial(editingId, { name: editName.trim(), unitPrice: price });
      setEditingId(null);
      setEditName('');
      setEditPrice('');
      await loadItems();
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // Delete material
  const handleRemove = (id) => {
    Alert.alert(
      '確認',
      '本当にこの資材を削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await deleteMaterial(id);
              setEditingId(null);
              await loadItems();
            } catch (e) {
              console.error(e);
              Alert.alert('エラー', '削除に失敗しました');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // Render each material
  const renderItem = ({ item }) => (
    <View style={tw`bg-white p-3 rounded mb-2`}>
      <TouchableOpacity
        onPress={() => {
          setEditingId(item.id);
          setEditName(item.name);
          setEditPrice(String(item.unitPrice));
        }}
      >
        <Text style={tw`font-bold text-lg`}>{item.name}</Text>
        <Text style={tw`text-gray-600`}>単価: ¥{item.unitPrice}/日</Text>
      </TouchableOpacity>

      {editingId === item.id && (
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
              <Button title="保存" onPress={handleUpdate} />
            </View>
            <View style={{ width: '35%' }}>
              <Button title="除去" color="red" onPress={() => handleRemove(item.id)} />
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
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          />
        )}
      </View>
    </View>
  );
}