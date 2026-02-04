/**
 * OnboardingScreen.js
 * ─────────────────────────────────────────────
 * 수정 사항:
 *   1. "다음" 버튼이 FlatList를 다음 카드로 스크롤
 *   2. 마지막 카드에서 "다음" → "회원가입 하러 가기" 로 변경
 *   3. 마지막 카드 버튼 누르면 onFinish('signup') 호출
 *   4. 하단 "이미 계정이 있으신가요? 로그인" 링크 유지
 * ─────────────────────────────────────────────
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  Animated,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.82;
const CARD_MARGIN = 12;

// ───── 온보딩 카드 데이터 (5장) ─────
const ONBOARDING_DATA = [
  {
    id: '1',
    icon: 'wallet-outline',
    title: '가족 가계부',
    subtitle: '함께 관리하는 우리 가족 살림',
    description: '초대코드 하나로 가족 모두가\n같은 가계부를 공유하고\n닉네임으로 쉽게 구분해요.',
    gradient: ['#6C63FF', '#897BFF'],
  },
  {
    id: '2',
    icon: 'cash-outline',
    title: '공금 & 용돈',
    subtitle: '투명한 지출 관리',
    description: '가족 공금과 개인 용돈을\n분리해서 관리하고\n용돈 사용 리포트도 확인해요.',
    gradient: ['#FF6B6B', '#FF8E8E'],
  },
  {
    id: '3',
    icon: 'analytics-outline',
    title: '통계 & 분석',
    subtitle: '도넛 차트와 일별 추이',
    description: '카테고리별 지출 비율,\n전월 대비 변화, 일별 추이를\n직관적인 차트로 확인하세요.',
    gradient: ['#4ECDC4', '#6EE7DF'],
  },
  {
    id: '4',
    icon: 'calendar-outline',
    title: '캘린더 & 고정지출',
    subtitle: '일별 수입·지출 한눈에',
    description: '캘린더에서 날짜별 금액을 확인하고\n고정지출은 매월 자동 기록해드려요.',
    gradient: ['#FFD93D', '#FFE566'],
  },
  {
    id: '5',
    icon: 'people-outline',
    title: '가족과 함께',
    subtitle: '최대 3개 가계부 운용',
    description: '여러 가계부를 만들고 전환하며\n가족 구성원별 용돈 배분과\n지출 현황을 한눈에 관리해요.',
    gradient: ['#2ECC71', '#58D68D'],
  },
];

export default function OnboardingScreen({ onFinish }) {
  // ───── Refs & State ─────
  const flatListRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [currentIndex, setCurrentIndex] = useState(0);

  const isLastCard = currentIndex === ONBOARDING_DATA.length - 1;

  // ───── 인덱스 추적 ─────
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  // ───── 다음 버튼 핸들러 ─────
  const handleNext = useCallback(() => {
    if (isLastCard) {
      // 마지막 카드 → 회원가입 모드로 로그인 화면 이동
      onFinish?.('signup');
    } else {
      // 다음 카드로 스크롤
      const nextIndex = currentIndex + 1;
      flatListRef.current?.scrollToIndex({
        index: nextIndex,
        animated: true,
      });
    }
  }, [currentIndex, isLastCard, onFinish]);

  // ───── "이미 계정이 있으신가요?" 핸들러 ─────
  const handleLoginLink = useCallback(() => {
    onFinish?.('login');
  }, [onFinish]);

  // ───── 건너뛰기 핸들러 ─────
  const handleSkip = useCallback(() => {
    onFinish?.('signup');
  }, [onFinish]);

  // ───── 카드 렌더링 ─────
  const renderCard = ({ item, index }) => {
    const inputRange = [
      (index - 1) * (CARD_WIDTH + CARD_MARGIN * 2),
      index * (CARD_WIDTH + CARD_MARGIN * 2),
      (index + 1) * (CARD_WIDTH + CARD_MARGIN * 2),
    ];

    const scale = scrollX.interpolate({
      inputRange,
      outputRange: [0.88, 1, 0.88],
      extrapolate: 'clamp',
    });

    const opacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.5, 1, 0.5],
      extrapolate: 'clamp',
    });

    const translateY = scrollX.interpolate({
      inputRange,
      outputRange: [20, 0, 20],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View
        style={[
          styles.cardContainer,
          {
            transform: [{ scale }, { translateY }],
            opacity,
          },
        ]}
      >
        <LinearGradient
          colors={item.gradient}
          style={styles.card}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* 장식 원 */}
          <View style={[styles.decorCircle, styles.decorCircle1]} />
          <View style={[styles.decorCircle, styles.decorCircle2]} />

          <View style={styles.cardContent}>
            <View style={styles.iconCircle}>
              <Ionicons name={item.icon} size={48} color="#fff" />
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
            <View style={styles.divider} />
            <Text style={styles.cardDescription}>{item.description}</Text>
          </View>

          {/* 카드 번호 */}
          <Text style={styles.cardNumber}>
            {index + 1} / {ONBOARDING_DATA.length}
          </Text>
        </LinearGradient>
      </Animated.View>
    );
  };

  // ───── 페이지 인디케이터 ─────
  const renderDots = () => (
    <View style={styles.dotContainer}>
      {ONBOARDING_DATA.map((_, i) => {
        const dotWidth = scrollX.interpolate({
          inputRange: [
            (i - 1) * (CARD_WIDTH + CARD_MARGIN * 2),
            i * (CARD_WIDTH + CARD_MARGIN * 2),
            (i + 1) * (CARD_WIDTH + CARD_MARGIN * 2),
          ],
          outputRange: [8, 24, 8],
          extrapolate: 'clamp',
        });

        const dotOpacity = scrollX.interpolate({
          inputRange: [
            (i - 1) * (CARD_WIDTH + CARD_MARGIN * 2),
            i * (CARD_WIDTH + CARD_MARGIN * 2),
            (i + 1) * (CARD_WIDTH + CARD_MARGIN * 2),
          ],
          outputRange: [0.3, 1, 0.3],
          extrapolate: 'clamp',
        });

        return (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              { width: dotWidth, opacity: dotOpacity },
            ]}
          />
        );
      })}
    </View>
  );

  // ───── 메인 렌더 ─────
  return (
    <LinearGradient
      colors={['#667eea', '#764ba2']}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {/* 배경 장식 원 */}
      <View style={[styles.bgDecor, styles.bgDecor1]} />
      <View style={[styles.bgDecor, styles.bgDecor2]} />

      {/* 건너뛰기 버튼 (마지막 카드가 아닐 때만) */}
      {!isLastCard && (
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>건너뛰기</Text>
        </TouchableOpacity>
      )}

      {/* 카드 리스트 */}
      <View style={styles.listWrapper}>
        <Animated.FlatList
          ref={flatListRef}
          data={ONBOARDING_DATA}
          renderItem={renderCard}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH + CARD_MARGIN * 2}
          snapToAlignment="center"
          decelerationRate="fast"
          contentContainerStyle={styles.listContent}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true }
          )}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({
            length: CARD_WIDTH + CARD_MARGIN * 2,
            offset: (CARD_WIDTH + CARD_MARGIN * 2) * index,
            index,
          })}
        />
      </View>

      {/* 페이지 인디케이터 */}
      {renderDots()}

      {/* ───── 하단 버튼 영역 ───── */}
      <View style={styles.bottomArea}>
        {/* 메인 버튼: 다음 or 로그인 하러 가기 */}
        <TouchableOpacity
          style={[
            styles.nextButton,
            isLastCard && styles.nextButtonLast,
          ]}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={isLastCard ? ['#2ECC71', '#27AE60'] : ['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.15)']}
            style={styles.nextButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {isLastCard ? (
              <>
                <Ionicons name="person-add-outline" size={22} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.nextButtonTextLast}>회원가입 하러 가기</Text>
              </>
            ) : (
              <>
                <Text style={styles.nextButtonText}>다음</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 6 }} />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* 로그인 링크 (항상 표시) */}
        <TouchableOpacity onPress={handleLoginLink} style={styles.loginLinkArea}>
          <Text style={styles.loginLinkText}>
            이미 계정이 있으신가요?{' '}
            <Text style={styles.loginLinkBold}>로그인</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

