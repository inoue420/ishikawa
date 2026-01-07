//billingApprovalService.js
import { db } from './firebaseConfig';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit as qLimit,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

const COL = 'invoiceApprovals';

// 承認者設定（UserRegisterScreen から編集）
const CONFIG_COL = 'systemConfig';
const CONFIG_DOC_ID = 'billingApprovers';
const CONFIG_REF = doc(db, CONFIG_COL, CONFIG_DOC_ID);

const targetKeyOf = ({ projectId, billingId }) =>
  `${projectId}::${billingId ? `billing:${billingId}` : 'project'}`;

const normEmail = (v = '') => (v || '').trim().toLowerCase();

/**
 * 承認者設定を取得（email固定・AND想定）
 */
export async function fetchBillingApproverConfig() {
  const snap = await getDoc(CONFIG_REF);
  if (!snap.exists()) {
    return { presidentEmail: null, directorEmail: null, approverEmails: [] };
  }
  const d = snap.data() || {};
  const presidentEmail = d.presidentEmail ?? null;
  const directorEmail = d.directorEmail ?? null;
  const list = Array.isArray(d.approverEmails) ? d.approverEmails : [];
  const fallback = [presidentEmail, directorEmail].filter(Boolean);
  const merged = [...new Set([...list, ...fallback].map(normEmail).filter(Boolean))];
  return { presidentEmail, directorEmail, approverEmails: merged };
}

/**
 * 承認者設定を更新（email固定・可変人数AND）
 * - 推奨: { approverEmails: string[] }
 * - 互換: { presidentEmail, directorEmail } でもOK（内部で配列化）
 */
