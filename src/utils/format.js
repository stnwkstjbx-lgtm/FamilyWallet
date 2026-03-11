/**
 * format.js
 * ─────────────────────────────────────────────
 * 공통 포맷 유틸리티
 * ─────────────────────────────────────────────
 */

import { Platform, Alert } from 'react-native';
import { VALID_FUND_TYPES, MAX_AMOUNT } from '../constants/limits';

// ══════════════════════════════════════════
// Alert 유틸 (웹/네이티브 호환)
// ══════════════════════════════════════════

export const showAlert = (title, message, buttons) => {
  if (Platform.OS === 'web') {
    if (buttons) {
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed && buttons[1]) buttons[1].onPress();
    } else {
      window.alert(`${title}\n\n${message}`);
    }
  } else {
    Alert.alert(title, message, buttons);
  }
};

// ══════════════════════════════════════════
// 금액 입력 포맷 (콤마 자동 표시)
// ══════════════════════════════════════════

/**
 * 입력 문자열에서 숫자만 추출 후 콤마 포맷
 * @param {string} text - 사용자 입력
 * @returns {string} 콤마 포맷된 문자열 (예: "1,234,567")
 */
export const formatAmountInput = (text) => {
  const digits = text.replace(/[^0-9]/g, '');
  if (!digits) return '';
  return parseInt(digits, 10).toLocaleString('ko-KR');
};

/**
 * 콤마 포맷된 문자열에서 순수 숫자 추출
 * @param {string} formatted - 콤마 포맷 문자열
 * @returns {number} 숫자값
 */
export const parseAmount = (formatted) => {
  if (!formatted) return 0;
  return parseInt(formatted.replace(/[^0-9]/g, ''), 10) || 0;
};

// ══════════════════════════════════════════
// 금액 검증
// ══════════════════════════════════════════

/**
 * 금액 유효성 검증
 * @param {number} amount
 * @returns {{ valid: boolean, message?: string }}
 */
export const validateAmount = (amount) => {
  if (!amount || amount <= 0) return { valid: false, message: '금액을 입력해 주세요!' };
  if (amount > MAX_AMOUNT) return { valid: false, message: `최대 ${MAX_AMOUNT.toLocaleString()}원까지 입력 가능합니다` };
  return { valid: true };
};

// ══════════════════════════════════════════
// fundType 검증
// ══════════════════════════════════════════

/**
 * fundType 유효성 검증
 * @param {string} fundType
 * @returns {string} 유효한 fundType (잘못된 값이면 'shared' 반환)
 */
export const validateFundType = (fundType) => {
  if (VALID_FUND_TYPES.includes(fundType)) return fundType;
  if (__DEV__) console.warn('유효하지 않은 fundType:', fundType);
  return 'shared';
};
