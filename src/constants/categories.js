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

// ===== 지출 출처별 세부 카테고리 =====
export const FUND_EXPENSE_CATEGORIES = {
  shared: [
    { id: 'food', name: '식비', icon: 'restaurant-outline' },
    { id: 'transport', name: '교통', icon: 'bus-outline' },
    { id: 'shopping', name: '쇼핑', icon: 'cart-outline' },
    { id: 'health', name: '건강', icon: 'medical-outline' },
    { id: 'education', name: '교육', icon: 'school-outline' },
    { id: 'entertainment', name: '여가', icon: 'game-controller-outline' },
    { id: 'housing', name: '주거', icon: 'home-outline' },
    { id: 'etc', name: '기타', icon: 'ellipsis-horizontal-outline' },
  ],
  personal: [
    { id: 'food', name: '식비', icon: 'restaurant-outline' },
    { id: 'transport', name: '교통', icon: 'bus-outline' },
    { id: 'shopping', name: '쇼핑', icon: 'cart-outline' },
    { id: 'entertainment', name: '여가', icon: 'game-controller-outline' },
    { id: 'health', name: '건강', icon: 'medical-outline' },
    { id: 'education', name: '교육', icon: 'school-outline' },
    { id: 'etc', name: '기타', icon: 'ellipsis-horizontal-outline' },
  ],
  utility: [
    { id: 'electricity', name: '전기세', icon: 'flash-outline' },
    { id: 'gas', name: '가스비', icon: 'flame-outline' },
    { id: 'water', name: '수도세', icon: 'water-outline' },
    { id: 'maintenance', name: '관리비', icon: 'business-outline' },
    { id: 'telecom', name: '통신비', icon: 'phone-portrait-outline' },
    { id: 'internet', name: '인터넷', icon: 'wifi-outline' },
    { id: 'utilityEtc', name: '기타 공과금', icon: 'ellipsis-horizontal-outline' },
  ],
  savings: [
    { id: 'fixedDeposit', name: '정기예금', icon: 'lock-closed-outline' },
    { id: 'installment', name: '적금', icon: 'layers-outline' },
    { id: 'flexSavings', name: '자유저축', icon: 'wallet-outline' },
    { id: 'savingsEtc', name: '기타 저축', icon: 'ellipsis-horizontal-outline' },
  ],
  investment: [
    { id: 'stock', name: '주식', icon: 'trending-up-outline' },
    { id: 'fund', name: '펀드', icon: 'pie-chart-outline' },
    { id: 'etf', name: 'ETF', icon: 'bar-chart-outline' },
    { id: 'crypto', name: '가상화폐', icon: 'logo-bitcoin' },
    { id: 'realEstate', name: '부동산', icon: 'business-outline' },
    { id: 'investEtc', name: '기타 투자', icon: 'ellipsis-horizontal-outline' },
  ],
  emergency: [
    { id: 'medical', name: '의료비', icon: 'medkit-outline' },
    { id: 'repair', name: '수리비', icon: 'construct-outline' },
    { id: 'urgentExpense', name: '긴급지출', icon: 'alert-circle-outline' },
    { id: 'emergencyEtc', name: '기타 비상', icon: 'ellipsis-horizontal-outline' },
  ],
};

// ===== 카테고리 이름 빠르게 찾기 =====
export const ALL_CATEGORY_NAMES = {};
EXPENSE_CATEGORIES.forEach((c) => { ALL_CATEGORY_NAMES[c.id] = c.name; });
INCOME_CATEGORIES.forEach((c) => { ALL_CATEGORY_NAMES[c.id] = c.name; });
Object.values(FUND_EXPENSE_CATEGORIES).forEach((cats) => {
  cats.forEach((c) => { if (!ALL_CATEGORY_NAMES[c.id]) ALL_CATEGORY_NAMES[c.id] = c.name; });
});

export const ALL_CATEGORY_ICONS = {};
EXPENSE_CATEGORIES.forEach((c) => { ALL_CATEGORY_ICONS[c.id] = c.icon; });
INCOME_CATEGORIES.forEach((c) => { ALL_CATEGORY_ICONS[c.id] = c.icon; });
Object.values(FUND_EXPENSE_CATEGORIES).forEach((cats) => {
  cats.forEach((c) => { if (!ALL_CATEGORY_ICONS[c.id]) ALL_CATEGORY_ICONS[c.id] = c.icon; });
});