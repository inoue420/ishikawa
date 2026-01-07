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
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

const COL = 'invoiceApprovals';

const targetKeyOf = ({ projectId, billingId }) =>
  `${projectId}::${billingId ? `billing:${billingId}` : 'project'}`;

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
  approverLoginId,
}) {
  if (!projectId) throw new Error('projectId is required');
  if (!requesterLoginId) throw new Error('requesterLoginId is required');
  if (!approverLoginId) throw new Error('approverLoginId is required');

  const targetKey = targetKeyOf({ projectId, billingId });

  // 既存 pending を確認（重複防止）
  const q = query(
    collection(db, COL),
    where('targetKey', '==', targetKey),
    where('status', '==', 'pending'),
    qLimit(1)
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    return { approvalId: snap.docs[0].id, alreadyPending: true };
  }

  // 依頼作成
  const ref = await addDoc(collection(db, COL), {
    targetKey,
    targetType: billingId ? 'billing' : 'project',
    projectId,
    billingId: billingId ?? null,
    stage: stage ?? null,
    templateId,
    amountExTax: amountExTax ?? null,
    totalWithTax: totalWithTax ?? null,
    projectName: projectName ?? null,
    clientName: clientName ?? null,
    requesterLoginId,
    requesterName: requesterName ?? null,
    requesterEmail: requesterEmail ?? null,
    approverLoginId,
    status: 'pending',
    createdAt: serverTimestamp(),
  });

  // ターゲットのステータス更新（承認待ち）
  if (billingId) {
    await updateDoc(doc(db, 'projects', projectId, 'billings', billingId), {
      status: 'approval_pending',
      // 金額はここで確定しておく（WIP側の表示・以後の発行金額の基準）
      ...(amountExTax != null ? { amount: amountExTax } : {}),
      approvalRequestedAt: serverTimestamp(),
      approvalId: ref.id,
    });
  } else {
    await updateDoc(doc(db, 'projects', projectId), {
      invoiceStatus: 'approval_pending',
      ...(amountExTax != null ? { invoiceAmount: amountExTax } : {}),
      approvalRequestedAt: serverTimestamp(),
      approvalId: ref.id,
    });
  }

  return { approvalId: ref.id, alreadyPending: false };
}

export async function fetchPendingInvoiceApprovals(approverLoginId, { limit = 30 } = {}) {
  if (!approverLoginId) return [];
  const q = query(
    collection(db, COL),
    where('approverLoginId', '==', approverLoginId),
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
