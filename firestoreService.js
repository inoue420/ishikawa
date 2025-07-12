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

// コレクション定義
const usersCol           = collection(db, 'users');
const projectsCol        = collection(db, 'projects');
const attendanceCol      = collection(db, 'attendanceRecords');
const materialsListCol   = collection(db, 'materialsList');
const materialsRecCol    = collection(db, 'materialsRecords');
const companyProfileCol  = collection(db, 'companyProfile');

/** ============================================
 * Company Profile (会社情報)
 * ============================================ */
export async function fetchCompanyProfile() {
  const docRef = doc(companyProfileCol, 'default');
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}
export async function setCompanyProfile(data) {
  const docRef = doc(companyProfileCol, 'default');
  return setDoc(docRef, data);
}

/** ============================================
 * Users コレクション
 * ============================================ */
export async function fetchUsers() {
  const snaps = await getDocs(usersCol);
  return snaps.docs.map(d => ({ id: d.id, ...d.data() }));
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
  const ref = doc(usersCol, userId);
  return updateDoc(ref, updatedFields);
}
export async function deleteUser(userId) {
  const ref = doc(usersCol, userId);
  return deleteDoc(ref);
}

/** ============================================
 * Projects コレクション
 * ============================================ */
export async function fetchProjects() {
  const snaps = await getDocs(projectsCol);
  return snaps.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function fetchProjectById(projectId) {
  const docRef = doc(projectsCol, projectId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}
export async function setProject(projectId, projectData) {
  const docRef = projectId ? doc(projectsCol, projectId) : doc(projectsCol);
  const dataToSave = {
    ...projectData,
    startDate: projectData.startDate instanceof Date
      ? Timestamp.fromDate(projectData.startDate)
      : projectData.startDate,
    endDate: projectData.endDate instanceof Date
      ? Timestamp.fromDate(projectData.endDate)
      : projectData.endDate,
  };
  return setDoc(docRef, dataToSave);
}
export async function deleteProject(projectId) {
  const docRef = doc(projectsCol, projectId);
  return deleteDoc(docRef);
}

/** ============================================
 * Attendance Records (勤怠レコード)
 * ============================================ */
export async function fetchAttendanceRecords(targetDate = null) {
  let q = attendanceCol;
  if (targetDate) {
    const dateStr = targetDate.toISOString().slice(0, 10);
    q = query(attendanceCol, where('dateStr', '==', dateStr));
  }
  const snaps = await getDocs(q);
  return snaps.docs.map(d => ({ id: d.id, ...d.data() }));
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
  const ref = doc(attendanceCol, recordId);
  return deleteDoc(ref);
}

/** ============================================
 * Materials List (資材マスタ)
 * schema: { category, name1, name2, partNo }
 * ============================================ */
export async function fetchMaterialsList() {
  const snaps = await getDocs(materialsListCol);
  return snaps.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addMaterialListItem({ category, name1, name2, partNo }) {
  return addDoc(materialsListCol, { category, name1, name2, partNo });
}
export async function updateMaterial(materialId, { category, name1, name2, partNo }) {
  const ref = doc(materialsListCol, materialId);
  return updateDoc(ref, { category, name1, name2, partNo });
}
export async function deleteMaterial(materialId) {
  const ref = doc(materialsListCol, materialId);
  return deleteDoc(ref);
}

/** ============================================
 * Materials Records (資材使用レコード)
 * items: [{ partNo, qty }]
 * ============================================ */
export async function fetchMaterialsRecords() {
  const snaps = await getDocs(materialsRecCol);
  return snaps.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addMaterialRecord({
  project,
  items,
  lendStart,
  lendEnd = null,
  timestamp,
}) {
  const data = {
    project,
    items,
    lendStart: Timestamp.fromDate(lendStart),
    lendEnd:   lendEnd ? Timestamp.fromDate(lendEnd) : null,
    timestamp: Timestamp.fromDate(timestamp),
  };
  return addDoc(materialsRecCol, data);
}
export async function updateMaterialRecord(recordId, { lendStart, lendEnd }) {
  const ref = doc(materialsRecCol, recordId);
  const data = {
    lendStart: Timestamp.fromDate(lendStart),
    lendEnd:   lendEnd ? Timestamp.fromDate(lendEnd) : null,
  };
  return updateDoc(ref, data);
}
export async function deleteMaterialRecord(recordId) {
  const ref = doc(materialsRecCol, recordId);
  return deleteDoc(ref);
}

/** ============================================
 * Material Usage (資材使用量) トップレベルコレクション
 * schema: { projectId, materialId, quantity, timestamp }
 * ============================================ */
const materialsUsageCol = collection(db, 'materialsUsage');

/**
 * 資材使用量を記録
 * @param {{ projectId: string, materialId: string, quantity: number }} params
 * @returns {Promise<string>} 追加したドキュメントID
 */
export async function addMaterialUsage({ projectId, materialId, quantity }) {
  const ref = await addDoc(materialsUsageCol, {
    projectId,
    materialId,
    quantity,
    timestamp: Timestamp.fromDate(new Date()),
  });
  return ref.id;
}

/**
 * 全体またはプロジェクトごとの使用量を取得
 * @param {string | null} projectId
 * @returns {Promise<Array<{ id: string, projectId: string, materialId: string, quantity: number, timestamp: Date }>>}
 */
export async function fetchMaterialUsages(projectId = null) {
  let q = materialsUsageCol;
  if (projectId) {
    q = query(materialsUsageCol, where('projectId', '==', projectId));
  }
  const snaps = await getDocs(q);
  return snaps.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      projectId: data.projectId,
      materialId: data.materialId,
      quantity: data.quantity,
      timestamp: data.timestamp.toDate(),
    };
  });
}
/**
 * 既存の使用量を上書き更新
 * @param {string} usageId ドキュメントID
 * @param {number} quantity 新しい数量
 */
export async function updateMaterialUsage(usageId, quantity) {
  const ref = doc(db, 'materialsUsage', usageId);
  return updateDoc(ref, {
    quantity,
    timestamp: Timestamp.fromDate(new Date()),
  });
}
/**
 * 資材使用量レコードを削除
 * @param {string} usageId ドキュメントID
 */
export async function deleteMaterialUsage(usageId) {
  const ref = doc(db, 'materialsUsage', usageId);
  return deleteDoc(ref);
}
