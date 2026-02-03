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

// ===== 카테고리 이름 빠르게 찾기 =====
export const ALL_CATEGORY_NAMES = {};
EXPENSE_CATEGORIES.forEach((c) => { ALL_CATEGORY_NAMES[c.id] = c.name; });
INCOME_CATEGORIES.forEach((c) => { ALL_CATEGORY_NAMES[c.id] = c.name; });

export const ALL_CATEGORY_ICONS = {};
EXPENSE_CATEGORIES.forEach((c) => { ALL_CATEGORY_ICONS[c.id] = c.icon; });
INCOME_CATEGORIES.forEach((c) => { ALL_CATEGORY_ICONS[c.id] = c.icon; });