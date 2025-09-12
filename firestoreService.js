// firestoreService.js
import {
  collection,
  collectionGroup,
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
  writeBatch,        
} from 'firebase/firestore';
import { ref as sRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from './firebaseConfig';
import { getAuth } from 'firebase/auth';
import * as FileSystem from 'expo-file-system';
import { initializeApp, getApp } from 'firebase/app';
 

// Base64 -> Uint8Array（atob/Buffer 非依存で動く純JSデコーダ）
function base64ToUint8Array(b64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = b64.replace(/[\r\n\s]/g, '');
  let bytes = [];
  let enc1, enc2, enc3, enc4;
  let i = 0;
  while (i < str.length) {
    enc1 = chars.indexOf(str.charAt(i++));
    enc2 = chars.indexOf(str.charAt(i++));
    enc3 = chars.indexOf(str.charAt(i++));
    enc4 = chars.indexOf(str.charAt(i++));
    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;
    bytes.push(chr1);
    if (enc3 !== 64 && enc3 !== -1) bytes.push(chr2);
    if (enc4 !== 64 && enc4 !== -1) bytes.push(chr3);
  }
  return new Uint8Array(bytes);
}

// コレクション定義
const usersCol           = collection(db, 'users');
const projectsCol        = collection(db, 'projects');
const attendanceCol      = collection(db, 'attendanceRecords');
const materialsListCol   = collection(db, 'materialsList');
const materialsRecCol    = collection(db, 'materialsRecords');
const companyProfileCol  = collection(db, 'companyProfile');
const employeesCol       = collection(db, "employees");

// 画像URI→Blob（安全版：fetch 失敗時は FileSystem Base64 にフォールバック）
async function uriToBlob(uri, mimeHint = 'image/jpeg') {
  console.log('[uriToBlob] start', { uri: String(uri).slice(0, 60), mimeHint });
  if (!uri) throw new Error('uriToBlob: uri is empty');
  try {
    const res = await fetch(uri);
    const b = await res.blob();
    // 一部端末で type が空になるため保険で差し替え
    const out = b.type ? b : b.slice(0, b.size, mimeHint);
    console.log('[uriToBlob] via fetch', { size: out.size, type: out.type });
    return out;
  } catch (e) {
    // Android の content:// 等で fetch が失敗するケースに対応
    console.log('[uriToBlob] fetch failed; fallback to FileSystem:', e?.message || e);
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    // atob / Buffer に依存しない純JS変換
    const u8 = base64ToUint8Array(b64);
    const out = new Blob([u8], { type: mimeHint });
    console.log('[uriToBlob] via FileSystem', { size: out.size, type: out.type });
    return out;
  }
}

/**
 * actor({ by, byName }) が未指定でも、現在のAuthユーザーから従業員を解決して補完する
 * - by    : employees の doc.id（見つからなければ email の小文字）
 * - byName: 従業員名（見つからなければ email のローカル部）
 */
async function _resolveActorIfNeeded(actor) {
  if (actor?.by && actor?.byName) return actor;
  try {
    const auth = getAuth();
    const authUser = auth?.currentUser || null;
    if (!authUser) return actor ?? null;
    const emp = await resolveEmployeeForAuth(authUser);
    return {
      by: actor?.by ?? (emp?.id ?? (authUser.email?.toLowerCase?.() ?? null)),
      byName:
        actor?.byName ??
        (emp?.name ??
          (authUser.email ? authUser.email.split('@')[0] : null)),
    };
  } catch {
    return actor ?? null;
  }
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
 *   orderAmount  : number|null  // 受注金額 [円]
 *   travelCost   : number|null  // 交通費 [円]
 *   miscExpense  : number|null  // 諸経費 [円]
 *   areaSqm      : number|null  // 平米 [m^2]
 *   projectType  : 'new'|'existing'|null // 新規/既存 区分
 *   createdAt    : Timestamp    // 作成時刻（新規時）
 *   updatedAt    : Timestamp    // 最終更新時刻
 */

// ===== 写真アップロード/一覧/削除/履歴 =====

export async function uploadProjectPhoto({ projectId, date, localUri, uploadedBy }) {
  console.log('[uploadProjectPhoto] start', { projectId, date, localUri, uploadedBy });
  // 必須チェック（パスに undefined が混入すると storage/unknown になりやすい）
  if (!projectId) throw new Error('uploadProjectPhoto: projectId is required');
  if (!date)      throw new Error('uploadProjectPhoto: date is required');
  if (!localUri)  throw new Error('uploadProjectPhoto: localUri is required');

  // 拡張子と contentType を推定（HEIC/PNG/JPG 想定）
  const cleanUri = String(localUri).split('?')[0];
  const extRaw = (cleanUri.split('.').pop() || 'jpg').toLowerCase();
  const ext = /^(heic|heif|png|jpg|jpeg)$/.test(extRaw) ? extRaw : 'jpg';
  const contentType =
    ext === 'png'  ? 'image/png'  :
    ext === 'heic' || ext === 'heif' ? 'image/heic' :
    'image/jpeg';
    console.log('[uploadProjectPhoto] detect', { cleanUri, extRaw, ext, contentType });

  // Blob 化（安全版）
  const blob = await uriToBlob(localUri, contentType);
  console.log('[uploadProjectPhoto] blob ready', { size: blob.size, type: blob.type });

  // ファイル名生成（既存の Storage ルートは踏襲）
  const id = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
    ? globalThis.crypto.randomUUID()
    : String(Date.now());
  const path = `projectPhotos/${projectId}/${date}/${id}.${ext === 'jpeg' ? 'jpg' : ext}`;
  const fileRef = sRef(storage, path);
  // ランタイムでのバケット確認
  try {
    const bucket = storage?.app?.options?.storageBucket;
    console.log('[uploadProjectPhoto] bucket/path', { bucket, path });
  } catch (_) {}

  // contentType を必ず付与
  try {
    await uploadBytes(fileRef, blob, {
      contentType,
      customMetadata: {
        projectId,
        date,
        uploadedBy: (typeof uploadedBy === 'object' ? (uploadedBy.by ?? uploadedBy.byName) : uploadedBy) ?? 'unknown',
      },
    });
    console.log('[uploadProjectPhoto] uploadBytes OK', { path });
  } catch (e) {
    const full = JSON.stringify(e, Object.getOwnPropertyNames(e));
    console.log('[uploadProjectPhoto] uploadBytes ERROR', full);
    throw e;
  }
  const url = await getDownloadURL(fileRef);
  console.log('[uploadProjectPhoto] getDownloadURL OK', { url: String(url).slice(0, 80) });

  const photosCol = collection(db, 'projects', projectId, 'photos');
  const photoDocRef = await addDoc(photosCol, {
    date,
    path,
    url,
    uploadedBy: (typeof uploadedBy === 'object' ? (uploadedBy.by ?? uploadedBy.byName) : uploadedBy) ?? null,
    uploadedAt: serverTimestamp(),
  });

  // 画像追加の履歴を editLogs にも記録
  try {
    await addEditLog({
      projectId,
      date,
      action: 'add',
      target: 'photo',
      targetId: photoDocRef.id,
      by: (typeof uploadedBy === 'object' ? uploadedBy.by : uploadedBy) ?? null,
      byName: (typeof uploadedBy === 'object' ? uploadedBy.byName : null) ?? null,
    });
  } catch (_) {}  

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
   await deleteObject(fileRef).catch((e) => {
     console.warn('[deleteProjectPhoto] deleteObject warning:', e?.message || e);
   });
  }
  await deleteDoc(photoRef);
  // 画像削除の履歴
  try {
    await addEditLog({
      projectId,
      date: null,
      action: 'delete',
      target: 'photo',
      targetId: photoId,
    });
  } catch (_) {}
}

export async function addEditLog({ projectId, date, action, target, targetId, by, byName }) {
  // by/byName の整合性を担保：by は employees の doc.id に正規化し、byName が無ければ解決
  let finalBy   = by ?? null;
  let finalName = byName ?? null;
  if (finalBy) {
    const emp = await findEmployeeByIdOrEmail(finalBy);
    if (emp) {
      finalBy   = emp.id;                 // "b" など doc.id に統一
      finalName = finalName ?? emp.name ?? null;
    }
  }
  const logsCol = collection(db, 'projects', projectId, 'editLogs');
  await addDoc(logsCol, {
    date,
    action,     // 'add' | 'delete'
    target,     // 'photo' など
    targetId,   // photo doc id
    by: finalBy,
    byName: finalName,
    at: serverTimestamp(),
  });
}

// ▼ 追加：プロジェクト作成/更新/削除を既存 editLogs に記録（新設コレクションは作らない）
export async function addProjectChangeLog({ projectId, action, by, byName, note = null, projectName = null }) {
  // by/byName を employees に正規化（addEditLog と同等の扱い）
  let finalBy   = by ?? null;
  let finalName = byName ?? null;
  if (finalBy) {
    const emp = await findEmployeeByIdOrEmail(finalBy);
    if (emp) {
      finalBy   = emp.id;
      finalName = finalName ?? emp.name ?? null;
    }
  }
 // 最低限の埋め合わせ：両方 null の場合、Auth からローカル部だけでも拾う
 if (!finalBy || !finalName) {
   try {
     const auth = getAuth();
     const u = auth?.currentUser || null;
     if (u?.email) {
       const local = u.email.split('@')[0];
       finalBy = finalBy ?? local ?? null;
       finalName = finalName ?? local ?? null;
     }
   } catch {}
 }

  const logsCol = collection(db, 'projects', projectId, 'editLogs');
  await addDoc(logsCol, {
    date: null,            // プロジェクト自体の履歴なので日付粒度は持たない
    action,                // 'create' | 'update' | 'delete'
    target: 'project',     // 横断一覧用のフィルタキー
    targetId: projectId,
    by: finalBy,
    byName: finalName,
    note: note ?? null,
    projectName: projectName ?? null,  // ← 名称を保持（削除後も表示可能）
    at: serverTimestamp(),
  });
}

// ▼ 追加：全プロジェクト横断の「プロジェクト変更履歴」を取得（新しい順）
export async function fetchProjectChangeLogs(limitCount = 500) {
  const qLogs = query(
    collectionGroup(db, 'editLogs'),
    where('target', '==', 'project'),
    orderBy('at', 'desc')
  );
  const snap = await getDocs(qLogs);
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return rows.slice(0, limitCount);
}

export async function fetchEditLogs(projectId, date) {
  const logsCol = collection(db, 'projects', projectId, 'editLogs');
  const q = query(logsCol, where('date', '==', date), orderBy('at', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ===== コメント追加/取得 =====

export async function addProjectComment({ projectId, date, text, imageUrl, by, byName }) {
  // by/byName の整合性を担保：by は employees の doc.id に正規化し、byName が無ければ解決
  let finalBy   = by ?? null;
  let finalName = byName ?? null;
  if (finalBy) {
    const emp = await findEmployeeByIdOrEmail(finalBy);
    if (emp) {
      finalBy   = emp.id;
      finalName = finalName ?? emp.name ?? null;
    }
  }
  const commentsCol = collection(db, 'projects', projectId, 'comments');
  const commentRef = await addDoc(commentsCol, {
    date,
    text: text ?? '',
    imageUrl: imageUrl ?? null,
    by: finalBy,
    byName: finalName,
    at: serverTimestamp(),
  });
  // コメント追加の履歴
  try {
    await addEditLog({
      projectId,
      date,
      action: 'add',
      target: 'comment',
      targetId: commentRef.id,
      by: finalBy,
      byName: finalName,
    });
  } catch (_) {}
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
export async function setProject(projectId, projectData, actor) {
  const docRef = projectId ? doc(projectsCol, projectId) : doc(projectsCol);
  const toTS = (v) => (v instanceof Date ? Timestamp.fromDate(v) : v ?? null);
 // 追加: 呼び出し側 or Auth から actor を確定
  const actorResolved = await _resolveActorIfNeeded(actor);
  const dataToSave = {
    ...projectData,
    startDate: toTS(projectData.startDate),
    endDate:   toTS(projectData.endDate),
    updatedAt: serverTimestamp(),
    updatedBy: actorResolved?.by ?? null,
    updatedByName: actorResolved?.byName ?? null,
    ...(projectId ? {} : {
      createdAt: serverTimestamp(),
      createdBy: actorResolved?.by ?? null,
      createdByName: actorResolved?.byName ?? null,
    }),
  };
  // 既存更新時は merge:true で未指定フィールド（今回追加の金額/面積/区分など）を消さない
  await setDoc(docRef, dataToSave, projectId ? { merge: true } : undefined);
  // ▼ 変更履歴（create/update）を既存 editLogs に記録
  try {
    await addProjectChangeLog({
      projectId: docRef.id,
      action: projectId ? 'update' : 'create',
      by: actorResolved?.by ?? null,
      byName: actorResolved?.byName ?? null,
      note: projectData?.name ? `プロジェクト「${projectData.name}」` : null,
      projectName: projectData?.name ?? null,
    });
  } catch (_) { /* ログ失敗は致命傷にしない */ }
  return;
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

export async function deleteProject(projectId, actor /* 任意: { by, byName } */) {
  const docRef = doc(projectsCol, projectId);
  // ▼ 削除前に名称を取得してログへ保持
  let nameForLog = null;
  try {
    const snap = await getDoc(docRef);
    nameForLog = snap.exists() ? (snap.data()?.name ?? null) : null;
  } catch (_) {}
  // 先に削除ログを記録
  try {
    const actorResolved = await _resolveActorIfNeeded(actor);
    await addProjectChangeLog({
      projectId,
      action: 'delete',
      by: actorResolved?.by ?? null,
      byName: actorResolved?.byName ?? null,
      note: nameForLog ? `プロジェクト「${nameForLog}」を削除` : `projectId=${projectId}`,
      projectName: nameForLog ?? null,
    });
  } catch (_) {}
  await deleteDoc(docRef);
  return;
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
  return updateDoc(docRef, payload);
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
  await setDoc(
    ref,
    {
      role: 'employee',
      department: '',
      managerLoginId: '',
      ...data,
      email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * メールアドレスで従業員を取得
 * @param {string} email
 */
export async function fetchUserByEmail(email) {
  const lower = email.trim().toLowerCase();
  const q1 = query(employeesCol, where('email', '==', lower));
  const snap = await getDocs(q1);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

// email でも loginId でも探せる従業員検索（移行期の両対応用）
export async function findEmployeeByIdOrEmail(identifier) {
  if (!identifier) return null;
  const key = identifier.trim().toLowerCase();
  // 1) ドキュメントIDで一致
  const direct = await getDoc(doc(employeesCol, key));
  if (direct.exists()) return { id: direct.id, ...direct.data() };
  // 2) email フィールドで一致
  const qEmail = query(employeesCol, where('email', '==', key));
  let snaps = await getDocs(qEmail);
  if (!snaps.empty) {
    const d = snaps.docs[0];
    return { id: d.id, ...d.data() };
  }
  // 3) loginId フィールドで一致（旧データ・テストデータ両対応）
  const qLogin = query(employeesCol, where('loginId', '==', key));
  snaps = await getDocs(qLogin);
  if (!snaps.empty) {
    const d = snaps.docs[0];
    return { id: d.id, ...d.data() };
  }
  return null;
}

// Auth から従業員を解決（email → ローカル部 → loginId 相当）
export async function resolveEmployeeForAuth(authUser) {
  const email = authUser?.email ?? '';
  const local = email ? email.split('@')[0] : '';
  return (
    (email && await findEmployeeByIdOrEmail(email)) ||
    (local && await findEmployeeByIdOrEmail(local)) ||
    null
  );
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
export async function updateUser(target, data) {
  const key = target.trim().toLowerCase();
  let ref = null;
  // 1) email フィールド一致
  const byEmail = await getDocs(query(employeesCol, where('email', '==', key)));
  if (!byEmail.empty) {
    ref = byEmail.docs[0].ref;
  } else {
    // 2) ドキュメントID一致
    const directRef = doc(employeesCol, key);
    const directSnap = await getDoc(directRef);
    if (directSnap.exists()) {
      ref = directRef;
    } else {
      // 3) loginId フィールド一致（旧データ用）
      const byLogin = await getDocs(query(employeesCol, where('loginId', '==', key)));
      if (!byLogin.empty) ref = byLogin.docs[0].ref;
    }
  }
  if (!ref) throw new Error(`No user document found for key=${key}`);
  return updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
}

/**
 * 従業員を削除
 * @param {string} email
 */
export async function deleteUser(target) {
  const key = target.trim().toLowerCase();
  // 1) email フィールド一致
  const byEmail = await getDocs(query(employeesCol, where('email', '==', key)));
  if (!byEmail.empty) return deleteDoc(byEmail.docs[0].ref);
  // 2) ドキュメントID一致
  const directRef = doc(employeesCol, key);
  const directSnap = await getDoc(directRef);
  if (directSnap.exists()) return deleteDoc(directRef);
  // 3) loginId フィールド一致
  const byLogin = await getDocs(query(employeesCol, where('loginId', '==', key)));
  if (!byLogin.empty) return deleteDoc(byLogin.docs[0].ref);
  throw new Error(`No user document found for key=${key}`);
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
// ========= 追加: users を map 化（byEmail / byLoginId） =========
export async function fetchUsersMap() {
  const snaps = await getDocs(employeesCol);
  const list = [];
  const byEmail = new Map();
  const byLoginId = new Map();
  snaps.docs.forEach(d => {
    const u = { id: d.id, ...d.data() };
    list.push(u);
    const em = (u.email || '').toLowerCase();
    const lid = (u.loginId || '').toLowerCase();
    if (em) byEmail.set(em, u);
    if (lid) byLoginId.set(lid, u);
  });
  return { list, byEmail, byLoginId };
}

// ========= 追加: 自分配下の loginId を抽出 =========
export function getSubordinateLoginIdsOf(selfUser, allUsers) {
  const out = new Set();
  if (!selfUser?.loginId) return out;
  const mine = selfUser.loginId;
  // 直属（自分が上長）
  for (const u of allUsers) {
    if (u.managerLoginId === mine) out.add(u.loginId);
  }
  // 役員なら：直属の部長 + その配下の従業員
  if (selfUser.role === 'executive') {
    const managers = allUsers.filter(u => u.managerLoginId === mine && u.role === 'manager');
    for (const m of managers) {
      for (const u of allUsers) {
        if (u.managerLoginId === m.loginId) out.add(u.loginId);
      }
    }
  }
  return out;
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
  const isExecutive = (emp?.role === 'executive');
  const selfApproverLoginId = (emp?.loginId || emp?.email || '').toLowerCase();

  const payload = {
    employeeId,                 // 受け取ったID（メールでなくてもOK）
    employeeLoginId: (emp?.loginId ?? null)?.toLowerCase?.() ?? emp?.loginId ?? null,
    employeeName: emp?.name ?? null,
    affiliation: emp?.affiliation ?? null,
    // 役員は承認者なし＝承認リストに出さない
    managerLoginId: isExecutive ? '' : ((emp?.managerLoginId || '').toLowerCase()),
    managerEmail: emp?.managerEmail ?? null,      // 互換のため残す（使わなくてもOK）
    division: emp?.division ?? null,
    department: emp?.division === '社員' ? (emp?.department ?? null) : null,
    date: dateStr,
    type,
    timestamp: now,
    status: isExecutive ? 'approved' : 'pending',
    requestedAt: now,
    ...(isExecutive ? {
      approverLoginId: selfApproverLoginId,
      approvedAt: serverTimestamp(),
      managerApproval: {
        method: 'auto',          // 表示時は「自動」にしておくのが分かりやすい
        verifiedAt: serverTimestamp(),
      },
    } : {}),
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

// ── 追加: 複数上長（loginId 配列）の承認待ちを取得（役員向け）
// Firestore where('in') は最大10要素までなのでグループ分割実行
export async function fetchPendingForManagers(managerLoginIds, rangeOrDate) {
  const ids = Array.from(new Set(managerLoginIds || [])).filter(Boolean);
  if (ids.length === 0) return [];
  let startDate, endDate;
  if (typeof rangeOrDate === 'string') {
    startDate = rangeOrDate;
    endDate   = rangeOrDate;
  } else if (rangeOrDate && typeof rangeOrDate === 'object') {
    ({ startDate, endDate } = rangeOrDate);
  }
  const chunks = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
  const all = [];
  for (const group of chunks) {
    const qAttendance = query(
      attendanceCol,
      where('status', '==', 'pending'),
      where('managerLoginId', 'in', group),
      ...(startDate ? [where('date', '>=', startDate)] : []),
      ...(endDate   ? [where('date', '<=', endDate  )] : []),
    );
    const snap = await getDocs(qAttendance);
    snap.docs.forEach(d => all.push({ id: d.id, ...d.data() }));
  }
  // ソート: 日付→時刻→type(in優先)
  all.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const ta = a.timestamp?.toDate?.() || new Date(a.timestamp);
    const tb = b.timestamp?.toDate?.() || new Date(b.timestamp);
    return (ta - tb) || (a.type === 'in' ? -1 : 1);
  });
  return all;
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

// ▼ 追加：範囲指定で横断の「プロジェクト変更履歴」を取得（新しい順）
//   - まずはサーバーで絞り込み（target=='project' && at範囲 && orderBy('at','desc')）
//   - もし複合インデックス未作成等で失敗したら、全件取得→クライアント側フィルタにフォールバック
export async function fetchProjectChangeLogsInRange(startDate, endDate, limitCount = 1000) {
  const startTs = Timestamp.fromDate(startDate);
  const endTs   = Timestamp.fromDate(endDate);

  try {
    const qLogs = query(
      collectionGroup(db, 'editLogs'),
      where('target', '==', 'project'),
      where('at', '>=', startTs),
      where('at', '<=', endTs),
      orderBy('at', 'desc'),
    );
    const snap = await getDocs(qLogs);
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return rows.slice(0, limitCount);
  } catch (e) {
    // フォールバック：まず target=='project' で取得 → 日付絞り
    const qLogs2 = query(
      collectionGroup(db, 'editLogs'),
      where('target', '==', 'project'),
      orderBy('at', 'desc')
    );
    const snap2 = await getDocs(qLogs2);
    const rows2 = snap2.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => {
        const dt = r.at?.toDate ? r.at.toDate() : (r.at ? new Date(r.at) : null);
        return dt && dt >= startDate && dt <= endDate;
      });
    return rows2.slice(0, limitCount);
  }
}
// ▼新規：コメント/画像も含めた横断履歴を範囲取得（project/comment/photo）
export async function fetchAllChangeLogsInRange(startDate, endDate, limitCount = 1000) {
  const startTs = Timestamp.fromDate(startDate);
  const endTs   = Timestamp.fromDate(endDate);
  const targets = ['project', 'comment', 'photo'];
  try {
    const qLogs = query(
      collectionGroup(db, 'editLogs'),
      where('target', 'in', targets),
      where('at', '>=', startTs),
      where('at', '<=', endTs),
      orderBy('at', 'desc'),
    );
    const snap = await getDocs(qLogs);
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return rows.slice(0, limitCount);
  } catch (e) {
    // フォールバック：targetフィルタなしで取得→クライアント側で絞る
    const qLogs2 = query(
      collectionGroup(db, 'editLogs'),
      orderBy('at', 'desc'),
    );
    const snap2 = await getDocs(qLogs2);
    const rows2 = snap2.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => targets.includes(r.target))
      .filter(r => {
        const dt = r.at?.toDate ? r.at.toDate() : (r.at ? new Date(r.at) : null);
        return dt && dt >= startDate && dt <= endDate;
      });
    return rows2.slice(0, limitCount);
  }
}
/**
 * 環境診断ログ（バケット名/認証/リージョンなど）
 */
export function debugStorageEnv() {
  try {
    const app = getApp();
    const auth = getAuth();
    const uid = auth?.currentUser?.uid ?? null;
    const email = auth?.currentUser?.email ?? null;
    const bucket = storage?.app?.options?.storageBucket ?? null;
    console.log('[debugStorageEnv]', { uid, email, bucket, appName: app?.name });
  } catch (e) {
    console.log('[debugStorageEnv] error', e?.message || e);
  }
}

/**
 * 文字列アップロードのプローブ：ルール/バケットの切り分け用
 */
import { uploadString } from 'firebase/storage';
export async function __testUploadPlainText(projectId, date) {
  const path = `projectPhotos/${projectId}/${date}/__probe.txt`;
  const fileRef = sRef(storage, path);
  const content = `probe ${new Date().toISOString()}`;
  try {
    await uploadString(fileRef, content, 'raw', { contentType: 'text/plain' });
    const url = await getDownloadURL(fileRef);
    console.log('[__testUploadPlainText] OK', { path, url });
    return { ok: true, url };
  } catch (e) {
    const full = JSON.stringify(e, Object.getOwnPropertyNames(e));
    console.log('[__testUploadPlainText] ERROR', full);
    return { ok: false, error: e?.message || String(e) };
  }
}

// ========= Vehicle master =========
export async function fetchVehicles() {
  const snap = await getDocs(query(collection(db, 'vehicles'), orderBy('name', 'asc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function setVehicle(id, payload) {
  if (id) {
    await setDoc(doc(db, 'vehicles', id), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
    return id;
  } else {
    const ref = await addDoc(collection(db, 'vehicles'), { ...payload, createdAt: serverTimestamp() });
    return ref.id;
  }
}

export async function deleteVehicle(id) {
  await deleteDoc(doc(db, 'vehicles', id));
}

// ========= Vehicle blocks (inspection/repair) =========
// { vehicleId, startDate:Timestamp, endDate:Timestamp, type:'inspection'|'repair', note }
export async function addVehicleBlock(block) {
  return addDoc(collection(db, 'vehicleBlocks'), {
    ...block,
    createdAt: serverTimestamp(),
  });
}

// 指定期間と重なるブロックを取得（必要に応じてコンソールのインデックス作成リンクに従ってください）
export async function fetchVehicleBlocksOverlapping(startTs, endTs) {
  const col = collection(db, 'vehicleBlocks');
  // startDate <= 範囲End AND endDate >= 範囲Start
  const qy = query(col, where('startDate', '<=', endTs), where('endDate', '>=', startTs));
  const snap = await getDocs(qy);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ========= Vehicle reservations (per-day) =========
// doc: { date:Timestamp(00:00), vehicleId, projectId }
export async function setVehicleReservation(projectId, dateMidnight, vehicleId) {
  return addDoc(collection(db, 'vehicleReservations'), {
    projectId,
    vehicleId,
    date: Timestamp.fromDate(dateMidnight),
    createdAt: serverTimestamp(),
  });
}

export async function clearReservationsForProject(projectId) {
  const col = collection(db, 'vehicleReservations');
  const qy = query(col, where('projectId', '==', projectId));
  const snap = await getDocs(qy);
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

export async function fetchReservationsInRange(startTs, endTs) {
  const col = collection(db, 'vehicleReservations');
  const qy = query(col, where('date', '>=', startTs), where('date', '<=', endTs));
  const snap = await getDocs(qy);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchReservationsForProject(projectId) {
  const col = collection(db, 'vehicleReservations');
  const qy = query(col, where('projectId', '==', projectId));
  const snap = await getDocs(qy);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}