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
  orderBy,  
  Timestamp,
  serverTimestamp,        
} from 'firebase/firestore';
import { ref as sRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from './firebaseConfig';

// コレクション定義
const usersCol           = collection(db, 'users');
const projectsCol        = collection(db, 'projects');
const attendanceCol      = collection(db, 'attendanceRecords');
const materialsListCol   = collection(db, 'materialsList');
const materialsRecCol    = collection(db, 'materialsRecords');
const companyProfileCol  = collection(db, 'companyProfile');
const employeesCol       = collection(db, "employees");

// 画像URI→Blob
async function uriToBlob(uri) {
  const res = await fetch(uri);
  return await res.blob();
}

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
 *  ============================================ 
 * フィールド一覧:
 *   name         : string       // プロジェクト名
 *   clientName   : string       // 顧客名
 *   startDate    : Timestamp    // 開始日
 *   endDate      : Timestamp    // 終了日
 *   sales        : string       // 営業担当社員ID
 *   survey       : string       // 現場調査担当社員ID
 *   design       : string       // 設計担当社員ID
 *   management   : string       // 管理担当社員ID
 *   participants  : string[] // 参加従業員の社員ID配列（複数）
 */

// ===== 写真アップロード/一覧/削除/履歴 =====

export async function uploadProjectPhoto({ projectId, date, localUri, uploadedBy }) {
  const blob = await uriToBlob(localUri);
 const id = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
   ? globalThis.crypto.randomUUID()
   : String(Date.now());
  const path = `projectPhotos/${projectId}/${date}/${id}.jpg`;
  const fileRef = sRef(storage, path);
  await uploadBytes(fileRef, blob);
  const url = await getDownloadURL(fileRef);

  const photosCol = collection(db, 'projects', projectId, 'photos');
  const photoDocRef = await addDoc(photosCol, {
    date,
    path,
    url,
    uploadedBy: uploadedBy ?? null,
    uploadedAt: serverTimestamp(),
  });

  return { id: photoDocRef.id, path, url };
}

export async function listProjectPhotos(projectId, date) {
  const photosCol = collection(db, 'projects', projectId, 'photos');
  const q = query(photosCol, where('date', '==', date), orderBy('uploadedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteProjectPhoto({ projectId, photoId }) {
  const photoRef = doc(db, 'projects', projectId, 'photos', photoId);
  const photoSnap = await getDoc(photoRef);
  if (!photoSnap.exists()) return;

  const { path } = photoSnap.data();
  if (path) {
   const fileRef = sRef(storage, path);
   await deleteObject(fileRef).catch(() => {});
  }
  await deleteDoc(photoRef);
}

export async function addEditLog({ projectId, date, action, target, targetId, by, byName }) {
  const logsCol = collection(db, 'projects', projectId, 'editLogs');
  await addDoc(logsCol, {
    date,
    action,     // 'add' | 'delete'
    target,     // 'photo' など
    targetId,   // photo doc id
    by: by ?? null,
    byName: byName ?? null,
    at: serverTimestamp(),
  });
}

export async function fetchEditLogs(projectId, date) {
  const logsCol = collection(db, 'projects', projectId, 'editLogs');
  const q = query(logsCol, where('date', '==', date), orderBy('at', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ===== コメント追加/取得 =====

export async function addProjectComment({ projectId, date, text, imageUrl, by, byName }) {
  const commentsCol = collection(db, 'projects', projectId, 'comments');
  await addDoc(commentsCol, {
    date,
    text: text ?? '',
    imageUrl: imageUrl ?? null,
    by: by ?? null,
    byName: byName ?? null,
    at: serverTimestamp(),
  });
}

export async function fetchProjectComments(projectId, date) {
  const commentsCol = collection(db, 'projects', projectId, 'comments');
  const q = query(commentsCol, where('date', '==', date), orderBy('at', 'asc')); // 会話は昇順表示
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

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
  const toTS = (v) => (v instanceof Date ? Timestamp.fromDate(v) : v ?? null);
  const dataToSave = {
    ...projectData,
    startDate: toTS(projectData.startDate),
    // 単日の場合は null を明示保存（クエリ②で拾える）
    endDate: toTS(projectData.endDate),
  };
  return setDoc(docRef, dataToSave);
}
export async function fetchProjectsOverlappingRange(start, end) {
  const startTs = Timestamp.fromDate(start);
  const endTs   = Timestamp.fromDate(end);

  // ① 期間オーバーラップ: startDate <= end && endDate >= start
  const qOverlap = query(
    projectsCol,
    where('startDate', '<=', endTs),
    where('endDate', '>=', startTs)
  );
  const s1 = await getDocs(qOverlap);

  // ② 単日案件（endDate なし）: startDate が範囲内
  const qSingle = query(
    projectsCol,
    where('endDate', '==', null),
    where('startDate', '>=', startTs),
    where('startDate', '<=', endTs)
  );
  const s2 = await getDocs(qSingle);

  // 重複排除
  const map = new Map();
  s1.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
  s2.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
  return [...map.values()];
}



/**
 * プロジェクトの役割情報のみ更新
 * @param {string} projectId
 * @param {{
 *   sales: string;
 *   survey: string;
 *   design: string;
 *   management: string;
 * }} rolesData
 */
export async function updateProjectRoles(projectId, rolesData) {
  const ref = doc(projectsCol, projectId);
  return updateDoc(ref, rolesData);
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
 await uploadBytes(fileRef, blob, { contentType: 'image/jpeg' });
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
      timestamp: data.timestamp?.toDate?.() ?? null,
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
 * schema: { email: string, name: string, affiliation: string, division?: string } 
 * ============================================ */
/**
 * 従業員を登録
 * @param {{ email: string, name: string, affiliation: string, division?: string }} data
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

// email でも loginId でも探せる従業員検索（移行期の両対応用）
export async function findEmployeeByIdOrEmail(identifier) {
  if (!identifier) return null;
  const id = identifier.trim().toLowerCase();
  // 1) ドキュメントID（= 旧来の email）として取得
  const direct = await getDoc(doc(employeesCol, id));
  if (direct.exists()) return { id: direct.id, ...direct.data() };
  // 2) loginId フィールドで検索
  const qy = query(employeesCol, where('loginId', '==', id));
  const snaps = await getDocs(qy);
  if (!snaps.empty) {
    const d = snaps.docs[0];
    return { id: d.id, ...d.data() };
  }
  return null;
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
 * @param {{ name?: string, affiliation?: string, division?: string }} data
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
  return snaps.docs.map(d => {
    const data = d.data();
    const ts = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
    return {
      id: d.id,
      type: data.type,
      timestamp: ts,
      // ▼ 表示に必要な追加フィールド
      status: data.status ?? undefined,
      alcoholCheck: data.alcoholCheck ?? undefined,
      managerApproval: data.managerApproval ?? undefined,
      employeeName: data.employeeName ?? undefined,
      affiliation: data.affiliation ?? undefined,
    };
  });
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

// ── 承認フロー：打刻申請（出勤/退勤）
export async function requestPunch({ employeeId, dateStr, type, time, alcoholCheck }) {
  const now = Timestamp.fromDate(time);
  const emp = await findEmployeeByIdOrEmail(employeeId);
  const payload = {
    employeeId,                 // 受け取ったID（メールでなくてもOK）
    employeeLoginId: emp?.loginId ?? null,
    employeeName: emp?.name ?? null,
    affiliation: emp?.affiliation ?? null,
    managerLoginId: emp?.managerLoginId ?? null,  // ★ 正規化
    managerEmail: emp?.managerEmail ?? null,      // 互換のため残す（使わなくてもOK）
    date: dateStr,
    type,
    timestamp: now,
    status: "pending",
    requestedAt: now,
    // ▼ 追加: アルコールチェック（UIで事前完了を必須に）
    ...(alcoholCheck ? {
      alcoholCheck: {
        completed: !!(alcoholCheck?.deviceUsed !== undefined && alcoholCheck?.intoxicated !== undefined),
        deviceUsed: !!alcoholCheck?.deviceUsed,      // true=使用 / false=不使用
        intoxicated: !!alcoholCheck?.intoxicated,    // true=あり / false=なし
        checkedAt: serverTimestamp(),
      }
    } : {})
  };
  return addDoc(attendanceCol, payload);
}

// ── 上長: 自分の承認待ち一覧を取得（単日文字列 or 期間オブジェクトの両対応）
// rangeOrDate: 'YYYY-MM-DD' | { startDate?: string, endDate?: string }
export async function fetchPendingForManager(managerLoginId, rangeOrDate) {
  let startDate, endDate;
  if (typeof rangeOrDate === 'string') {
    startDate = rangeOrDate;
    endDate   = rangeOrDate;
  } else if (rangeOrDate && typeof rangeOrDate === 'object') {
    ({ startDate, endDate } = rangeOrDate);
  }

  const qAttendance = query(
    attendanceCol,
    where('status', '==', 'pending'),
    where('managerLoginId', '==', managerLoginId),
    ...(startDate ? [where('date', '>=', startDate)] : []),
    ...(endDate   ? [where('date', '<=', endDate  )] : []),
  );
  const snap = await getDocs(qAttendance);
  const results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // ソート: 日付→時刻→type(in優先)
  results.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const ta = a.timestamp?.toDate?.() || new Date(a.timestamp);
    const tb = b.timestamp?.toDate?.() || new Date(b.timestamp);
    return (ta - tb) || (a.type === 'in' ? -1 : 1);
  });
  return results;
}

// ── 上長: 承認
export async function approvePunch(recordId, approverLoginId, approvalMethod) {
  const ref = doc(db, "attendanceRecords", recordId);
  const payload = {
    status: "approved",
    approverLoginId,
    approvedAt: serverTimestamp(),
    ...(approvalMethod ? {
      managerApproval: {
        method: approvalMethod,          // 'in-person' | 'phone' | 'video'
        verifiedAt: serverTimestamp(),   // = 承認時刻
      }
    } : {})
  };
  return updateDoc(ref, payload);
}

// ── 上長: 却下（理由つき）
export async function rejectPunch(recordId, approverLoginId, note = "") {
  const ref = doc(db, "attendanceRecords", recordId);
  return updateDoc(ref, {
    status: "rejected",
    approverLoginId,
    rejectedAt: serverTimestamp(),
    note,
  });
}

