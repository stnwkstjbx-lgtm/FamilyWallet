/**
 * AllowanceScreen.js
 * ─────────────────────────────────────────────
 * 개인 용돈 관리 화면
 *   - 이번 달 용돈 배분액 / 사용액 / 잔액
 *   - 저번 달 아낀 금액
 *   - 누적 아낀 금액
 *   - 평균 아낀 금액
 *   - 1년 예상 저축
 *   - 이번 달 용돈 사용 내역 리스트
 *
 *  ★ 본인의 용돈 데이터만 표시됨 (관리자 포함 다른 가족은 볼 수 없음)
 * ─────────────────────────────────────────────
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '../constants/WalletContext';
import { useAuth } from '../constants/AuthContext';
import { useTheme } from '../constants/ThemeContext';
import { EXPENSE_CATEGORIES, ALL_CATEGORY_NAMES, ALL_CATEGORY_ICONS } from '../constants/categories';
import { db } from '../firebase/firebaseConfig';
import { collection, query, where, onSnapshot, addDoc, orderBy } from 'firebase/firestore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// 카테고리 색상 매핑 (ThemeContext의 category 색상과 동일)
const CATEGORY_COLORS = {
  food: '#FF6B6B', transport: '#4ECDC4', shopping: '#FFE66D', health: '#2BC48A',
  education: '#5B6BF5', entertainment: '#FF8A5C', housing: '#96BAFF', etc: '#B0B8C1',
};

export default function AllowanceScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { currentWalletId, currentWallet } = useWallet();

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [personalTransactions, setPersonalTransactions] = useState([]);

  // 내 용돈 금액 (monthlyAllowance 또는 allowance)
  const myAllowance = currentWallet?.members?.[user?.uid]?.monthlyAllowance
    || currentWallet?.members?.[user?.uid]?.allowance || 0;

  // ★ 내 용돈 사용 내역만 가져오기 (본인 것만!)
  const [allocationTransactions, setAllocationTransactions] = useState([]);

  useEffect(() => {
    if (!currentWalletId || !user) return;

    const txRef = collection(db, 'wallets', currentWalletId, 'transactions');
    const q = query(
      txRef,
      where('fundType', '==', 'personal'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setPersonalTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 용돈 배분 내역도 가져오기 (실제로 배분된 달만 계산하기 위해)
    const allocQ = query(
      txRef,
      where('fundType', '==', 'allowance_allocation'),
      where('allocatedTo', '==', user.uid)
    );
    const unsub2 = onSnapshot(allocQ, (snap) => {
      setAllocationTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => { unsub(); unsub2(); };
  }, [currentWalletId, user]);

  // ───── 월별 데이터 계산 (실제 배분된 달만 계산) ─────
  const monthlyStats = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const stats = {};

    // 배분 내역 기반으로 어떤 달에 실제 배분이 있었는지 확인
    const allocatedMonths = {};
    allocationTransactions.forEach((tx) => {
      const ym = tx.allocMonth || tx.date?.slice(0, 7);
      if (ym) allocatedMonths[ym] = tx.amount || 0;
    });

    // 이번 달은 현재 설정된 용돈액 사용 (아직 배분 tx가 없을 수 있음)
    if (!allocatedMonths[currentMonth] && myAllowance > 0) {
      allocatedMonths[currentMonth] = myAllowance;
    }

    // 배분이 있었던 달만 초기화
    Object.entries(allocatedMonths).forEach(([ym, amount]) => {
      stats[ym] = { allowance: amount, spent: 0, saved: amount };
    });

    // 지출 합산
    personalTransactions.forEach((tx) => {
      const txMonth = tx.date?.slice(0, 7);
      if (stats[txMonth]) {
        stats[txMonth].spent += tx.amount || 0;
        stats[txMonth].saved = stats[txMonth].allowance - stats[txMonth].spent;
      }
    });

    return stats;
  }, [personalTransactions, allocationTransactions, myAllowance]);

  // ───── 리포트 계산 ─────
  const report = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;
    
    // 날짜 보정 (1월이면 작년 12월)
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const current = monthlyStats[currentMonth] || { allowance: myAllowance, spent: 0, saved: myAllowance };
    const last = monthlyStats[lastMonthKey] || { allowance: myAllowance, spent: 0, saved: myAllowance };

    // 최근 6개월 데이터 (이번 달 제외)
    const recentMonths = [];
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyStats[key] && monthlyStats[key].allowance > 0) {
        recentMonths.push(monthlyStats[key]);
      }
    }

    // 누적 아낀 금액 (최근 6개월)
    const totalSaved = recentMonths.reduce((sum, m) => sum + Math.max(0, m.saved), 0);
    
    // 평균 아낀 금액
    const avgSaved = recentMonths.length > 0 
      ? Math.round(totalSaved / recentMonths.length) 
      : Math.max(0, current.saved);

    // 1년 예상 저축
    const projectedYearly = avgSaved * 12;

    // 이번 달 사용 내역
    const currentMonthTxs = personalTransactions.filter(
      (tx) => tx.date?.slice(0, 7) === currentMonth
    );

    return {
      currentMonth,
      lastMonthKey,
      current,
      last,
      totalSaved,
      avgSaved,
      projectedYearly,
      currentMonthTxs,
      recentMonths,
    };
  }, [monthlyStats, personalTransactions, myAllowance]);

  // 잔액 퍼센트
  const remainingPercent = myAllowance > 0
    ? Math.max(0, Math.min(100, Math.round((report.current.saved / myAllowance) * 100)))
    : 0;

  // ───── 금액 포맷 ─────
  const formatMoney = (val) => {
    if (val == null) return '0원';
    const abs = Math.abs(val);
    if (abs >= 10000) {
      const man = Math.floor(abs / 10000);
      const rest = abs % 10000;
      return (val < 0 ? '-' : '') + (rest > 0 ? `${man}만 ${rest.toLocaleString()}원` : `${man}만원`);
    }
    return `${val.toLocaleString()}원`;
  };

  const formatMoneyShort = (val) => {
    if (val == null) return '0원';
    return `${val.toLocaleString()}원`;
  };

  // ───── 월 표시 ─────
  const formatMonth = (ym) => {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    return `${y}년 ${parseInt(m)}월`;
  };

  // ───── 지출 추가 핸들러 ─────
  const handleAddExpense = async () => {
    if (!selectedCategory) {
      Alert.alert('알림', '카테고리를 선택해주세요');
      return;
    }
    const amount = parseInt(expenseAmount);
    if (!amount || amount <= 0) {
      Alert.alert('알림', '금액을 입력해주세요');
      return;
    }

    try {
      const txRef = collection(db, 'wallets', currentWalletId, 'transactions');
      await addDoc(txRef, {
        type: 'expense',
        fundType: 'personal',
        category: selectedCategory,
        amount,
        memo: expenseDesc || ALL_CATEGORY_NAMES[selectedCategory] || selectedCategory,
        date: new Date().toISOString().slice(0, 10),
        userId: user.uid,
        memberId: user.uid,
        member: currentWallet?.members?.[user.uid]?.name || user.displayName || user.email,
        memberName: currentWallet?.members?.[user.uid]?.name || user.displayName || user.email,
        createdAt: new Date().toISOString(),
      });
      setShowAddModal(false);
      setSelectedCategory(null);
      setExpenseAmount('');
      setExpenseDesc('');
    } catch (e) {
      Alert.alert('오류', e.message);
    }
  };

  // ═══════════════════════════════════════
  // 렌더
  // ═══════════════════════════════════════

  if (myAllowance === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          style={styles.emptyHeader}
        >
          <Ionicons name="wallet-outline" size={64} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyTitle}>용돈이 설정되지 않았어요</Text>
          <Text style={styles.emptySubtitle}>관리자에게 용돈 배분을 요청해주세요</Text>
        </LinearGradient>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ───── 헤더 ───── */}
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerDecor1} />
        <View style={styles.headerDecor2} />

        <Text style={styles.headerTitle}>💰 내 용돈</Text>
        <Text style={styles.headerMonth}>{formatMonth(report.currentMonth)}</Text>

        {/* 잔액 원형 인디케이터 */}
        <View style={styles.circleContainer}>
          <View style={styles.circleOuter}>
            <View
              style={[
                styles.circleProgress,
                {
                  backgroundColor:
                    remainingPercent > 50 ? '#2ECC71' : remainingPercent > 20 ? '#FFD93D' : '#FF6B6B',
                },
              ]}
            />
            <View style={styles.circleInner}>
              <Text style={styles.circlePercent}>{remainingPercent}%</Text>
              <Text style={styles.circleLabel}>남음</Text>
            </View>
          </View>
        </View>

        {/* 배분 / 사용 / 잔액 */}
        <View style={styles.headerStats}>
          <View style={styles.headerStatItem}>
            <Text style={styles.headerStatLabel}>배분</Text>
            <Text style={styles.headerStatValue}>{formatMoneyShort(myAllowance)}</Text>
          </View>
          <View style={[styles.headerStatDivider]} />
          <View style={styles.headerStatItem}>
            <Text style={styles.headerStatLabel}>사용</Text>
            <Text style={[styles.headerStatValue, { color: '#FF8E8E' }]}>
              {formatMoneyShort(report.current.spent)}
            </Text>
          </View>
          <View style={[styles.headerStatDivider]} />
          <View style={styles.headerStatItem}>
            <Text style={styles.headerStatLabel}>잔액</Text>
            <Text
              style={[
                styles.headerStatValue,
                { color: report.current.saved >= 0 ? '#A8F0C6' : '#FF8E8E' },
              ]}
            >
              {formatMoneyShort(report.current.saved)}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* ───── 용돈 저축 리포트 카드 ───── */}
      <View style={[styles.reportCard, { backgroundColor: colors.surface }]}>
        <View style={styles.reportHeader}>
          <Ionicons name="sparkles" size={20} color="#FFD93D" />
          <Text style={[styles.reportTitle, { color: colors.textBlack }]}>용돈 저축 리포트</Text>
        </View>

        <View style={styles.reportGrid}>
          {/* 저번 달 아낀 금액 */}
          <View style={[styles.reportItem, { backgroundColor: colors.background }]}>
            <View style={styles.reportItemHeader}>
              <Ionicons name="calendar-outline" size={18} color="#6C63FF" />
              <Text style={[styles.reportItemLabel, { color: colors.textGray }]}>
                저번 달 아낀 금액
              </Text>
            </View>
            <Text style={[styles.reportItemValue, { color: report.last.saved >= 0 ? colors.income : colors.expense }]}>
              {report.last.saved >= 0 ? '+' : ''}{formatMoney(report.last.saved)}
            </Text>
            {report.last.allowance > 0 && (
              <Text style={[styles.reportItemSub, { color: colors.textGray }]}>
                {Math.round((report.last.saved / report.last.allowance) * 100)}% 절약 성공!
              </Text>
            )}
          </View>

          {/* 누적 아낀 금액 */}
          <View style={[styles.reportItem, { backgroundColor: colors.background }]}>
            <View style={styles.reportItemHeader}>
              <Ionicons name="trending-up" size={18} color="#2ECC71" />
              <Text style={[styles.reportItemLabel, { color: colors.textGray }]}>
                누적 아낀 금액
              </Text>
            </View>
            <Text style={[styles.reportItemValue, { color: '#2ECC71' }]}>
              {formatMoney(report.totalSaved)}
            </Text>
            <Text style={[styles.reportItemSub, { color: colors.textGray }]}>
              최근 {report.recentMonths.length}개월 기준
            </Text>
          </View>

          {/* 평균 아낀 금액 */}
          <View style={[styles.reportItem, { backgroundColor: colors.background }]}>
            <View style={styles.reportItemHeader}>
              <Ionicons name="stats-chart-outline" size={18} color="#4ECDC4" />
              <Text style={[styles.reportItemLabel, { color: colors.textGray }]}>
                월 평균 아낀 금액
              </Text>
            </View>
            <Text style={[styles.reportItemValue, { color: colors.textBlack }]}>
              {formatMoney(report.avgSaved)}
            </Text>
            <Text style={[styles.reportItemSub, { color: colors.textGray }]}>
              매월 이만큼 절약 중
            </Text>
          </View>

          {/* 1년 예상 저축 */}
          <View
            style={[
              styles.reportItemWide,
              { backgroundColor: '#2ECC7115', borderColor: '#2ECC7133' },
            ]}
          >
            <View style={styles.reportItemWideLeft}>
              <Ionicons name="rocket-outline" size={24} color="#2ECC71" />
              <View style={{ marginLeft: 12 }}>
                <Text style={[styles.reportItemLabel, { color: colors.textGray }]}>
                  이 추세로 1년 모으면
                </Text>
                <Text style={[styles.reportItemValueLarge, { color: '#2ECC71' }]}>
                  {formatMoney(report.projectedYearly)}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 28 }}>🎉</Text>
          </View>
        </View>

        {/* 동기부여 메시지 */}
        <View style={[styles.cheerBox, { backgroundColor: colors.primary + '10' }]}>
          <Text style={{ fontSize: 24, marginBottom: 6 }}>
            {report.avgSaved >= 100000 ? '🏆' : report.avgSaved >= 50000 ? '🔥' : report.avgSaved >= 10000 ? '💪' : '🌱'}
          </Text>
          <Text style={[styles.cheerText, { color: colors.textDark }]}>
            {report.avgSaved >= 100000 
              ? '대단해요! 용돈 관리의 달인!' 
              : report.avgSaved >= 50000 
              ? '잘하고 있어요! 꾸준히 모으면 큰돈!' 
              : report.avgSaved >= 10000 
              ? '좋은 시작! 조금씩 더 아껴볼까요?' 
              : '시작이 반! 작은 절약도 큰 차이!'}
          </Text>
        </View>
      </View>

      {/* ───── 이번 달 사용 내역 ───── */}
      <View style={[styles.txSection, { backgroundColor: colors.surface }]}>
        <View style={styles.txHeader}>
          <Text style={[styles.txTitle, { color: colors.textBlack }]}>이번 달 사용 내역</Text>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={() => setShowAddModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addButtonText}>추가</Text>
          </TouchableOpacity>
        </View>

        {report.currentMonthTxs.length === 0 ? (
          <View style={styles.emptyTxContainer}>
            <Ionicons name="receipt-outline" size={48} color={colors.textGray + '44'} />
            <Text style={[styles.emptyTxText, { color: colors.textGray }]}>
              아직 용돈 사용 내역이 없어요
            </Text>
            <Text style={[styles.emptyTxSubText, { color: colors.textLight }]}>
              용돈을 아끼면 저축 리포트에 반영돼요!
            </Text>
          </View>
        ) : (
          report.currentMonthTxs.map((tx) => {
            const catColor = CATEGORY_COLORS[tx.category] || colors.category?.[tx.category] || '#95A5A6';
            const catIcon = ALL_CATEGORY_ICONS[tx.category] || 'ellipsis-horizontal-outline';
            const catName = ALL_CATEGORY_NAMES[tx.category] || tx.category;

            return (
              <View key={tx.id} style={[styles.txItem, { borderBottomColor: colors.divider }]}>
                <View style={[styles.txIconCircle, { backgroundColor: catColor + '20' }]}>
                  <Ionicons name={catIcon} size={20} color={catColor} />
                </View>
                <View style={styles.txInfo}>
                  <Text style={[styles.txCategory, { color: colors.textBlack }]}>{tx.memo || catName}</Text>
                  <Text style={[styles.txDesc, { color: colors.textGray }]}>
                    {tx.date?.includes('T')
                      ? new Date(tx.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
                      : (() => { const [,m,d] = (tx.date || '').split('-'); return `${parseInt(m)}월 ${parseInt(d)}일`; })()
                    }
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: colors.expense }]}>
                  -{formatMoneyShort(tx.amount)}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* 안내 메시지 */}
      <View style={[styles.infoBox, { backgroundColor: colors.surface }]}>
        <Ionicons name="lock-closed" size={16} color={colors.textGray} />
        <Text style={[styles.infoText, { color: colors.textGray }]}>
          용돈 사용 내역은 나만 볼 수 있어요
        </Text>
      </View>

      <View style={{ height: 40 }} />

      {/* ═════ 지출 추가 모달 ═════ */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHandle} />

            <Text style={[styles.modalTitle, { color: colors.textBlack }]}>용돈 사용 추가</Text>

            <Text style={[styles.modalLabel, { color: colors.textGray }]}>카테고리</Text>
            <View style={styles.categoryGrid}>
              {EXPENSE_CATEGORIES.map((cat) => {
                const catColor = CATEGORY_COLORS[cat.id] || colors.primary;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryItem,
                      {
                        backgroundColor:
                          selectedCategory === cat.id ? catColor + '20' : colors.background,
                        borderColor: selectedCategory === cat.id ? catColor : 'transparent',
                      },
                    ]}
                    onPress={() => setSelectedCategory(cat.id)}
                  >
                    <Ionicons
                      name={cat.icon}
                      size={22}
                      color={selectedCategory === cat.id ? catColor : colors.textGray}
                    />
                    <Text
                      style={[
                        styles.categoryItemText,
                        {
                          color: selectedCategory === cat.id ? catColor : colors.textGray,
                        },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.modalLabel, { color: colors.textGray }]}>금액</Text>
            <TextInput
              style={[
                styles.modalInput,
                { backgroundColor: colors.background, color: colors.textBlack },
              ]}
              placeholder="금액을 입력하세요"
              placeholderTextColor={colors.textGray + '88'}
              keyboardType="number-pad"
              value={expenseAmount}
              onChangeText={setExpenseAmount}
            />

            <Text style={[styles.modalLabel, { color: colors.textGray }]}>메모 (선택)</Text>
            <TextInput
              style={[
                styles.modalInput,
                { backgroundColor: colors.background, color: colors.textBlack },
              ]}
              placeholder="어디서 사용했나요?"
              placeholderTextColor={colors.textGray + '88'}
              value={expenseDesc}
              onChangeText={setExpenseDesc}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.background }]}
                onPress={() => {
                  setShowAddModal(false);
                  setSelectedCategory(null);
                  setExpenseAmount('');
                  setExpenseDesc('');
                }}
              >
                <Text style={[styles.modalBtnText, { color: colors.textGray }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: colors.primary }]}
                onPress={handleAddExpense}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>추가</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ═════════════════════════════════════════
