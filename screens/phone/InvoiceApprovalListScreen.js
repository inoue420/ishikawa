// screens/phone/InvoiceApprovalListScreen.js
import React, { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import tw from 'twrnc';
import { fetchPendingInvoiceApprovals, formatApprovalStatus } from '../../billingApprovalService';

export default function InvoiceApprovalListScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const userEmail = String(route?.params?.userEmail || '').trim().toLowerCase();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState([]);

  const load = useCallback(async ({ showLoading = true } = {}) => {
    if (!userEmail) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    try {
      const list = await fetchPendingInvoiceApprovals(userEmail, { limit: 100 });
      setItems(list);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [userEmail]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load({ showLoading: false });
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 items-center justify-center`}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1`}>
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={tw`p-4`}
        ListHeaderComponent={
          <View style={tw`mb-3`}>
            <Text style={tw`text-lg font-bold`}>請求書 承認待ち</Text>
            <Text style={tw`text-gray-600 mt-1`}>あなた宛の承認依頼：{items.length}件</Text>
          </View>
        }
        renderItem={({ item }) => {
          const title = item.billingId
            ? `${item.projectName || '案件'}（出来高 ${item.stage ?? ''}）`
            : `${item.projectName || '案件'}（通常請求）`;
          return (
            <TouchableOpacity
              onPress={() => navigation.navigate('InvoiceApprovalDetail', { approvalId: item.id, userEmail })}
              style={tw`bg-white border border-gray-200 rounded p-3 mb-2`}
            >
              <Text style={tw`font-bold`}>{title}</Text>
              <Text style={tw`text-gray-700 mt-1`}>顧客: {item.clientName || '—'}</Text>
              <Text style={tw`text-gray-700`}>税抜: {item.amountExTax ?? '—'}</Text>
              <Text style={tw`text-gray-600 mt-1`}>状態: {formatApprovalStatus(item.status)}</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={tw`text-gray-600`}>承認待ちはありません。</Text>}
      />
    </SafeAreaView>
  );
}

