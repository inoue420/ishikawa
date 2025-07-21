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
  serverTimestamp,        
} from 'firebase/firestore';
import { db } from './firebaseConfig';

// コレクション定義
const usersCol           = collection(db, 'users');
const projectsCol        = collection(db, 'projects');
const attendanceCol      = collection(db, 'attendanceRecords');
const materialsListCol   = collection(db, 'materialsList');
const materialsRecCol    = collection(db, 'materialsRecords');
const companyProfileCol  = collection(db, 'companyProfile');
const employeesCol       = collection(db, "employees");

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
 export async function fetchBillings(projectId) {
   const colRef = collection(db, 'projects', projectId, 'billings');
   const snap   = await getDocs(colRef);
   return snap.docs.map(d => ({ id: d.id, ...d.data() }));
 }
 /** 新しい請求（マイルストーン）を追加 */
 export async function addBillingEntry(projectId, { stage, amount }) {
   const colRef = collection(db, 'projects', projectId, 'billings');
   return await addDoc(colRef, {
     stage,
     amount,
     status: 'pending',
     createdAt: serverTimestamp(),
   });
 }
 /** マイルストーン請求ステータスを更新 */
 export async function updateBillingStatus(projectId, billingId, newStatus) {
   const docRef = doc(db, 'projects', projectId, 'billings', billingId);
   const payload = { status: newStatus };
   
   // 発行/入金日時をサーバータイムスタンプで自動設定
   if (newStatus === 'issued') payload.issuedAt = serverTimestamp();
   if (newStatus === 'paid')   payload.paidAt   = serverTimestamp();
   return await updateDoc(docRef, payload);
 }
export async function updateBillingAmount(projectId, billingId, amount) {
  const docRef = doc(db, 'projects', projectId, 'billings', billingId);
  return updateDoc(docRef, { amount });
}
export async function deleteBillingEntry(projectId, billingId) {
  const docRef = doc(db, 'projects', projectId, 'billings', billingId);
  return deleteDoc(docRef);
}

/** ── 新規：請求金額更新（通常フロー） */
export async function updateProjectInvoice(projectId, { amount, newStatus }) {
  const ref = doc(db, 'projects', projectId);
  const payload = {
    invoiceAmount: amount,
    invoiceStatus: newStatus,
    // paid になったら最終完了フラグも立てるなら
    ...(newStatus === 'paid' && { status: 'completed' }),
  };
  return updateDoc(ref, payload);
}

/** ── 新規：請求方式切替 */
export async function updateProjectBillingType(projectId, isMilestoneBilling) {
  const ref = doc(db, 'projects', projectId);
  return updateDoc(ref, { isMilestoneBilling });
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
/** ============================================
 * Employees コレクション（従業員管理用）
 * ドキュメント ID にメールアドレスを使用
 * ============================================ */
/**
 * 従業員を登録
 * @param {{ email: string, name: string, affiliation: string }} data
 */
export async function registerUser(data) {
  const email = data.email.trim().toLowerCase();
  const ref = doc(employeesCol, email);
  await setDoc(ref, { ...data, email });
}

/**
 * メールアドレスで従業員を取得
 * @param {string} email
 */
export async function fetchUserByEmail(email) {
  const lower = email.trim().toLowerCase();
  const snap = await getDoc(doc(employeesCol, lower));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * 従業員一覧を取得
 */
export async function fetchAllUsers() {
  const snaps = await getDocs(employeesCol);
  return snaps.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * 従業員情報を更新
 * @param {string} email
 * @param {{ name: string, affiliation: string }} data
 */
export async function updateUser(email, data) {
  const lower = email.trim().toLowerCase();
  const ref = doc(employeesCol, lower);
  return updateDoc(ref, data);
}

/**
 * 従業員を削除
 * @param {string} email
 */
export async function deleteUser(email) {
  const lower = email.trim().toLowerCase();
  const ref = doc(employeesCol, lower);
  return deleteDoc(ref);
}

/**
 * 指定社員・日付の勤怠レコードを取得
 * @param {string} employeeId
 * @param {string} dateStr YYYY-MM-DD
 * @returns {Promise<Array<{ id: string, type: 'in'|'out', timestamp: Date }>>}
 */
export async function fetchAttendanceByEmployeeAndDate(employeeId, dateStr) {
  const q = query(
    attendanceCol,
    where('employeeId', '==', employeeId),
    where('date', '==', dateStr)
  );
  const snaps = await getDocs(q);
  return snaps.docs.map(d => ({
    id: d.id,
    type: d.data().type,
    timestamp: d.data().timestamp.toDate(),
  }));
}

/**
 * 出退勤打刻（upsert）
 * 既存レコードがあれば timestamp 更新、なければ新規作成
 * @param {string} employeeId
 * @param {string} dateStr YYYY-MM-DD
 * @param {'in'|'out'} type
 * @param {Date} time
 */
export async function upsertAttendance(employeeId, dateStr, type, time) {
  const q = query(
    attendanceCol,
    where('employeeId', '==', employeeId),
    where('date', '==', dateStr),
    where('type', '==', type)
  );
  const snaps = await getDocs(q);
  const nowStamp = Timestamp.fromDate(time);
  if (!snaps.empty) {
    // 既存レコードを更新
    const ref = snaps.docs[0].ref;
    return updateDoc(ref, { timestamp: nowStamp });
  } else {
    // 新規作成
    return addDoc(attendanceCol, {
      employeeId,
      date: dateStr,
      type,
      timestamp: nowStamp,
    });
  }
}

/**
 * 指定社員の指定期間の勤怠履歴を取得
 * @param {string} employeeId
 * @param {string} startDate YYYY-MM-DD
 * @param {string} endDate YYYY-MM-DD
 * @returns {Promise<Array<{ date: string, in?: Date, out?: Date }>>}
 */
export async function fetchAttendanceHistory(employeeId, startDate, endDate) {
  const q = query(
    attendanceCol,
    where('employeeId', '==', employeeId),
    where('date', '>=', startDate),
    where('date', '<=', endDate)
  );
  const snaps = await getDocs(q);
  const map = {};
  snaps.docs.forEach(d => {
    const { date, type, timestamp } = d.data();
    if (!map[date]) map[date] = { date };
    map[date][type] = timestamp.toDate();
  });
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}
