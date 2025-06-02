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
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
//console.log("🔥 firestoreService: db =", db);

/**
 * Firestore コレクション参照を定義
 */
const usersCol           = collection(db, 'users');
const projectsCol        = collection(db, 'projects');
const attendanceCol      = collection(db, 'attendanceRecords');
const materialsListCol   = collection(db, 'materialsList');
const materialsRecCol    = collection(db, 'materialsRecords');
const companyProfileCol  = collection(db, 'companyProfile');

/**
 * ============================================
 * Company Profile (会社情報)
 * ドキュメント構造例:
 * {
 *   companyName:   string,
 *   bankName:      string,
 *   branchName:    string,
 *   accountType:   string,
 *   accountNumber: string
 * }
 * ============================================
 */

/**
 * 会社プロファイルを取得
 * @returns {Promise<Object|null>} ドキュメントが存在すれば { id, companyName, bankName, branchName, accountType, accountNumber } 、
 *                                存在しなければ null
 */
export async function fetchCompanyProfile() {
  const docRef = doc(companyProfileCol, 'default');
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * 会社プロファイルをセットまたは更新
 * @param {Object} data
 *   - companyName: string
 *   - bankName:    string
 *   - branchName:  string
 *   - accountType: string
 *   - accountNumber: string
 */
export async function setCompanyProfile(data) {
  const docRef = doc(companyProfileCol, 'default');
  await setDoc(docRef, data);
}

/**
 * ============================================
 * Users コレクション
 * ドキュメント構造例:
 * {
 *   name:  string,
 *   role:  string,
 *   wage:  number,
 *   email: string (任意),
 *   その他必要なフィールド…
 * }
 * ============================================
 */

/**
 * 全ユーザーを取得
 * @returns {Promise<Array<Object>>}
 *   [{ id, name, role, wage, email?, … }, …]
 */
export async function fetchUsers() {
  const snapshot = await getDocs(usersCol);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

/**
 * ID から特定ユーザーを取得
 * @param {string} userId
 * @returns {Promise<Object|null>} { id, name, role, wage, email?, … } or null
 */
export async function fetchUserById(userId) {
  const docRef = doc(usersCol, userId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * 新規ユーザーを追加
 * @param {Object} userData
 *   - name: string
 *   - role: string
 *   - wage: number
 *   - email?: string
 * @returns {Promise<string>} 追加されたドキュメント ID
 */
export async function addUser(userData) {
  const ref = await addDoc(usersCol, userData);
  return ref.id;
}

/**
 * ユーザーを更新
 * @param {string} userId
 * @param {Object} updatedFields 更新したいフィールド名: 値 のペア
 */
export async function updateUser(userId, updatedFields) {
  const docRef = doc(usersCol, userId);
  await updateDoc(docRef, updatedFields);
}

/**
 * ユーザーを削除
 * @param {string} userId
 */
export async function deleteUser(userId) {
  const docRef = doc(usersCol, userId);
  await deleteDoc(docRef);
}

/**
 * ============================================
 * Projects コレクション
 * ドキュメント構造例:
 * {
 *   name:       string,
 *   clientName: string,
 *   startDate:  Timestamp,
 *   endDate:    Timestamp,
 *   その他必要なフィールド…
 * }
 * ============================================
 */

/**
 * 全プロジェクトを取得
 * @returns {Promise<Array<Object>>}
 *   [{ id, name, clientName, startDate: Timestamp, endDate: Timestamp }, …]
 */
export async function fetchProjects() {
  const snapshot = await getDocs(projectsCol);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

/**
 * ID から特定プロジェクトを取得
 * @param {string} projectId
 * @returns {Promise<Object|null>} { id, name, clientName, startDate, endDate } or null
 */
export async function fetchProjectById(projectId) {
  const docRef = doc(projectsCol, projectId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * プロジェクトを作成または更新
 * @param {string} projectId 任意の文字列 ID (自動生成の場合は省略可)
 * @param {Object} projectData
 *   - name: string
 *   - clientName: string
 *   - startDate: Date | Timestamp
 *   - endDate:   Date | Timestamp
 */
export async function setProject(projectId, projectData) {
  const docRef = projectId
    ? doc(projectsCol, projectId)
    : doc(projectsCol); // 自動 ID の場合
  const dataToSave = {
    ...projectData,
    // JS Date を Firestore Timestamp に変換
    startDate: projectData.startDate instanceof Date
      ? Timestamp.fromDate(projectData.startDate)
      : projectData.startDate,
    endDate: projectData.endDate instanceof Date
      ? Timestamp.fromDate(projectData.endDate)
      : projectData.endDate,
  };
  await setDoc(docRef, dataToSave);
}

/**
 * プロジェクトを削除
 * @param {string} projectId
 */
export async function deleteProject(projectId) {
  const docRef = doc(projectsCol, projectId);
  await deleteDoc(docRef);
}

/**
 * ============================================
 * Attendance Records (勤怠レコード) コレクション
 * ドキュメント構造例:
 * {
 *   project: string,      // プロジェクト名または projectId
 *   date:    Timestamp,   // 日付
 *   users:   Array<string>, // 作業者リスト（ユーザー名やユーザー ID）
 *   その他必要なフィールド…
 * }
 * ============================================
 */

/**
 * 全勤怠レコードを取得
 * @returns {Promise<Array<Object>>}
 *   [{ id, project, date: Timestamp, users: [string,…] }, …]
 */
export async function fetchAttendanceRecords() {
  const snapshot = await getDocs(attendanceCol);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

/**
 * 勤怠レコードを追加
 * @param {Object} recordData
 *   - project: string
 *   - date:    Date | Timestamp
 *   - users:   Array<string>
 * @returns {Promise<string>} 追加されたドキュメント ID
 */
export async function addAttendanceRecord(recordData) {
  const dataToSave = {
    ...recordData,
    date: recordData.date instanceof Date
      ? Timestamp.fromDate(recordData.date)
      : recordData.date,
  };
  const ref = await addDoc(attendanceCol, dataToSave);
  return ref.id;
}

/**
 * 勤怠レコードを削除
 * @param {string} recordId
 */
export async function deleteAttendanceRecord(recordId) {
  const docRef = doc(attendanceCol, recordId);
  await deleteDoc(docRef);
}

/**
 * ============================================
 * Materials List (資材マスタ) コレクション
 * ドキュメント構造例:
 * {
 *   name:      string,
 *   unitPrice: number,
 *   unit:      string,
 *   その他必要なフィールド…
 * }
 * ============================================
 */

/**
 * 全資材マスタを取得
 * @returns {Promise<Array<Object>>}
 *   [{ id, name, unitPrice, unit }, …]
 */
export async function fetchMaterialsList() {
  const snapshot = await getDocs(materialsListCol);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

/**
 * 資材マスタアイテムを追加
 * @param {Object} data
 *   - name:      string
 *   - unitPrice: number
 *   - unit:      string
 * @returns {Promise<string>} 追加されたドキュメント ID
 */
export async function addMaterialListItem(data) {
  const ref = await addDoc(materialsListCol, data);
  return ref.id;
}

/**
 * 資材マスタアイテムを更新
 * @param {string} materialId
 * @param {Object} updatedFields 更新したいフィールド名: 値 のペア
 */
export async function updateMaterial(materialId, updatedFields) {
  const docRef = doc(materialsListCol, materialId);
  await updateDoc(docRef, updatedFields);
}

/**
 * 資材マスタアイテムを削除
 * @param {string} materialId
 */
export async function deleteMaterial(materialId) {
  const docRef = doc(materialsListCol, materialId);
  await deleteDoc(docRef);
}

/**
 * ============================================
 * Materials Records (資材使用レコード) コレクション
 * ドキュメント構造例:
 * {
 *   project:   string,       // プロジェクト名または projectId
 *   lendStart: Timestamp,    // 借用開始日
 *   lendEnd:   Timestamp,    // 借用終了日（nullable）
 *   items:     Array<string> // 資材名のリスト
 *   その他必要なフィールド…
 * }
 * ============================================
 */

/**
 * 全資材使用レコードを取得
 * @returns {Promise<Array<Object>>}
 *   [{ id, project, lendStart: Timestamp, lendEnd: Timestamp|null, items: [string,…] }, …]
 */
export async function fetchMaterialsRecords() {
  const snapshot = await getDocs(materialsRecCol);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

/**
 * 資材使用レコードを追加
 * @param {Object} recordData
 *   - project:   string
 *   - lendStart: Date | Timestamp
 *   - lendEnd:   Date | Timestamp | null
 *   - items:     Array<string>
 * @returns {Promise<string>} 追加されたドキュメント ID
 */
export async function addMaterialRecord(recordData) {
  const dataToSave = {
    ...recordData,
    lendStart: recordData.lendStart instanceof Date
      ? Timestamp.fromDate(recordData.lendStart)
      : recordData.lendStart,
    lendEnd: recordData.lendEnd instanceof Date
      ? Timestamp.fromDate(recordData.lendEnd)
      : recordData.lendEnd || null,
  };
  const ref = await addDoc(materialsRecCol, dataToSave);
  return ref.id;
}

/**
 * 資材使用レコードを削除
 * @param {string} recordId
 */
export async function deleteMaterialRecord(recordId) {
  const docRef = doc(materialsRecCol, recordId);
  await deleteDoc(docRef);
}
