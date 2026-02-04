/**
 * AllowanceScreen.js
 * ─────────────────────────────────────────────
 * 개인 용돈 관리 화면
 *   - 관리자: 가족 용돈 관리 + 요청 승인/거절
 *   - 일반 사용자: 용돈 없을 시 요청 기능
 *   - 용돈 리포트, 사용 내역
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
import { collection, query, where, onSnapshot, addDoc, orderBy, doc, updateDoc } from 'firebase/firestore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const showAlert = (title, message, buttons) => {
  if (Platform.OS === 'web') {
    if (buttons) {
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed && buttons[1]) buttons[1].onPress();
    } else { window.alert(`${title}\n\n${message}`); }
  } else { Alert.alert(title, message, buttons); }
};

// 카테고리 색상은 ThemeContext의 category 색상 사용 (아래에서 colors.category 참조)

export default function AllowanceScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const {
    currentWalletId, currentWallet, isAdmin,
    requestAllowance, respondToAllowanceRequest,
  } = useWallet();

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [personalTransactions, setPersonalTransactions] = useState([]);

  // 용돈 요청 관련
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [allowanceRequests, setAllowanceRequests] = useState([]);

  // 관리자: 요청 승인 모달
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [approveAmount, setApproveAmount] = useState('');
  const [approveLoading, setApproveLoading] = useState(false);
  const [setAllowanceLoading, setSetAllowanceLoading] = useState(false);

  // 관리자: 용돈 설정 모달
  const [showSetAllowanceModal, setShowSetAllowanceModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [setAllowanceAmount, setSetAllowanceAmount] = useState('');

  // 내 용돈 금액
  const myAllowance = currentWallet?.members?.[user?.uid]?.monthlyAllowance
    || currentWallet?.members?.[user?.uid]?.allowance || 0;

  // 멤버 목록
  const members = currentWallet?.members
    ? Object.entries(currentWallet.members).map(([uid, data]) => ({ uid, ...data }))
    : [];

  // ★ 용돈 요청 리스너
  useEffect(() => {
    if (!currentWalletId) return;
    const reqRef = collection(db, 'wallets', currentWalletId, 'allowanceRequests');
    const q = query(reqRef, orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setAllowanceRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [currentWalletId]);

  // 내 대기 중 요청
  const myPendingRequest = allowanceRequests.find(
    (r) => r.userId === user?.uid && r.status === 'pending'
  );

  // 관리자: 대기 중인 요청들
  const pendingRequests = allowanceRequests.filter((r) => r.status === 'pending');

  // ★ 내 용돈 사용 내역만 가져오기
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

  // ───── 월별 데이터 계산 ─────
  const monthlyStats = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const stats = {};

    const allocatedMonths = {};
    allocationTransactions.forEach((tx) => {
      const ym = tx.allocMonth || tx.date?.slice(0, 7);
      if (ym) allocatedMonths[ym] = tx.amount || 0;
    });

    if (!allocatedMonths[currentMonth] && myAllowance > 0) {
      allocatedMonths[currentMonth] = myAllowance;
    }

    Object.entries(allocatedMonths).forEach(([ym, amount]) => {
      stats[ym] = { allowance: amount, spent: 0, saved: amount };
    });

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

    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const current = monthlyStats[currentMonth] || { allowance: myAllowance, spent: 0, saved: myAllowance };
    const last = monthlyStats[lastMonthKey] || { allowance: myAllowance, spent: 0, saved: myAllowance };

    const recentMonths = [];
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyStats[key] && monthlyStats[key].allowance > 0) {
        recentMonths.push(monthlyStats[key]);
      }
    }

    const totalSaved = recentMonths.reduce((sum, m) => sum + Math.max(0, m.saved), 0);
    const avgSaved = recentMonths.length > 0
      ? Math.round(totalSaved / recentMonths.length)
      : Math.max(0, current.saved);
    const projectedYearly = avgSaved * 12;

    const currentMonthTxs = personalTransactions.filter(
      (tx) => tx.date?.slice(0, 7) === currentMonth
    );

    return { currentMonth, lastMonthKey, current, last, totalSaved, avgSaved, projectedYearly, currentMonthTxs, recentMonths };
  }, [monthlyStats, personalTransactions, myAllowance]);

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

  const formatMonth = (ym) => {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    return `${y}년 ${parseInt(m)}월`;
  };

  // ───── 지출 추가 핸들러 ─────
  const handleAddExpense = async () => {
    if (!selectedCategory) {
      showAlert('알림', '카테고리를 선택해주세요');
      return;
    }
    const amount = parseInt(expenseAmount);
    if (!amount || amount <= 0) {
      showAlert('알림', '금액을 입력해주세요');
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
      showAlert('오류', e.message);
    }
  };

  // ───── 용돈 요청 핸들러 ─────
  const handleRequestAllowance = async () => {
    const amount = parseInt(requestAmount);
    if (!amount || amount <= 0) {
      showAlert('알림', '금액을 입력해주세요');
      return;
    }
    setRequestLoading(true);
    const result = await requestAllowance(amount, requestMessage);
    setRequestLoading(false);
    if (result.success) {
      setShowRequestModal(false);
      setRequestAmount('');
      setRequestMessage('');
      showAlert('요청 완료', '관리자에게 용돈 요청을 보냈어요!');
    } else {
      showAlert('오류', result.message);
    }
  };

  // ───── 관리자: 요청 승인 ─────
  const handleApproveRequest = async () => {
    if (!selectedRequest) return;
    if (!isAdmin) { showAlert('권한 없음', '관리자만 요청을 승인할 수 있습니다.'); return; }
    const amount = parseInt(approveAmount);
    if (!amount || amount <= 0) {
      showAlert('알림', '금액을 입력해주세요');
      return;
    }
    setApproveLoading(true);
    const result = await respondToAllowanceRequest(selectedRequest.id, true, amount);
    setApproveLoading(false);
    if (result.success) {
      setShowApproveModal(false);
      setSelectedRequest(null);
      setApproveAmount('');
      showAlert('승인 완료', `${selectedRequest.userName}님의 용돈이 ${amount.toLocaleString()}원으로 설정되었어요!`);
    } else {
      showAlert('오류', result.message);
    }
  };

  // ───── 관리자: 요청 거절 ─────
  const handleRejectRequest = async (req) => {
    if (!isAdmin) { showAlert('권한 없음', '관리자만 요청을 거절할 수 있습니다.'); return; }
    showAlert('요청 거절', `${req.userName}님의 요청을 거절할까요?`, [
      { text: '취소' },
      {
        text: '거절',
        onPress: async () => {
          const result = await respondToAllowanceRequest(req.id, false, 0);
          if (result.success) showAlert('완료', '요청을 거절했어요.');
          else showAlert('오류', result.message);
        },
      },
    ]);
  };

  // ───── 관리자: 용돈 직접 설정 ─────
  const handleSetAllowance = async () => {
    if (!selectedMember) return;
    if (!isAdmin) { showAlert('권한 없음', '관리자만 용돈을 설정할 수 있습니다.'); return; }
    const amt = parseInt(setAllowanceAmount) || 0;
    setSetAllowanceLoading(true);
    try {
      await updateDoc(doc(db, 'wallets', currentWalletId), {
        [`members.${selectedMember.uid}.allowance`]: amt,
        [`members.${selectedMember.uid}.monthlyAllowance`]: amt,
      });
      setSetAllowanceLoading(false);
      showAlert('설정 완료', `${selectedMember.name}님의 월 용돈: ${amt.toLocaleString('ko-KR')}원`);
      setShowSetAllowanceModal(false);
      setSelectedMember(null);
      setSetAllowanceAmount('');
    } catch (e) {
      setSetAllowanceLoading(false);
      showAlert('오류', '용돈 설정에 실패했습니다.');
    }
  };

  // ═══════════════════════════════════════
  // 관리자용 상단 섹션
  // ═══════════════════════════════════════

  const renderAdminSection = () => {
    if (!isAdmin) return null;

    return (
      <>
        {/* 대기 중인 요청 */}
        {pendingRequests.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: '#FF6B6B18' }]}>
                <Ionicons name="notifications" size={20} color="#FF6B6B" />
              </View>
              <Text style={[styles.cardTitle, { color: colors.textBlack }]}>
                용돈 요청 ({pendingRequests.length})
              </Text>
            </View>

            {pendingRequests.map((req) => (
              <View
                key={req.id}
                style={[styles.requestCard, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                <View style={styles.requestTop}>
                  <View style={[styles.requestAvatar, { backgroundColor: colors.primary }]}>
                    <Text style={styles.requestAvatarText}>{(req.userName || '?').charAt(0)}</Text>
                  </View>
                  <View style={styles.requestInfo}>
                    <Text style={[styles.requestName, { color: colors.textBlack }]}>{req.userName}</Text>
                    <Text style={[styles.requestAmountText, { color: colors.primary }]}>
                      {parseInt(req.amount).toLocaleString()}원 요청
                    </Text>
                    {req.message ? (
                      <Text style={[styles.requestMsg, { color: colors.textGray }]}>"{req.message}"</Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.requestButtons}>
                  <TouchableOpacity
                    style={[styles.requestBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      setSelectedRequest(req);
                      setApproveAmount(String(req.amount));
                      setShowApproveModal(true);
                    }}
                  >
                    <Ionicons name="checkmark" size={16} color="#FFF" />
                    <Text style={styles.requestBtnText}>승인</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.requestBtn, { backgroundColor: colors.expense + '20' }]}
                    onPress={() => handleRejectRequest(req)}
                  >
                    <Ionicons name="close" size={16} color={colors.expense} />
                    <Text style={[styles.requestBtnText, { color: colors.expense }]}>거절</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* 가족 용돈 관리 */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardHeaderIcon, { backgroundColor: colors.primary + '18' }]}>
              <Ionicons name="people" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.cardTitle, { color: colors.textBlack }]}>가족 용돈 관리</Text>
          </View>

          {members.map((m) => {
            const allow = m.monthlyAllowance || m.allowance || 0;
            return (
              <TouchableOpacity
                key={m.uid}
                style={[styles.memberRow, { borderBottomColor: colors.divider }]}
                onPress={() => {
                  setSelectedMember(m);
                  setSetAllowanceAmount(String(allow));
                  setShowSetAllowanceModal(true);
                }}
                activeOpacity={0.6}
              >
                <View style={[styles.memberAvatar, m.role === 'admin' && { backgroundColor: colors.primary }]}>
                  <Text style={styles.memberAvatarText}>{(m.name || '?').charAt(0)}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={[styles.memberName, { color: colors.textBlack }]}>
                    {m.name}{m.role === 'admin' ? ' 👑' : ''}
                  </Text>
                  <Text style={[styles.memberAllowance, { color: allow > 0 ? colors.primary : colors.textLight }]}>
                    {allow > 0 ? `월 ${allow.toLocaleString()}원` : '미설정'}
                  </Text>
                </View>
                <View style={[styles.memberEditBtn, { backgroundColor: colors.primary + '12' }]}>
                  <Ionicons name="pencil" size={14} color={colors.primary} />
                  <Text style={[styles.memberEditText, { color: colors.primary }]}>설정</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </>
    );
  };

  // ═══════════════════════════════════════
  // 용돈 미설정 상태 (일반 사용자)
  // ═══════════════════════════════════════

  const renderNoAllowance = () => {
    // 관리자는 용돈 0이어도 자기 관리 섹션 보여줌
    if (isAdmin) return null;

    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.noAllowanceContainer}>
          <View style={[styles.noAllowanceIcon, { backgroundColor: colors.primary + '12' }]}>
            <Ionicons name="wallet-outline" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.noAllowanceTitle, { color: colors.textBlack }]}>
            용돈이 설정되지 않았어요
          </Text>
          <Text style={[styles.noAllowanceDesc, { color: colors.textGray }]}>
            관리자에게 용돈을 요청해보세요!
          </Text>

          {myPendingRequest ? (
            <View style={[styles.pendingBadge, { backgroundColor: '#FFD93D20', borderColor: '#FFD93D50' }]}>
              <Ionicons name="time-outline" size={18} color="#E6A800" />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={[styles.pendingBadgeTitle, { color: colors.textBlack }]}>요청 대기 중</Text>
                <Text style={[styles.pendingBadgeAmount, { color: '#E6A800' }]}>
                  {parseInt(myPendingRequest.amount).toLocaleString()}원
                </Text>
                {myPendingRequest.message ? (
                  <Text style={[styles.pendingBadgeMsg, { color: colors.textGray }]}>
                    "{myPendingRequest.message}"
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.requestAllowanceBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowRequestModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="hand-right-outline" size={20} color="#FFF" />
              <Text style={styles.requestAllowanceBtnText}>용돈 요청하기</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ═══════════════════════════════════════
  // 메인 렌더
  // ═══════════════════════════════════════

  const hasAllowance = myAllowance > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
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

          <Text style={styles.headerTitle}>💰 {isAdmin ? '용돈 관리' : '내 용돈'}</Text>
          <Text style={styles.headerMonth}>{formatMonth(report.currentMonth)}</Text>

          {hasAllowance && (
            <>
              {/* 잔액 원형 인디케이터 */}
              <View style={styles.circleContainer}>
                <View style={styles.circleOuter}>
                  <View
                    style={[
                      styles.circleProgress,
                      {
                        backgroundColor:
                          remainingPercent > 50 ? colors.income : remainingPercent > 20 ? colors.warning : colors.expense,
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
                <View style={styles.headerStatDivider} />
                <View style={styles.headerStatItem}>
                  <Text style={styles.headerStatLabel}>사용</Text>
                  <Text style={[styles.headerStatValue, { color: '#FF8E8E' }]}>
                    {formatMoneyShort(report.current.spent)}
                  </Text>
                </View>
                <View style={styles.headerStatDivider} />
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
            </>
          )}

          {!hasAllowance && !isAdmin && (
            <View style={styles.headerEmptyMsg}>
              <Ionicons name="information-circle-outline" size={20} color="rgba(255,255,255,0.7)" />
              <Text style={styles.headerEmptyText}>아래에서 용돈을 요청할 수 있어요</Text>
            </View>
          )}
        </LinearGradient>

        <View style={styles.contentArea}>
          {/* 관리자 섹션 */}
          {renderAdminSection()}

          {/* 용돈 미설정 상태 */}
          {!hasAllowance && renderNoAllowance()}

          {/* ───── 용돈 저축 리포트 카드 ───── */}
          {hasAllowance && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: '#FFD93D18' }]}>
                  <Ionicons name="sparkles" size={20} color="#FFD93D" />
                </View>
                <Text style={[styles.cardTitle, { color: colors.textBlack }]}>용돈 저축 리포트</Text>
              </View>

              <View style={styles.reportGrid}>
                <View style={[styles.reportItem, { backgroundColor: colors.background }]}>
                  <View style={styles.reportItemHeader}>
                    <Ionicons name="calendar-outline" size={18} color="#6C63FF" />
                    <Text style={[styles.reportItemLabel, { color: colors.textGray }]}>저번 달 아낀 금액</Text>
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

                <View style={[styles.reportItem, { backgroundColor: colors.background }]}>
                  <View style={styles.reportItemHeader}>
                    <Ionicons name="trending-up" size={18} color={colors.income} />
                    <Text style={[styles.reportItemLabel, { color: colors.textGray }]}>누적 아낀 금액</Text>
                  </View>
                  <Text style={[styles.reportItemValue, { color: colors.income }]}>
                    {formatMoney(report.totalSaved)}
                  </Text>
                  <Text style={[styles.reportItemSub, { color: colors.textGray }]}>
                    최근 {report.recentMonths.length}개월 기준
                  </Text>
                </View>

                <View style={[styles.reportItem, { backgroundColor: colors.background }]}>
                  <View style={styles.reportItemHeader}>
                    <Ionicons name="stats-chart-outline" size={18} color="#4ECDC4" />
                    <Text style={[styles.reportItemLabel, { color: colors.textGray }]}>월 평균 아낀 금액</Text>
                  </View>
                  <Text style={[styles.reportItemValue, { color: colors.textBlack }]}>
                    {formatMoney(report.avgSaved)}
                  </Text>
                  <Text style={[styles.reportItemSub, { color: colors.textGray }]}>매월 이만큼 절약 중</Text>
                </View>

                <View
                  style={[styles.reportItemWide, { backgroundColor: colors.income + '15', borderColor: colors.income + '33' }]}
                >
                  <View style={styles.reportItemWideLeft}>
                    <Ionicons name="rocket-outline" size={24} color={colors.income} />
                    <View style={{ marginLeft: 12 }}>
                      <Text style={[styles.reportItemLabel, { color: colors.textGray }]}>이 추세로 1년 모으면</Text>
                      <Text style={[styles.reportItemValueLarge, { color: colors.income }]}>
                        {formatMoney(report.projectedYearly)}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 28 }}>🎉</Text>
                </View>
              </View>

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
          )}

          {/* ───── 이번 달 사용 내역 ───── */}
          {hasAllowance && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.txHeader}>
                <Text style={[styles.cardTitle, { color: colors.textBlack }]}>이번 달 사용 내역</Text>
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
                  const catColor = colors.category?.[tx.category] || '#95A5A6';
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
                            : (() => { const [, m2, d] = (tx.date || '').split('-'); return `${parseInt(m2)}월 ${parseInt(d)}일`; })()
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
          )}

          {/* 안내 메시지 */}
          {hasAllowance && (
            <View style={[styles.infoBox, { backgroundColor: colors.surface }]}>
              <Ionicons name="lock-closed" size={16} color={colors.textGray} />
              <Text style={[styles.infoText, { color: colors.textGray }]}>
                용돈 사용 내역은 나만 볼 수 있어요
              </Text>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ═════ 지출 추가 모달 ═════ */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.textBlack }]}>용돈 사용 추가</Text>

            <Text style={[styles.modalLabel, { color: colors.textGray }]}>카테고리</Text>
            <View style={styles.categoryGrid}>
              {EXPENSE_CATEGORIES.map((cat) => {
                const catColor = colors.category?.[cat.id] || colors.primary;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryItem,
                      {
                        backgroundColor: selectedCategory === cat.id ? catColor + '20' : colors.background,
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
                        { color: selectedCategory === cat.id ? catColor : colors.textGray },
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
              style={[styles.modalInput, { backgroundColor: colors.background, color: colors.textBlack }]}
              placeholder="금액을 입력하세요"
              placeholderTextColor={colors.textGray + '88'}
              keyboardType="number-pad"
              value={expenseAmount}
              onChangeText={setExpenseAmount}
            />

            <Text style={[styles.modalLabel, { color: colors.textGray }]}>메모 (선택)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.background, color: colors.textBlack }]}
              placeholder="어디서 사용했나요?"
              placeholderTextColor={colors.textGray + '88'}
              value={expenseDesc}
              onChangeText={setExpenseDesc}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.background }]}
                onPress={() => { setShowAddModal(false); setSelectedCategory(null); setExpenseAmount(''); setExpenseDesc(''); }}
              >
                <Text style={[styles.modalBtnText, { color: colors.textGray }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={handleAddExpense}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>추가</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═════ 용돈 요청 모달 ═════ */}
      <Modal visible={showRequestModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.textBlack }]}>용돈 요청하기</Text>
            <Text style={[styles.modalDesc, { color: colors.textGray }]}>
              관리자에게 원하는 용돈 금액을 요청해요
            </Text>

            <Text style={[styles.modalLabel, { color: colors.textGray }]}>희망 금액</Text>
            <TextInput
              style={[styles.modalInput, styles.modalInputLarge, { backgroundColor: colors.background, color: colors.primary }]}
              placeholder="100,000"
              placeholderTextColor={colors.textGray + '88'}
              keyboardType="number-pad"
              value={requestAmount}
              onChangeText={(t) => setRequestAmount(t.replace(/[^0-9]/g, ''))}
            />
            {requestAmount ? (
              <Text style={[styles.previewAmount, { color: colors.primary }]}>
                {parseInt(requestAmount).toLocaleString()}원
              </Text>
            ) : null}

            <Text style={[styles.modalLabel, { color: colors.textGray }]}>메시지 (선택)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.background, color: colors.textBlack }]}
              placeholder="요청 사유를 간단히 적어주세요"
              placeholderTextColor={colors.textGray + '88'}
              value={requestMessage}
              onChangeText={setRequestMessage}
              maxLength={50}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.background }]}
                onPress={() => { setShowRequestModal(false); setRequestAmount(''); setRequestMessage(''); }}
              >
                <Text style={[styles.modalBtnText, { color: colors.textGray }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary, opacity: requestLoading ? 0.6 : 1 }]}
                onPress={handleRequestAllowance}
                disabled={requestLoading}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>
                  {requestLoading ? '요청 중...' : '요청 보내기'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═════ 관리자: 요청 승인 모달 ═════ */}
      <Modal visible={showApproveModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.textBlack }]}>용돈 요청 승인</Text>

            {selectedRequest && (
              <View style={[styles.approveInfoBox, { backgroundColor: colors.background }]}>
                <View style={styles.approveInfoRow}>
                  <Text style={[styles.approveInfoLabel, { color: colors.textGray }]}>요청자</Text>
                  <Text style={[styles.approveInfoValue, { color: colors.textBlack }]}>{selectedRequest.userName}</Text>
                </View>
                <View style={styles.approveInfoRow}>
                  <Text style={[styles.approveInfoLabel, { color: colors.textGray }]}>요청 금액</Text>
                  <Text style={[styles.approveInfoValue, { color: colors.primary }]}>
                    {parseInt(selectedRequest.amount).toLocaleString()}원
                  </Text>
                </View>
                {selectedRequest.message ? (
                  <View style={styles.approveInfoRow}>
                    <Text style={[styles.approveInfoLabel, { color: colors.textGray }]}>메시지</Text>
                    <Text style={[styles.approveInfoValue, { color: colors.textDark }]}>"{selectedRequest.message}"</Text>
                  </View>
                ) : null}
              </View>
            )}

            <Text style={[styles.modalLabel, { color: colors.textGray }]}>설정할 금액 (수정 가능)</Text>
            <TextInput
              style={[styles.modalInput, styles.modalInputLarge, { backgroundColor: colors.background, color: colors.primary }]}
              placeholder="금액"
              placeholderTextColor={colors.textGray + '88'}
              keyboardType="number-pad"
              value={approveAmount}
              onChangeText={(t) => setApproveAmount(t.replace(/[^0-9]/g, ''))}
            />
            {approveAmount ? (
              <Text style={[styles.previewAmount, { color: colors.primary }]}>
                {parseInt(approveAmount).toLocaleString()}원
              </Text>
            ) : null}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.background }]}
                onPress={() => { setShowApproveModal(false); setSelectedRequest(null); setApproveAmount(''); }}
              >
                <Text style={[styles.modalBtnText, { color: colors.textGray }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary, opacity: approveLoading ? 0.6 : 1 }]}
                onPress={handleApproveRequest}
                disabled={approveLoading}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>
                  {approveLoading ? '처리 중...' : '승인하기'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═════ 관리자: 용돈 직접 설정 모달 ═════ */}
      <Modal visible={showSetAllowanceModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.textBlack }]}>
              {selectedMember?.name}님 용돈 설정
            </Text>

            <Text style={[styles.modalLabel, { color: colors.textGray }]}>월 용돈 금액</Text>
            <TextInput
              style={[styles.modalInput, styles.modalInputLarge, { backgroundColor: colors.background, color: colors.primary }]}
              placeholder="금액"
              placeholderTextColor={colors.textGray + '88'}
              keyboardType="number-pad"
              value={setAllowanceAmount}
              onChangeText={(t) => setSetAllowanceAmount(t.replace(/[^0-9]/g, ''))}
            />
            {setAllowanceAmount && setAllowanceAmount !== '0' ? (
              <Text style={[styles.previewAmount, { color: colors.primary }]}>
                {parseInt(setAllowanceAmount).toLocaleString()}원
              </Text>
            ) : null}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.background }]}
                onPress={() => { setShowSetAllowanceModal(false); setSelectedMember(null); setSetAllowanceAmount(''); }}
              >
                <Text style={[styles.modalBtnText, { color: colors.textGray }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary, opacity: setAllowanceLoading ? 0.6 : 1 }]}
                onPress={handleSetAllowance}
                disabled={setAllowanceLoading}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>
                  {setAllowanceLoading ? '설정 중...' : '설정'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ═════════════════════════════════════════
// 스타일
// ═════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 30 },
  contentArea: { paddingHorizontal: 16, paddingTop: 16 },

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
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.08)', top: -40, right: -40,
  },
  headerDecor2: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.06)', bottom: -20, left: -20,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  headerMonth: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 2, marginBottom: 20 },
  headerEmptyMsg: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 12, paddingVertical: 14, marginTop: -4,
  },
  headerEmptyText: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },

  // 원형 인디케이터
  circleContainer: { alignItems: 'center', marginBottom: 20 },
  circleOuter: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  circleProgress: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50, opacity: 0.3,
  },
  circleInner: {
    width: 78, height: 78, borderRadius: 39,
    backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', alignItems: 'center',
  },
  circlePercent: { fontSize: 24, fontWeight: '800', color: '#fff' },
  circleLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: -2 },

  // 헤더 통계
  headerStats: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8,
  },
  headerStatItem: { alignItems: 'center', flex: 1 },
  headerStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  headerStatLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 },
  headerStatValue: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // 카드 공통
  card: {
    borderRadius: 20, padding: 20, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  cardHeaderIcon: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '700', flex: 1 },

  // 관리자: 요청 카드
  requestCard: {
    borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1,
  },
  requestTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  requestAvatar: {
    width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center',
  },
  requestAvatarText: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  requestInfo: { flex: 1, marginLeft: 12 },
  requestName: { fontSize: 15, fontWeight: '700' },
  requestAmountText: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  requestMsg: { fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  requestButtons: { flexDirection: 'row', gap: 10 },
  requestBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 10, borderRadius: 10,
  },
  requestBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

  // 관리자: 멤버 행
  memberRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1,
  },
  memberAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#95A5A6', justifyContent: 'center', alignItems: 'center',
  },
  memberAvatarText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberName: { fontSize: 15, fontWeight: '600' },
  memberAllowance: { fontSize: 13, marginTop: 2 },
  memberEditBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  memberEditText: { fontSize: 12, fontWeight: '600' },

  // 용돈 미설정
  noAllowanceContainer: { alignItems: 'center', paddingVertical: 20 },
  noAllowanceIcon: {
    width: 72, height: 72, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  noAllowanceTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  noAllowanceDesc: { fontSize: 14, marginBottom: 20 },

  pendingBadge: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    borderRadius: 14, padding: 16, borderWidth: 1.5, marginTop: 4,
  },
  pendingBadgeTitle: { fontSize: 14, fontWeight: '700' },
  pendingBadgeAmount: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  pendingBadgeMsg: { fontSize: 12, marginTop: 4 },

  requestAllowanceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14,
  },
  requestAllowanceBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

  // 리포트
  reportGrid: { gap: 10 },
  reportItem: { borderRadius: 14, padding: 16 },
  reportItemHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  reportItemLabel: { fontSize: 12 },
  reportItemValue: { fontSize: 22, fontWeight: '800' },
  reportItemSub: { fontSize: 11, marginTop: 4 },
  reportItemWide: {
    borderRadius: 14, padding: 18, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, marginTop: 6,
  },
  reportItemWideLeft: { flexDirection: 'row', alignItems: 'center' },
  reportItemValueLarge: { fontSize: 24, fontWeight: '800', marginTop: 2 },
  cheerBox: { borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 12 },
  cheerText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },

  // 거래 내역
  txHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  addButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  addButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  emptyTxContainer: { alignItems: 'center', paddingVertical: 32 },
  emptyTxText: { marginTop: 12, fontSize: 14, fontWeight: '600' },
  emptyTxSubText: { marginTop: 4, fontSize: 12 },
  txItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  txIconCircle: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  txInfo: { flex: 1, marginLeft: 12 },
  txCategory: { fontSize: 15, fontWeight: '600' },
  txDesc: { fontSize: 12, marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: '700' },

  // 안내
  infoBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 0, padding: 12, borderRadius: 12,
  },
  infoText: { fontSize: 12 },

  // 모달 공통
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#ccc', alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  modalDesc: { fontSize: 14, marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  modalInput: { borderRadius: 12, padding: 14, fontSize: 16 },
  modalInputLarge: { fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: 1 },
  previewAmount: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 6, marginBottom: -4 },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 24 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  modalBtnText: { fontSize: 16, fontWeight: '700' },

  // 승인 모달 정보박스
  approveInfoBox: { borderRadius: 14, padding: 16, marginBottom: 4 },
  approveInfoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6,
  },
  approveInfoLabel: { fontSize: 13 },
  approveInfoValue: { fontSize: 15, fontWeight: '600' },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5,
  },
  categoryItemText: { fontSize: 13, fontWeight: '600', marginLeft: 6 },
});
