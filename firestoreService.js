// firestoreService.js

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebaseConfig';

const usersCol           = collection(db, 'users');
const projectsCol        = collection(db, 'projects');
const attendanceCol      = collection(db, 'attendanceRecords');
const materialsListCol   = collection(db, 'materialsList');
const materialsRecCol    = collection(db, 'materialsRecords');
const companyProfileCol  = collection(db, 'companyProfile');

/**
 * ============================================
 * Company Profile (会社情報)
 * ============================================
 */
export async function fetchCompanyProfile() {
  const docRef = doc(companyProfileCol, 'default');
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function setCompanyProfile(data) {
  const docRef = doc(companyProfileCol, 'default');
  await setDoc(docRef, data);
}

/**
 * ============================================
 * Users コレクション
 * ============================================
 */
export async function fetchUsers() {
  const snapshot = await getDocs(usersCol);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function fetchUserById(userId) {
  const docRef = doc(usersCol, userId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function addUser(userData) {
  const ref = await addDoc(usersCol, userData);
  return ref.id;
}

export async function updateUser(userId, updatedFields) {
  const docRef = doc(usersCol, userId);
  await updateDoc(docRef, updatedFields);
}

export async function deleteUser(userId) {
  const docRef = doc(usersCol, userId);
  await deleteDoc(docRef);
}

/**
 * ============================================
 * Projects コレクション
 * ============================================
 */
export async function fetchProjects() {
  const snapshot = await getDocs(projectsCol);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function fetchProjectById(projectId) {
  const docRef = doc(projectsCol, projectId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function setProject(projectId, projectData) {
  const docRef = projectId
    ? doc(projectsCol, projectId)
    : doc(projectsCol);
  const dataToSave = {
    ...projectData,
    startDate: projectData.startDate instanceof Date
      ? Timestamp.fromDate(projectData.startDate)
      : projectData.startDate,
    endDate: projectData.endDate instanceof Date
      ? Timestamp.fromDate(projectData.endDate)
      : projectData.endDate,
  };
  await setDoc(docRef, dataToSave);
}

export async function deleteProject(projectId) {
  const docRef = doc(projectsCol, projectId);
  await deleteDoc(docRef);
}

/**
 * ============================================
 * Attendance Records (勤怠レコード) コレクション
 * ============================================
 */
export async function fetchAttendanceRecords(targetDate = null) {
  let q = attendanceCol;
  if (targetDate) {
    const dateStr = targetDate.toISOString().slice(0, 10);
    q = query(attendanceCol, where('dateStr', '==', dateStr));
  }
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function addAttendanceRecord(recordData) {
  const date = recordData.date instanceof Date
    ? recordData.date
    : recordData.date.toDate();
  const dataToSave = {
    project: recordData.project,
    date: Timestamp.fromDate(date),
    dateStr: date.toISOString().slice(0, 10),
    users: recordData.users,
  };
  const ref = await addDoc(attendanceCol, dataToSave);
  return ref.id;
}

export async function deleteAttendanceRecord(recordId) {
  const docRef = doc(attendanceCol, recordId);
  await deleteDoc(docRef);
}

/**
 * ============================================
 * Materials List (資材マスタ) コレクション
 * ============================================
 */
export async function fetchMaterialsList() {
  const snapshot = await getDocs(materialsListCol);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function addMaterialListItem(data) {
  const ref = await addDoc(materialsListCol, data);
  return ref.id;
}

export async function updateMaterial(materialId, updatedFields) {
  const docRef = doc(materialsListCol, materialId);
  await updateDoc(docRef, updatedFields);
}

export async function deleteMaterial(materialId) {
  const docRef = doc(materialsListCol, materialId);
  await deleteDoc(docRef);
}

/**
 * ============================================
 * Materials Records (資材使用レコード) コレクション
 * ============================================
 */
export async function fetchMaterialsRecords() {
  const snapshot = await getDocs(materialsRecCol);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function addMaterialRecord(recordData) {
  const dataToSave = {
    ...recordData,
    lendStart: recordData.lendStart instanceof Date
      ? Timestamp.fromDate(recordData.lendStart)
      : recordData.lendStart,
    lendEnd: recordData.lendEnd instanceof Date
      ? Timestamp.fromDate(recordData.lendEnd)
      : recordData.lendEnd || null,
    timestamp: recordData.timestamp instanceof Date
      ? Timestamp.fromDate(recordData.timestamp)
      : recordData.timestamp,
  };
  const ref = await addDoc(materialsRecCol, dataToSave);
  return ref.id;
}

export async function updateMaterialRecord(recordId, updatedData) {
  const dataToSave = {
    lendStart: updatedData.lendStart instanceof Date
      ? Timestamp.fromDate(updatedData.lendStart)
      : updatedData.lendStart,
    lendEnd: updatedData.lendEnd instanceof Date
      ? Timestamp.fromDate(updatedData.lendEnd)
      : updatedData.lendEnd,
  };
  const docRef = doc(materialsRecCol, recordId);
  await updateDoc(docRef, dataToSave);
}

export async function deleteMaterialRecord(recordId) {
  const docRef = doc(materialsRecCol, recordId);
  await deleteDoc(docRef);
}