export async function setBillingApproverConfig({ approverEmails, presidentEmail, directorEmail }) {
  let list = Array.isArray(approverEmails) ? approverEmails : [];

  // 互換：旧2名指定
  if (!list || list.length === 0) {
    const a = normEmail(presidentEmail);
    const b = normEmail(directorEmail);
    list = [a, b];
  }

  // 正規化 + 重複排除
  list = [...new Set((list || []).map(normEmail).filter(Boolean))];

  // 0人は保存自体は許容（運用上、全員解除する可能性もあるため）
  if (list.length > 50) throw new Error('approverEmails is too long (max 50)');

  const nextPresident = list[0] ?? null;
  const nextDirector  = list[1] ?? null;

  await setDoc(
    CONFIG_REF,
    {
      presidentEmail: nextPresident,
      directorEmail: nextDirector,
      approverEmails: list,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return { presidentEmail: nextPresident, directorEmail: nextDirector, approverEmails: list };
}

export async function fetchInvoiceApprovalById(approvalId) {
  if (!approvalId) return null;
  const ref = doc(db, COL, approvalId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * 承認依頼を作成（同一ターゲットの pending があれば再利用）
 * - project: projects/{projectId}.invoiceStatus を approval_pending に
 * - billing: projects/{projectId}/billings/{billingId}.status を approval_pending に
 */
export async function submitInvoiceApprovalRequest({
  projectId,
  billingId = null,
  stage = null,
  templateId = 'standard', // 'standard' | 'shimizu'
  amountExTax = null,
  totalWithTax = null,
  projectName = null,
  clientName = null,
  requesterLoginId,
  requesterName,
  requesterEmail,
  approverEmails = null,
  draft = null,
}) {
  if (!projectId) throw new Error('projectId is required');
  if (!requesterEmail && !requesterLoginId) throw new Error('requesterEmail or requesterLoginId is required');


  const targetKey = targetKeyOf({ projectId, billingId });

  // 既存 pending を確認（重複防止）
  {
    const q = query(collection(db, COL), where('targetKey', '==', targetKey), where('status', '==', 'pending'), qLimit(10));
    const snap = await getDocs(q);
    if (!snap.empty) return { approvalIds: snap.docs.map(d => d.id), alreadyPending: true };
  }

  // 承認者を決定（未指定なら設定から取得）
  let resolved = Array.isArray(approverEmails) ? approverEmails : null;
  if (!resolved || resolved.length === 0) {
    const cfg = await fetchBillingApproverConfig();
    resolved = cfg.approverEmails;
  }
  resolved = [...new Set((resolved || []).map(normEmail).filter(Boolean))];
  if (resolved.length < 1) throw new Error('approverEmails must have at least 1 email');
  if (resolved.length > 50) throw new Error('approverEmails is too long (max 50)');

  const roundId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 全員分の依頼作成（可変人数AND）
  const createdIds = [];
  for (const approverEmail of resolved) {
    const ref = await addDoc(collection(db, COL), {
      targetKey,
      roundId,
      targetType: billingId ? 'billing' : 'project',
      projectId,
      billingId: billingId ?? null,
      stage: stage ?? null,
      templateId,
      amountExTax: amountExTax ?? null,
      totalWithTax: totalWithTax ?? null,
      projectName: projectName ?? null,
      clientName: clientName ?? null,
      requesterLoginId: requesterLoginId ?? null,
      requesterName: requesterName ?? null,
      requesterEmail: requesterEmail ?? null,
      approverEmail,
      approverEmails: resolved,
      draft: draft ?? null,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    createdIds.push(ref.id);
  }

  // ターゲットのステータス更新（承認待ち）
  if (billingId) {
    await updateDoc(doc(db, 'projects', projectId, 'billings', billingId), {
      status: 'approval_pending',
      // 金額はここで確定しておく（WIP側の表示・以後の発行金額の基準）
      ...(amountExTax != null ? { amount: amountExTax } : {}),
      approvalRequestedAt: serverTimestamp(),
      approvalRoundId: roundId,
      returnComment: null,
      returnedAt: null,
    });
  } else {
    await updateDoc(doc(db, 'projects', projectId), {
      invoiceStatus: 'approval_pending',
      ...(amountExTax != null ? { invoiceAmount: amountExTax } : {}),
      approvalRequestedAt: serverTimestamp(),
      approvalRoundId: roundId,
      invoiceReturnComment: null,
      invoiceReturnedAt: null,
    });
  }

  return { approvalIds: createdIds, alreadyPending: false, roundId };
}

export async function fetchPendingInvoiceApprovals(approverLoginId, { limit = 30 } = {}) {
  const email = (approverLoginId || '').trim().toLowerCase();
  if (!email) return [];
  const q = query(
    collection(db, COL),
    where('approverEmail', '==', email),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    qLimit(limit)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * 承認処理：ターゲットを billable に
 */
export async function approveInvoiceApprovalRequest(approvalId, { approverLoginId } = {}) {
  if (!approvalId) throw new Error('approvalId is required');
  const ref = doc(db, COL, approvalId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('approval not found');

  const data = snap.data();
  if (data.status !== 'pending') {
    return { ok: true, skipped: true, reason: 'not pending' };
  }

  await updateDoc(ref, {
    status: 'approved',
    approvedAt: serverTimestamp(),
    approvedBy: approverLoginId ?? null,
  });

  // round全体が揃ったら billable
  const q = query(collection(db, COL), where('targetKey', '==', data.targetKey), where('roundId', '==', data.roundId), qLimit(200));
  const rs = await getDocs(q);
  const all = rs.docs.map(d => ({ id: d.id, ...d.data() }));
  const required = Array.isArray(data.approverEmails) ? data.approverEmails : [];
  const byApprover = new Map(all.map(x => [x.approverEmail, x.status]));
  const allApproved = required.length >= 1 && required.every(em => byApprover.get(em) === 'approved');
  if (!allApproved) return { ok: true, waiting: true };

  const projectId = data.projectId;
  const billingId = data.billingId;

  if (billingId) {
    await updateDoc(doc(db, 'projects', projectId, 'billings', billingId), {
      status: 'billable',
      approvedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(doc(db, 'projects', projectId), {
      invoiceStatus: 'billable',
      approvedAt: serverTimestamp(),
    });
  }

  return { ok: true };
}

export async function rejectInvoiceApprovalRequest(approvalId, { approverEmail, comment = '' } = {}) {
  if (!approvalId) throw new Error('approvalId is required');
  const ref = doc(db, COL, approvalId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('approval not found');
  const data = snap.data();
  if (data.status !== 'pending') return { ok: true, skipped: true };

  const note = (comment || '').trim();
  await updateDoc(ref, {
    status: 'rejected',
    rejectedAt: serverTimestamp(),
    rejectedBy: approverEmail ?? null,
    returnComment: note || null,
  });

  // 他pendingをキャンセル
  const q = query(collection(db, COL), where('targetKey', '==', data.targetKey), where('roundId', '==', data.roundId), where('status', '==', 'pending'), qLimit(200));
  const rs = await getDocs(q);
  for (const d of rs.docs) {
    if (d.id === approvalId) continue;
    await updateDoc(doc(db, COL, d.id), { status: 'canceled', canceledAt: serverTimestamp(), canceledBy: approverEmail ?? null });
  }

  // ターゲット更新
  if (data.billingId) {
    await updateDoc(doc(db, 'projects', data.projectId, 'billings', data.billingId), {
      status: 'returned',
      returnedAt: serverTimestamp(),
      returnComment: note || null,
    });
  } else {
    await updateDoc(doc(db, 'projects', data.projectId), {
      invoiceStatus: 'returned',
      invoiceReturnedAt: serverTimestamp(),
      invoiceReturnComment: note || null,
    });
  }
  return { ok: true, returned: true };
}