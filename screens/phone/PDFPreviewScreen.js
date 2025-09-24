// screens/phone/PDFPreviewScreen.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import tw from 'twrnc';

export default function PDFPreviewScreen() {
  const { params } = useRoute();
  const navigation = useNavigation();
  const pdfUri = params?.pdfUri;
  const fileName = params?.fileName || 'invoice.pdf';

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  
  return (
    <View style={tw`flex-1 bg-white`}>
      {Platform.OS === 'android' ? (
        <View style={tw`flex-1 items-center justify-center p-4`}>
          <Text>Androidでは端末のPDFビューアで開きます。</Text>
          <TouchableOpacity
            onPress={async () => {
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(pdfUri, { dialogTitle: 'PDFを開く' });
              }
            }}
            style={tw`mt-4 px-4 py-2 bg-indigo-200 rounded`}
          >
            <Text>開く</Text>
          </TouchableOpacity>
        </View>
      ) : pdfUri ? (
        <>
          {loading && (
            <View style={tw`absolute inset-0 items-center justify-center`}>
              <ActivityIndicator />
            </View>
          )}
          <WebView
            originWhitelist={['*']}
            source={{ uri: pdfUri }}   // ← 生成した file:// をそのまま表示
            style={tw`flex-1`}
            onLoadStart={() => { setLoading(true); setErr(null); }}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setLoading(false); setErr('PDFを表示できませんでした'); }}
          />
          {!!err && (
            <View style={tw`absolute bottom-3 left-0 right-0 items-center`}>
              <View style={tw`bg-red-100 px-3 py-2 rounded`}>
                <Text style={tw`text-red-700`}>{err}</Text>
              </View>
            </View>
          )}
        </>
      ) : (
        <View style={tw`flex-1 items-center justify-center p-4`}>
          <Text>PDFのURIがありません。</Text>
        </View>
      )}
      <View style={tw`p-3 border-t bg-white`}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={tw`px-4 py-2 border rounded self-start`}>
          <Text>戻る</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
