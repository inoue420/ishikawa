// screens/phone/InvoiceApprovalDetailScreen.js
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import tw from 'twrnc';
import {
  fetchInvoiceApprovalById,
  approveInvoiceApprovalRequest,
  rejectInvoiceApprovalRequest,
  formatApprovalStatus,
} from '../../billingApprovalService';

export default function InvoiceApprovalDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const approvalId = route?.params?.approvalId;
  const userEmail = String(route?.params?.userEmail || '').trim().toLowerCase();

  const [loading, setLoading] = useState(true);
  const [a, setA] = useState(null);
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const doc = await fetchInvoiceApprovalById(approvalId);
      setA(doc);
    } finally {
      setLoading(false);
    }
  }, [approvalId]);

  useEffect(() => {
    load();
  }, [load]);

  const openPreview = () => {
    if (!a) return;
    const screen = a.templateId === 'shimizu' ? 'InvoiceEditorShimizu' : 'InvoiceEditor';
    // HomeStack 内から Tab(WIP) のネストスクリーンへ遷移
    navigation.navigate('WIP', {
      screen,
      params: {
        projectId: a.projectId,
        stage: a.stage ?? null,
        billingAmount: a.amountExTax ?? null,
        billingId: a.billingId ?? null,
        amount: a.amountExTax ?? null,
      },
    });
  };

  const onApprove = async () => {
    try {
      await approveInvoiceApprovalRequest(approvalId, { approverEmail: userEmail });
      Alert.alert('承認', '承認しました');
      navigation.goBack();
    } catch (e) {
      console.error(e);
      Alert.alert('承認', String(e?.message || e));
    }
  };

  const onReject = async () => {
    try {
      if (!comment.trim()) {
        Alert.alert('差戻し', '差戻し理由を入力してください');
        return;
      }
      await rejectInvoiceApprovalRequest(approvalId, { approverEmail: userEmail, returnComment: comment.trim() });
      Alert.alert('差戻し', '差戻しました');
      navigation.goBack();
    } catch (e) {
      console.error(e);
      Alert.alert('差戻し', String(e?.message || e));
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 items-center justify-center`}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!a) {
    return (
      <SafeAreaView style={tw`flex-1 p-4`}>
        <Text>承認データが見つかりません。</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 p-4`}>
      <View style={tw`bg-white border border-gray-200 rounded p-4`}>
        <Text style={tw`text-lg font-bold`}>{a.projectName || '案件'}</Text>
        <Text style={tw`text-gray-700 mt-1`}>顧客: {a.clientName || '—'}</Text>
        <Text style={tw`text-gray-700`}>区分: {a.billingId ? `出来高 ${a.stage ?? ''}` : '通常請求'}</Text>
        <Text style={tw`text-gray-700`}>税抜: {a.amountExTax ?? '—'}</Text>
        <Text style={tw`text-gray-600 mt-2`}>状態: {formatApprovalStatus(a.status)}</Text>
      </View>

      <TouchableOpacity onPress={openPreview} style={tw`mt-3 px-4 py-3 bg-emerald-200 rounded`}>
        <Text style={tw`text-center`}>請求書プレビュー</Text>
      </TouchableOpacity>

      <View style={tw`mt-4`}>
        <Text style={tw`font-bold mb-2`}>差戻し理由（差戻し時のみ）</Text>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="例）金額根拠が不明なため、内訳を追記してください"
          style={tw`bg-white border border-gray-300 rounded px-3 py-2`}
          multiline
        />
      </View>

      <View style={tw`flex-row mt-4`}>
        <TouchableOpacity onPress={onApprove} style={tw`flex-1 mr-2 px-4 py-3 bg-indigo-200 rounded`}>
          <Text style={tw`text-center`}>承認</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onReject} style={tw`flex-1 ml-2 px-4 py-3 bg-red-200 rounded`}>
          <Text style={tw`text-center`}>差戻し</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
