// ===== 지출 카테고리 =====
export const EXPENSE_CATEGORIES = [
  { id: 'food', name: '식비', icon: 'restaurant-outline' },
  { id: 'transport', name: '교통', icon: 'bus-outline' },
  { id: 'shopping', name: '쇼핑', icon: 'cart-outline' },
  { id: 'health', name: '건강', icon: 'medical-outline' },
  { id: 'education', name: '교육', icon: 'school-outline' },
  { id: 'entertainment', name: '여가', icon: 'game-controller-outline' },
  { id: 'housing', name: '주거', icon: 'home-outline' },
  { id: 'etc', name: '기타', icon: 'ellipsis-horizontal-outline' },
];

// ===== 수입 카테고리 =====
export const INCOME_CATEGORIES = [
  { id: 'salary', name: '월급', icon: 'briefcase-outline' },
  { id: 'bonus', name: '상여금', icon: 'gift-outline' },
  { id: 'sebaetdon', name: '세뱃돈', icon: 'heart-outline' },
  { id: 'pocketmoney', name: '용돈', icon: 'cash-outline' },
  { id: 'interest', name: '이자', icon: 'trending-up-outline' },
  { id: 'sidejob', name: '부수입', icon: 'wallet-outline' },
  { id: 'incomeEtc', name: '기타 수입', icon: 'ellipsis-horizontal-outline' },
];

// ===== 지출 출처 (fundType) 분류 =====
export const FUND_TYPES = [
  { id: 'shared', name: '공금', icon: 'people', color: '#4A6FE5', desc: '가족 공용 지출' },
  { id: 'personal', name: '용돈', icon: 'person', color: '#27AE60', desc: '개인 용돈에서 차감' },
  { id: 'utility', name: '공과금', icon: 'flash', color: '#E67E22', desc: '고정지출·공과금' },
  { id: 'savings', name: '예적금', icon: 'wallet', color: '#2980B9', desc: '적금·예금 저축' },
  { id: 'investment', name: '투자', icon: 'trending-up', color: '#8E44AD', desc: '주식·펀드 투자' },
  { id: 'emergency', name: '비상금', icon: 'shield-checkmark', color: '#16A085', desc: '비상금 예치' },
];

export const FUND_TYPE_MAP = {};
FUND_TYPES.forEach((f) => { FUND_TYPE_MAP[f.id] = f; });

// 누적 추적 대상 (자산 이전 성격)
export const ASSET_FUND_TYPES = ['savings', 'investment', 'emergency'];

// ===== 카테고리 이름 빠르게 찾기 =====
export const ALL_CATEGORY_NAMES = {};
EXPENSE_CATEGORIES.forEach((c) => { ALL_CATEGORY_NAMES[c.id] = c.name; });
INCOME_CATEGORIES.forEach((c) => { ALL_CATEGORY_NAMES[c.id] = c.name; });

export const ALL_CATEGORY_ICONS = {};
EXPENSE_CATEGORIES.forEach((c) => { ALL_CATEGORY_ICONS[c.id] = c.icon; });
INCOME_CATEGORIES.forEach((c) => { ALL_CATEGORY_ICONS[c.id] = c.icon; });