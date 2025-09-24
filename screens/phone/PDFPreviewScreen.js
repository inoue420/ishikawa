// screens/phone/PDFPreviewScreen.js
import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import tw from 'twrnc';

export default function PDFPreviewScreen() {
  const { params } = useRoute();
  const navigation = useNavigation();
  const pdfUri = params?.pdfUri;
  const fileName = params?.fileName || 'invoice.pdf';

  return (
    <View style={tw`flex-1 bg-white`}>
      {Platform.OS === 'ios' ? (
        <WebView
          source={{ uri: pdfUri }}
          style={tw`flex-1`}
        />
      ) : (
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
      )}
      <View style={tw`p-3 border-t bg-white`}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={tw`px-4 py-2 border rounded self-start`}>
          <Text>戻る</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
