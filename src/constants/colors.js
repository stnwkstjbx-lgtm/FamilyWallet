// 📁 파일 위치: src/constants/colors.js
// 🎨 앱 전체에서 사용할 색상표 (팔레트)

const Colors = {
  // 그라디언트 배경 색상 (토스 스타일 블루 → 퍼플)
  gradientStart: '#7C83FF',   // 연한 보라 파랑
  gradientMiddle: '#96BAFF',  // 하늘색
  gradientEnd: '#D4E4FF',     // 아주 연한 하늘

  // 기본 색상
  primary: '#5B6BF5',         // 메인 보라 파랑
  primaryDark: '#3A4BD4',     // 진한 보라 파랑
  primaryLight: '#B8C4FF',    // 연한 보라 파랑

  // 배경 색상
  background: '#F5F6FA',      // 전체 배경 (아주 연한 회색)
  cardBackground: 'rgba(255, 255, 255, 0.75)',  // 카드 배경 (반투명 흰색 → 유리 느낌!)
  white: '#FFFFFF',

  // 글자 색상
  textBlack: '#191F28',       // 거의 검정 (제목용)
  textDark: '#333D4B',        // 진한 회색 (본문용)
  textGray: '#8B95A1',        // 회색 (설명용)
  textLight: '#B0B8C1',       // 연한 회색 (힌트용)

  // 상태 색상
  income: '#2BC48A',          // 수입 = 초록
  expense: '#F45452',         // 지출 = 빨강
  warning: '#FFB800',         // 경고 = 노랑

  // 카테고리 색상
  category: {
    food: '#FF6B6B',          // 🍔 식비
    transport: '#4ECDC4',     // 🚌 교통
    shopping: '#FFE66D',      // 🛍️ 쇼핑
    health: '#2BC48A',        // 💊 건강
    education: '#5B6BF5',     // 📚 교육
    entertainment: '#FF8A5C', // 🎮 여가
    housing: '#96BAFF',       // 🏠 주거
    etc: '#B0B8C1',           // 📦 기타
  },
};

export default Colors;