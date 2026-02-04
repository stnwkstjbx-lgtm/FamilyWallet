/**
 * exportCSV.js
 * ─────────────────────────────────────────────
 * 거래 내역을 CSV로 변환하여 공유
 * ─────────────────────────────────────────────
 */

import { Share, Platform } from 'react-native';
import { ALL_CATEGORY_NAMES } from '../constants/categories';
import { FUND_TYPE_MAP } from '../constants/categories';

/**
 * 거래 목록을 CSV 문자열로 변환
 */
export function transactionsToCSV(transactions, walletName, customCategories = []) {
  const catNames = { ...ALL_CATEGORY_NAMES };
  customCategories.forEach(c => { catNames[c.id] = c.name; });
  const header = '날짜,유형,출처,카테고리,메모,금액,기록자';
  const rows = transactions
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map((tx) => {
      const date = (tx.date || '').slice(0, 10);
      const type = tx.type === 'income' ? '수입' : '지출';
      const fundType = tx.type === 'expense' ? (FUND_TYPE_MAP[tx.fundType]?.name || '공금') : '';
      const category = catNames[tx.category] || tx.category || '';
      const memo = (tx.memo || '').replace(/,/g, ' ').replace(/\n/g, ' ');
      const amount = tx.type === 'income' ? tx.amount : -tx.amount;
      const member = (tx.memberName || tx.member || '').replace(/,/g, ' ');
      return `${date},${type},${fundType},${category},${memo},${amount},${member}`;
    });

  const bom = '\uFEFF'; // UTF-8 BOM for Excel 한글 지원
  return bom + [header, ...rows].join('\n');
}

/**
 * 월별 요약 CSV 생성
 */
export function monthlySummaryCSV(transactions, walletName) {
  const months = {};
  transactions.forEach((tx) => {
    const ym = (tx.date || '').slice(0, 7);
    if (!ym) return;
    if (!months[ym]) months[ym] = { income: 0, expense: 0 };
    if (tx.type === 'income') months[ym].income += tx.amount || 0;
    else if (tx.type === 'expense' && tx.fundType !== 'allowance_allocation') {
      months[ym].expense += tx.amount || 0;
    }
  });

  const header = '월,수입,지출,잔액';
  const rows = Object.keys(months)
    .sort()
    .map((ym) => {
      const { income, expense } = months[ym];
      return `${ym},${income},${expense},${income - expense}`;
    });

  const bom = '\uFEFF';
  return bom + [header, ...rows].join('\n');
}

/**
 * CSV 데이터를 공유
 */
export async function shareCSV(csvContent, filename) {
  try {
    if (Platform.OS === 'web') {
      // 웹: 다운로드
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return { success: true };
    }

    // 모바일: Share API 사용 (텍스트로 공유)
    const result = await Share.share({
      message: csvContent,
      title: filename,
    });

    return { success: result.action !== Share.dismissedAction };
  } catch (error) {
    return { success: false, message: error.message };
  }
}