// 스타일
// ═════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 30 },

  // 빈 상태
  emptyHeader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginTop: 20,
  },
  emptySubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 8,
  },

  // 헤더
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 32,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  headerDecor1: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -40,
    right: -40,
  },
  headerDecor2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -20,
    left: -20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  headerMonth: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    marginBottom: 20,
  },

  // 원형 인디케이터
  circleContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  circleOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleProgress: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    opacity: 0.3,
  },
  circleInner: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circlePercent: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  circleLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginTop: -2,
  },

  // 헤더 통계
  headerStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  headerStatItem: { alignItems: 'center', flex: 1 },
  headerStatDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  headerStatValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // 리포트 카드
  reportCard: {
    margin: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  reportTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginLeft: 8,
  },
  reportGrid: {
    gap: 10,
  },
  reportItem: {
    borderRadius: 14,
    padding: 16,
  },
  reportItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  reportItemLabel: {
    fontSize: 12,
  },
  reportItemValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  reportItemSub: {
    fontSize: 11,
    marginTop: 4,
  },
  reportItemWide: {
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    marginTop: 6,
  },
  reportItemWideLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reportItemValueLarge: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 2,
  },
  cheerBox: {
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  cheerText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },

  // 거래 내역
  txSection: {
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  txHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  txTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyTxContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyTxText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyTxSubText: {
    marginTop: 4,
    fontSize: 12,
  },
  txItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  txIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txInfo: {
    flex: 1,
    marginLeft: 12,
  },
  txCategory: {
    fontSize: 15,
    fontWeight: '600',
  },
  txDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
  },

  // 안내
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
  },
  infoText: {
    fontSize: 12,
  },

  // 모달
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ccc',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  categoryItemText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  modalInput: {
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalBtnPrimary: {},
  modalBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});