// ───── 스타일 ─────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  bgDecor: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  bgDecor1: {
    width: 200,
    height: 200,
    top: -40,
    right: -60,
  },
  bgDecor2: {
    width: 150,
    height: 150,
    bottom: 80,
    left: -50,
  },
  skipButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36,
    right: 24,
    zIndex: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  skipText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '500',
  },

  // ───── 카드 리스트 ─────
  listWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: (SCREEN_WIDTH - CARD_WIDTH) / 2 - CARD_MARGIN,
    alignItems: 'center',
  },
  cardContainer: {
    width: CARD_WIDTH,
    marginHorizontal: CARD_MARGIN,
  },
  card: {
    borderRadius: 28,
    padding: 32,
    minHeight: SCREEN_HEIGHT * 0.48,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  decorCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  decorCircle1: {
    width: 120,
    height: 120,
    top: -30,
    right: -30,
  },
  decorCircle2: {
    width: 80,
    height: 80,
    bottom: -20,
    left: -20,
  },
  cardContent: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 16,
  },
  divider: {
    width: 40,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginBottom: 16,
  },
  cardDescription: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 24,
  },
  cardNumber: {
    position: 'absolute',
    bottom: 16,
    right: 20,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },

  // ───── 인디케이터 ─────
  dotContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 20,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginHorizontal: 4,
  },

  // ───── 하단 버튼 ─────
  bottomArea: {
    paddingHorizontal: 32,
    paddingBottom: Platform.OS === 'ios' ? 50 : 32,
    alignItems: 'center',
  },
  nextButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  nextButtonLast: {
    // 마지막 카드일 때 그림자 강조
    shadowColor: '#2ECC71',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  nextButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  nextButtonTextLast: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  loginLinkArea: {
    marginTop: 16,
    paddingVertical: 6,
  },
  loginLinkText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
  },
  loginLinkBold: {
    color: '#fff',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});