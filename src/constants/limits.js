/**
 * limits.js
 * ─────────────────────────────────────────────
 * 앱 전역 상수 / 제한값
 * ─────────────────────────────────────────────
 */

export const MAX_WALLETS = 3;
export const MAX_ADMINS = 3;
export const MAX_AMOUNT = 999_999_999; // 9억 9,999만 9,999원
export const MIN_PASSWORD_LENGTH = 8;

export const VALID_FUND_TYPES = [
  'shared', 'personal', 'utility', 'savings', 'investment', 'emergency',
];
