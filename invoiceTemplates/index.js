// invoiceTemplates/index.js
export const TEMPLATE_DEFAULT = 'default';
export const TEMPLATE_SHIMIZU = 'shimizu';
export const TEMPLATE_SPECIAL_2 = 'special2';
export const TEMPLATE_SPECIAL_3 = 'special3';

export const TEMPLATE_OPTIONS = [
  { id: TEMPLATE_DEFAULT, label: '標準（既存フォーマット）' },
  { id: TEMPLATE_SHIMIZU, label: '清水建設' },
  { id: TEMPLATE_SPECIAL_2, label: '指定フォーマット②（未実装）' },
  { id: TEMPLATE_SPECIAL_3, label: '指定フォーマット③（未実装）' },
];

export const templateLabel = (id) =>
  TEMPLATE_OPTIONS.find((o) => o.id === id)?.label || '標準（既存フォーマット）';

// 顧客名照合用（御中/様/殿や空白ゆらぎを吸収）
export const normalizeClientKey = (s) =>
  String(s || '')
    .trim()
    .replace(/\s/g, '')
    .replace(/(御中|様|殿)$/u, '')
    .toLowerCase();
