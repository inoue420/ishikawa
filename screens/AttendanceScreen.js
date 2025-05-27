// screens/AttendanceScreen.js
import React, { useEffect, useState, useCallback, useContext } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Button, Alert, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import tw from 'twrnc';
import { DateContext } from '../DateContext';

const { width } = Dimensions.get('window');

export default function AttendanceScreen() {
  const USER_KEY = '@user_list';
  const PROJECT_KEY = '@project_list';
  const RECORD_KEY = '@attendance_records';

  const { date: selectedDate, setDate } = useContext(DateContext);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const dateKey = date => date.toISOString().slice(0,10);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem('@current_date');
      if (stored) setDate(new Date(stored));
    })();
  }, []);

  const loadData = async () => {
    try {
      const u = await AsyncStorage.getItem(USER_KEY);
      setUsers(u ? JSON.parse(u) : []);
      const p = await AsyncStorage.getItem(PROJECT_KEY);
      setProjects(p ? JSON.parse(p) : []);
      const r = await AsyncStorage.getItem(RECORD_KEY);
      const all = r ? JSON.parse(r) : [];
      setRecords(all.filter(rec => rec.date === dateKey(selectedDate)));
      setSelectedProject('');
      setSelectedUsers([]);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { loadData(); }, [selectedDate]);
  useFocusEffect(useCallback(() => { loadData(); }, [selectedDate]));

  const saveRecords = async list => { await AsyncStorage.setItem(RECORD_KEY, JSON.stringify(list)); };

  const onDateChange = async (_, d) => {
    setShowPicker(false);
    if (d) setDate(d);
  };

  const confirmAttendance = async () => {
    if (!selectedProject) return Alert.alert('入力エラー','プロジェクトを選択してください');
    if (!selectedUsers.length) return Alert.alert('入力エラー','ユーザーを選択してください');
    setLoading(true);
    const newRec = { project: selectedProject, date: dateKey(selectedDate), users: selectedUsers };
    const allR = await AsyncStorage.getItem(RECORD_KEY);
    const arr = allR ? JSON.parse(allR) : [];
    const others = arr.filter(r => !(r.project===selectedProject && r.date===dateKey(selectedDate)));
    await saveRecords([...others, newRec]);
    Alert.alert('成功','出勤を確定しました');
    setLoading(false);
    loadData();
  };

  const editRecord = rec => { setSelectedProject(rec.project); setSelectedUsers(rec.users); };
  const deleteRecord = rec => {
    Alert.alert('確認',`${rec.project} の当日の参加記録を削除しますか？`,[
      { text:'キャンセル', style:'cancel' },
      { text:'削除', style:'destructive', onPress: async () => {
        const allR = await AsyncStorage.getItem(RECORD_KEY);
        const arr = allR ? JSON.parse(allR) : [];
        const filtered = arr.filter(r => !(r.project===rec.project&&r.date===dateKey(selectedDate)));
        await saveRecords(filtered);
        loadData();
      }}
    ]);
  };

  return (
    <View style={tw`flex-1 bg-gray-100`}>
      <View style={tw`flex-row items-center mt-4 p-4 bg-white border-b border-gray-300`}>
        {showPicker && (
          <DateTimePicker value={selectedDate} mode="date" display="default" onChange={onDateChange} />
        )}
        <TouchableOpacity style={tw`flex-1`} onPress={()=>setShowPicker(true)}>
          <Text style={tw`text-lg`}>{dateKey(selectedDate)}</Text>
        </TouchableOpacity>
        <View style={tw`ml-2 w-1/3`}>
          <Button title="更新" onPress={loadData} />
        </View>
      </View>
      <View style={tw`flex-1 flex-row`}>
        <ScrollView style={{width:width*0.6,padding:16}}>
          <Text style={tw`text-2xl font-bold mb-4`}>出勤確定</Text>
          <ScrollView horizontal style={tw`mb-4`}>
            {projects.map((proj,i)=>(
              <TouchableOpacity key={i} style={tw`px-4 py-2 mr-2 rounded ${selectedProject===proj.name?'bg-blue-500':'bg-gray-300'}`} onPress={()=>{setSelectedProject(proj.name);setSelectedUsers([]);}}>
                <Text style={tw`text-white`}>{proj.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={tw`mb-2 font-semibold`}>ユーザー</Text>
          <View style={tw`flex-row flex-wrap mb-6`}>
            {users.map((u,i)=>(
              <TouchableOpacity key={i} style={tw`px-4 py-2 mr-2 mb-2 rounded ${selectedUsers.includes(u.name)?'bg-blue-500':'bg-gray-300'}`} onPress={()=>{setSelectedUsers(sel=>sel.includes(u.name)?sel.filter(x=>x!==u.name):[...sel,u.name]);}}>
                <Text style={tw`text-white`}>{u.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={tw`items-center mb-6`}><View style={{width:'50%'}}>
            <Button title={loading?'...':'確定'} onPress={confirmAttendance} disabled={loading} />
          </View></View>
        </ScrollView>
        <ScrollView style={{width:width*0.4,padding:16}}>
          <Text style={tw`text-2xl font-bold mb-4`}>参加状況</Text>
          {records.map((rec,i)=>(
            <View key={i} style={tw`border border-gray-300 rounded mb-4 p-3`}>
              <Text style={tw`text-lg font-semibold mb-2`}>{rec.project}</Text>
              {rec.users.length?rec.users.map((u,j)=><Text key={j} style={tw`mb-1`}>{u}</Text>):<Text style={tw`text-gray-500`}>参加者なし</Text>}
              <View style={tw`flex-row justify-end mt-2`}>
                <View style={tw`mr-2`}><Button title="編集" onPress={()=>editRecord(rec)}/></View>
                <Button title="削除" color="red" onPress={()=>deleteRecord(rec)}/>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}