// screens/phone/MaterialRegisterScreen.js
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  ScrollView,
  Alert,
  TouchableOpacity,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import tw from 'twrnc';
import {
  fetchMaterialsList,
  addMaterialListItem,
  updateMaterial,
  deleteMaterial,
} from '../../firestoreService';

export default function MaterialRegisterScreen() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [name1List, setName1List] = useState([]);
  const [name2List, setName2List] = useState([]);

  const [selectedCat, setSelectedCat] = useState('');
  const [selectedName1, setSelectedName1] = useState('');
  const [selectedName2, setSelectedName2] = useState('');
  const [partNoInput, setPartNoInput] = useState('');
  const [expandedCats, setExpandedCats] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({ category: '', name1: '', name2: '', partNo: '' });

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const scrollRef = useRef(null);

  const loadItems = useCallback(async () => {
    try {
      const list = await fetchMaterialsList();
      setItems(list);
      const cats = [...new Set(list.map(i => i.category))];
      setCategories(cats);
      setExpandedCats(cats.reduce((acc, c) => ({ ...acc, [c]: false }), {}));
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '資材データの取得に失敗しました');
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadItems();
    setRefreshing(false);
  }, [loadItems]);

  useEffect(() => {
    setName1List(
      selectedCat
        ? [...new Set(items.filter(i => i.category === selectedCat).map(i => i.name1))]
        : []
    );
    setSelectedName1('');
    setSelectedName2('');
  }, [selectedCat, items]);

  useEffect(() => {
    setName2List(
      selectedCat && selectedName1
        ? [...new Set(
            items.filter(i => i.category === selectedCat && i.name1 === selectedName1).map(i => i.name2)
          )]
        : []
    );
    setSelectedName2('');
  }, [selectedName1, items, selectedCat]);

  const handleAdd = async () => {
    if (!selectedCat.trim() || !selectedName1.trim() || !selectedName2.trim() || !partNoInput.trim()) {
      Alert.alert('入力エラー', '全ての項目を選択または入力してください');
      return;
    }
    setLoading(true);
    try {
      await addMaterialListItem({
        category: selectedCat.trim(),
        name1: selectedName1.trim(),
        name2: selectedName2.trim(),
        partNo: partNoInput.trim(),
      });
      setSelectedCat(''); setSelectedName1(''); setSelectedName2(''); setPartNoInput('');
      loadItems();
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '追加に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    const { category, name1, name2, partNo } = editFields;
    if (!category.trim() || !name1.trim() || !name2.trim() || !partNo.trim()) {
      Alert.alert('入力エラー', '全ての項目を入力してください');
      return;
    }
    setLoading(true);
    try {
      await updateMaterial(editingId, editFields);
      setEditingId(null);
      loadItems();
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = id => {
    Alert.alert('確認', '削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: async () => {
        setLoading(true);
        try { await deleteMaterial(id); loadItems(); scrollRef.current?.scrollTo({ y: 0, animated: true }); } catch { Alert.alert('エラー','削除失敗'); } finally { setLoading(false); }
      }}
    ]);
  };

  const renderItem = (item, idx) => (
    <View key={`${item.id}-${idx}`} style={tw`bg-white p-3 rounded mb-2`}>      
      <TouchableOpacity onPress={() => {
        setEditingId(item.id);
        setEditFields({ category: item.category, name1: item.name1, name2: item.name2, partNo: item.partNo });
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }}>
        <Text style={tw`font-bold`}>{`${item.name1} / ${item.name2} / ${item.partNo}`}</Text>
      </TouchableOpacity>
      {editingId === item.id && (
        <View style={tw`mt-2 bg-gray-50 p-2 rounded`}>
          <TextInput
            style={tw`border mb-2 p-2 rounded`}
            placeholder="大分類"
            value={editFields.category}
            onChangeText={v=>setEditFields(f=>({...f,category:v}))}
            autoCorrect={false}
            autoCompleteType="off"
            blurOnSubmit={false}
            returnKeyType="done"
          />
          <TextInput
            style={tw`border mb-2 p-2 rounded`}
            placeholder="品名1"
            value={editFields.name1}
            onChangeText={v=>setEditFields(f=>({...f,name1:v}))}
            autoCorrect={false}
            autoCompleteType="off"
            blurOnSubmit={false}
            returnKeyType="done"
          />
          <TextInput
            style={tw`border mb-2 p-2 rounded`}
            placeholder="品名2"
            value={editFields.name2}
            onChangeText={v=>setEditFields(f=>({...f,name2:v}))}
            autoCorrect={false}
            autoCompleteType="off"
            blurOnSubmit={false}
            returnKeyType="done"
          />
          <TextInput
            style={tw`border mb-2 p-2 rounded`}
            placeholder="品番"
            value={editFields.partNo}
            onChangeText={v=>setEditFields(f=>({...f,partNo:v}))}
            autoCorrect={false}
            autoCompleteType="off"
            blurOnSubmit={false}
            returnKeyType="done"
          />
          <View style={tw`flex-row justify-between`}>
            <View style={{ flex: 1, marginRight: 4 }}><Button title="保存" onPress={handleUpdate} /></View>
            <View style={{ flex: 1, marginLeft: 4 }}><Button title="削除" color="red" onPress={()=>handleDelete(item.id)} /></View>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView style={tw`flex-1`} behavior={Platform.OS==='ios'?'padding':undefined} keyboardVerticalOffset={80}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={tw`bg-gray-100`}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh}/>}
      >
        {/* 入力フォーム */}
        <View style={tw`p-4 bg-white mb-2`}>
          <Text style={tw`mb-1`}>大分類（選択または新規入力）</Text>
          <TextInput
            style={tw`border mb-2 p-2 rounded`}
            placeholder="大分類"
            value={selectedCat}
            onChangeText={setSelectedCat}
            autoCorrect={false}
            autoCompleteType="off"
            blurOnSubmit={false}
            returnKeyType="done"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-4`}>
            {categories.map((c,i) => (
              <TouchableOpacity
                key={`${c}-${i}`}
                style={tw`px-3 py-1 m-1 rounded ${selectedCat===c?'bg-blue-500':'bg-gray-300'}`}
                onPress={()=>setSelectedCat(c)}
              >
                <Text>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={tw`mb-1`}>品名1（選択または新規入力）</Text>
          <TextInput
            style={tw`border mb-2 p-2 rounded`}
            placeholder="品名1"
            value={selectedName1}
            onChangeText={setSelectedName1}
            autoCorrect={false}
            autoCompleteType="off"
            blurOnSubmit={false}
            returnKeyType="done"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-4`}>
            {name1List.map((n1,i) => (
              <TouchableOpacity
                key={`${n1}-${i}`}
                style={tw`px-3 py-1 m-1 rounded ${selectedName1===n1?'bg-blue-500':'bg-gray-300'}`}
                onPress={()=>setSelectedName1(n1)}
              >
                <Text>{n1}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={tw`mb-1`}>品名2（選択または新規入力）</Text>
          <TextInput
            style={tw`border mb-2 p-2 rounded`}
            placeholder="品名2"
            value={selectedName2}
            onChangeText={setSelectedName2}
            autoCorrect={false}
            autoCompleteType="off"
            blurOnSubmit={false}
            returnKeyType="done"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-4`}>
            {name2List.map((n2,i) => (
              <TouchableOpacity
                key={`${n2}-${i}`}
                style={tw`px-3 py-1 m-1 rounded ${selectedName2===n2?'bg-blue-500':'bg-gray-300'}`}
                onPress={()=>setSelectedName2(n2)}
              >
                <Text>{n2}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={tw`mb-1`}>品番</Text>
          <TextInput
            style={tw`border mb-4 p-2 rounded`}
            placeholder="品番を入力"
            value={partNoInput}
            onChangeText={setPartNoInput}
            autoCorrect={false}
            autoCompleteType="off"
            blurOnSubmit={false}
            returnKeyType="done"
          />

          <Button title={loading?'...':'追加'} onPress={handleAdd} disabled={loading} />
        </View>

        {/* Grouped list */}
        {categories.map((cat, ci) => (
          <View key={`${cat}-${ci}`} style={tw`mb-4`}>
            <TouchableOpacity
              style={tw`bg-blue-200 p-3 rounded`}
              onPress={() => setExpandedCats(ec => ({ ...ec, [cat]: !ec[cat] }))}
            >
              <Text style={tw`font-bold text-lg`}>{cat}</Text>
            </TouchableOpacity>
            {expandedCats[cat] && (
              items.filter(i => i.category === cat)
                   .map((i, idx) => renderItem(i, idx))
            )}
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
