import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, StatusBar, ActivityIndicator,
  TouchableOpacity, Alert, Modal, TextInput, Platform, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../constants/ThemeContext';
import { useAuth } from '../constants/AuthContext';
import { useWallet } from '../constants/WalletContext';
import { ALL_CATEGORY_NAMES, ALL_CATEGORY_ICONS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, FUND_TYPE_MAP, FUND_TYPES } from '../constants/categories';
import { formatAmountInput, parseAmount, validateAmount, validateFundType } from '../utils/format';
import { db } from '../firebase/firebaseConfig';
import {
  collection, onSnapshot, orderBy, query, deleteDoc, doc, getDocs, updateDoc, addDoc,
} from 'firebase/firestore';

const showAlert = (title, message, buttons) => {
  if (Platform.OS === 'web') {
    if (buttons) {
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed && buttons[1]) buttons[1].onPress();
    } else { window.alert(`${title}\n\n${message}`); }
  } else { Alert.alert(title, message, buttons); }
};

export default function HomeScreen() {
  const { colors: Colors, isDark } = useTheme();
  const { user, userProfile } = useAuth();
  const { currentWalletId, currentWallet, isAdmin, sharedBudgetInfo, accumulatedFunds, monthlyFundBreakdown } = useWallet();
  const styles = getStyles(Colors);

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [editType, setEditType] = useState('expense');
  const [editFundType, setEditFundType] = useState('shared');
  
  // ★ 빠른 등록 모달
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickType, setQuickType] = useState('expense'); // 'expense', 'income', 'fixed'
  const [quickAmount, setQuickAmount] = useState('');
  const [quickCategory, setQuickCategory] = useState(null);
  const [quickMemo, setQuickMemo] = useState('');
  const [quickFundType, setQuickFundType] = useState('shared');

  // ★ 고정지출 등록용
  const [fixedName, setFixedName] = useState('');
  const [fixedDay, setFixedDay] = useState('');
  const [fixedType, setFixedType] = useState('expense'); // 'expense' or 'income'

  // ★ 주간 차트 선택 바
  const [selectedBarIdx, setSelectedBarIdx] = useState(null);
  
  // ★ 검색/필터
  const [showFilter, setShowFilter] = useState(false);
  const [filterFundType, setFilterFundType] = useState('all'); // all, shared, personal
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterType, setFilterType] = useState('all'); // all, income, expense
  const [searchText, setSearchText] = useState('');

  const autoRecordDone = useRef(false);
  const fabAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!currentWalletId) { setLoading(false); return; }
    const q = query(collection(db, 'wallets', currentWalletId, 'transactions'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setTransactions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [currentWalletId]);

  // 고정 지출/수입 자동 기록 (DB의 lastRecordedMonth로 중복 방지)
  useEffect(() => {
    if (!isAdmin || !currentWalletId || autoRecordDone.current) return;
    autoRecordDone.current = true;  // 컴포넌트 내 중복 방지
    const autoRecord = async () => {
      try {
        const now = new Date();
        const today = now.getDate();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const fixedSnapshot = await getDocs(collection(db, 'wallets', currentWalletId, 'fixedExpenses'));
        let expCount = 0, incCount = 0;
        for (const fixedDoc of fixedSnapshot.docs) {
          const data = fixedDoc.data();
          if (data.active === false) continue;
          if (data.lastRecordedMonth === currentMonth) continue;
          const effectiveDay = Math.min(data.day || 1, lastDay);
          if (today >= effectiveDay) {
            const isIncome = data.type === 'income';
            const txData = {
              type: isIncome ? 'income' : 'expense',
              amount: data.amount,
              category: data.category || (isIncome ? 'salary' : 'housing'),
              memo: `[자동] ${data.name}`,
              member: '자동 기록',
              userId: 'system',
              date: new Date(now.getFullYear(), now.getMonth(), effectiveDay).toISOString(),
              createdAt: new Date().toISOString(),
              fixedExpenseId: fixedDoc.id,
            };
            if (!isIncome) txData.fundType = data.fundType || 'utility';
            await addDoc(collection(db, 'wallets', currentWalletId, 'transactions'), txData);
            await updateDoc(doc(db, 'wallets', currentWalletId, 'fixedExpenses', fixedDoc.id), { lastRecordedMonth: currentMonth });
            if (isIncome) incCount++; else expCount++;
          }
        }
        const msgs = [];
        if (expCount > 0) msgs.push(`고정 지출 ${expCount}건`);
        if (incCount > 0) msgs.push(`고정 수입 ${incCount}건`);
        if (msgs.length > 0) showAlert('자동 기록 📋', `${msgs.join(', ')} 자동 기록 완료!`);
      } catch (error) { if (__DEV__) console.error('자동 기록 오류:', error); }
    };
    autoRecord();
  }, [isAdmin, currentWalletId]);

  // FAB 애니메이션
  useEffect(() => {
    Animated.spring(fabAnim, {
      toValue: showQuickAdd ? 1 : 0,
      useNativeDriver: true,
      friction: 6,
    }).start();
  }, [showQuickAdd]);

  const handleEdit = (item) => {
    setEditingItem(item); setEditAmount(item.amount ? item.amount.toLocaleString('ko-KR') : '');
    setEditCategory(item.category); setEditMemo(item.memo || '');
    setEditType(item.type); setEditFundType(item.fundType || 'shared');
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    const numAmount = parseAmount(editAmount);
    const amtCheck = validateAmount(numAmount);
    if (!amtCheck.valid) { showAlert('알림', amtCheck.message); return; }
    try {
      const updateData = { amount: numAmount, category: editCategory, memo: editMemo, type: editType };
      if (editType === 'expense') updateData.fundType = validateFundType(editFundType);
      await updateDoc(doc(db, 'wallets', currentWalletId, 'transactions', editingItem.id), updateData);
      setShowEditModal(false); showAlert('수정 완료! ✅', '내역이 수정되었습니다.');
    } catch (error) { showAlert('오류', '수정에 실패했습니다.'); }
  };
  
  const handleDelete = (id, title) => {
    showAlert('삭제 확인', `"${title}" 삭제?`, [
      { text: '취소' },
      { text: '삭제', onPress: () => deleteDoc(doc(db, 'wallets', currentWalletId, 'transactions', id)) },
    ]);
  };

  // ★ 빠른 등록
  const handleQuickAdd = async () => {
    const numAmount = parseAmount(quickAmount);
    const amtCheck = validateAmount(numAmount);
    if (!amtCheck.valid) { showAlert('알림', amtCheck.message); return; }
    if (!quickCategory) { showAlert('알림', '카테고리를 선택해 주세요!'); return; }

    try {
      const txData = {
        type: quickType,
        amount: numAmount,
        category: quickCategory,
        memo: quickMemo || '',
        date: new Date().toISOString(),
        userId: user.uid,
        member: currentWallet?.members?.[user.uid]?.name || userProfile?.name || user.displayName || '미지정',
        createdAt: new Date().toISOString(),
      };
      if (quickType === 'expense') txData.fundType = validateFundType(quickFundType);
      
      await addDoc(collection(db, 'wallets', currentWalletId, 'transactions'), txData);
      
      setShowQuickAdd(false);
      setQuickAmount('');
      setQuickCategory(null);
      setQuickMemo('');
      setQuickFundType('shared');
      showAlert('등록 완료! ✅', `${quickType === 'income' ? '수입' : '지출'}이 기록되었습니다.`);
    } catch (error) {
      showAlert('오류', '등록에 실패했습니다.');
    }
  };

  // ★ 고정 지출/수입 빠른 등록
  const handleQuickAddFixed = async () => {
    const numAmount = parseAmount(quickAmount);
    const amtCheck = validateAmount(numAmount);
    if (!fixedName.trim()) { showAlert('알림', '항목명을 입력해 주세요!'); return; }
    if (!amtCheck.valid) { showAlert('알림', amtCheck.message); return; }
    if (!fixedDay) { showAlert('알림', '날짜를 입력해 주세요!'); return; }
    const day = parseInt(fixedDay);
    if (day < 1 || day > 31) { showAlert('알림', '1~31 사이 날짜를 입력해 주세요!'); return; }
    const label = fixedType === 'income' ? '수입' : '지출';
    try {
      const docData = {
        name: fixedName.trim(), amount: numAmount, day, type: fixedType,
        lastRecordedMonth: '', createdAt: new Date().toISOString(),
      };
      if (fixedType === 'expense') docData.fundType = quickFundType;
      await addDoc(collection(db, 'wallets', currentWalletId, 'fixedExpenses'), docData);
      setShowQuickAdd(false);
      setQuickAmount('');
      setFixedName('');
      setFixedDay('');
      setFixedType('expense');
      setQuickFundType('shared');
      showAlert('등록 완료! ✅', `고정 ${label} "${fixedName.trim()}"이 등록되었습니다.\n매월 ${day}일에 자동 기록됩니다.`);
    } catch (error) {
      showAlert('오류', '등록에 실패했습니다.');
    }
  };

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const monthlyTx = transactions.filter((t) => {
    const d = new Date(t.date); return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });

  // 총 용돈 배분액
  const totalAllowance = Object.values(currentWallet?.members || {})
    .reduce((sum, member) => sum + (member.allowance || 0), 0);

  const totalIncome = monthlyTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const sharedExpense = monthlyTx.filter((t) => t.type === 'expense' && (t.fundType || 'shared') === 'shared').reduce((s, t) => s + t.amount, 0);
  
  // ★ 총 지출 = 공금 + 용돈 배분
  const totalExpense = sharedExpense + totalAllowance;
  const balance = totalIncome - totalExpense;

  // 내 용돈
  const myPersonalExpense = monthlyTx.filter((t) => t.type === 'expense' && t.fundType === 'personal' && t.userId === user?.uid).reduce((s, t) => s + t.amount, 0);
  const myAllowance = currentWallet?.members?.[user?.uid]?.allowance || 0;
  const myAllowanceRemain = myAllowance - myPersonalExpense;
  const myAllowancePct = myAllowance > 0 ? Math.min(Math.round((myPersonalExpense / myAllowance) * 100), 100) : 0;

  const myWalletName = currentWallet?.members?.[user?.uid]?.name || userProfile?.name || '';
  const customCats = useMemo(() => (currentWallet?.customCategories || []).map(c => ({ id: c.id, name: c.name, icon: c.icon })), [currentWallet?.customCategories]);
  const allCatNames = useMemo(() => {
    const map = { ...ALL_CATEGORY_NAMES };
    customCats.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [customCats]);
  const allCatIcons = useMemo(() => {
    const map = { ...ALL_CATEGORY_ICONS };
    customCats.forEach(c => { map[c.id] = c.icon; });
    return map;
  }, [customCats]);
  const quickCategories = quickType === 'expense' ? [...EXPENSE_CATEGORIES, ...customCats] : INCOME_CATEGORIES;

  // ★ 필터링된 트랜잭션
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // 다른 사람의 용돈 사용 숨기기
      if (t.fundType === 'personal' && t.userId !== user?.uid) return false;
      
      // 필터: 유형
      if (filterType !== 'all' && t.type !== filterType) return false;
      
      // 필터: 지출 출처
      if (filterFundType !== 'all') {
        const txFund = t.fundType || 'shared';
        if (txFund !== filterFundType) return false;
      }
      
      // 필터: 카테고리
      if (filterCategory !== 'all' && t.category !== filterCategory) return false;
      
      // 검색어
      if (searchText) {
        const search = searchText.toLowerCase();
        const memo = (t.memo || '').toLowerCase();
        const catName = (allCatNames[t.category] || '').toLowerCase();
        const member = (t.member || '').toLowerCase();
        if (!memo.includes(search) && !catName.includes(search) && !member.includes(search)) return false;
      }
      
      return true;
    });
  }, [transactions, filterType, filterFundType, filterCategory, searchText, user?.uid, allCatNames]);

  const formatMoney = (num) => Math.abs(num).toLocaleString('ko-KR') + '원';
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diff === 0) return '오늘';
    if (diff === 1) return '어제';
    if (diff < 7) return `${diff}일 전`;
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // ★ 시간대별 인사말
  const greeting = useMemo(() => {
    const h = now.getHours();
    if (h < 6) return '늦은 밤이에요';
    if (h < 12) return '좋은 아침이에요';
    if (h < 18) return '좋은 오후에요';
    return '좋은 저녁이에요';
  }, []);

  // ★ 오늘 지출/수입 통계
  const todayTx = useMemo(() => {
    const todayStr = `${thisYear}-${String(thisMonth + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return transactions.filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth && d.getDate() === now.getDate();
    });
  }, [transactions, thisYear, thisMonth]);
  const todayExpense = todayTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const todayIncome = todayTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  // ★ 최근 7일간 일별 지출 (미니 차트용)
  const weeklySpending = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(thisYear, thisMonth, now.getDate() - i);
      const dayTotal = transactions.filter(t => {
        const td = new Date(t.date);
        return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth() && td.getDate() === d.getDate() && t.type === 'expense';
      }).reduce((s, t) => s + t.amount, 0);
      const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
      days.push({ label: dayLabels[d.getDay()], amount: dayTotal, isToday: i === 0 });
    }
    return days;
  }, [transactions, thisYear, thisMonth]);
  const weekMax = Math.max(...weeklySpending.map(d => d.amount), 1);

  // ★ 카테고리별 지출 집계 (관리자 대시보드용)
  const categoryBreakdown = useMemo(() => {
    const catMap = {};
    monthlyTx.filter(t => t.type === 'expense').forEach(t => {
      const cat = t.category || 'etc';
      catMap[cat] = (catMap[cat] || 0) + t.amount;
    });
    return Object.entries(catMap)
      .map(([id, amount]) => ({ id, amount, name: allCatNames[id] || '기타', icon: allCatIcons[id] || 'ellipsis-horizontal-outline' }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4);
  }, [monthlyTx, allCatNames, allCatIcons]);

  const txCount = monthlyTx.length;
  const incomeRatio = totalIncome > 0 ? Math.round((totalExpense / totalIncome) * 100) : 0;

  // ★ 날짜별 그룹핑
  const groupedTransactions = useMemo(() => {
    const groups = [];
    let currentDateKey = '';
    filteredTransactions.slice(0, 50).forEach(item => {
      const d = new Date(item.date);
      const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (dateKey !== currentDateKey) {
        currentDateKey = dateKey;
        const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
        let label;
        if (diff === 0) label = '오늘';
        else if (diff === 1) label = '어제';
        else if (diff < 7) label = `${diff}일 전`;
        else label = `${d.getMonth() + 1}월 ${d.getDate()}일`;
        groups.push({ type: 'header', key: `h-${dateKey}`, label, date: d });
      }
      groups.push({ type: 'item', key: item.id, data: item });
    });
    return groups;
  }, [filteredTransactions]);

  // 필터 리셋
  const resetFilters = () => {
    setFilterType('all');
    setFilterFundType('all');
    setFilterCategory('all');
    setSearchText('');
  };

  const hasActiveFilter = filterType !== 'all' || filterFundType !== 'all' || filterCategory !== 'all' || searchText;

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: 10, color: Colors.textGray }}>데이터를 불러오는 중...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ===== 헤더 ===== */}
        <LinearGradient colors={[Colors.gradientStart, Colors.gradientMiddle, Colors.gradientEnd]} style={styles.headerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <View style={styles.walletIcon}>
                <Ionicons name="wallet" size={16} color="rgba(255,255,255,0.9)" />
              </View>
              <View>
                <Text style={styles.appTitle}>{currentWallet?.name || '가계부'}</Text>
                <Text style={styles.welcomeText}>{myWalletName}님, {greeting}</Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.monthBadge}>
                <Ionicons name="calendar-outline" size={12} color="rgba(255,255,255,0.8)" />
                <Text style={styles.monthBadgeText}>{now.getFullYear()}.{String(now.getMonth() + 1).padStart(2, '0')}</Text>
              </View>
            </View>
          </View>

          {/* 그라데이션 안 메인 금액 */}
          <View style={styles.balanceSection}>
            {isAdmin ? (
              <>
                <Text style={styles.balanceLabel}>이번 달 잔액</Text>
                <Text style={styles.balanceAmount}>
                  {balance < 0 ? '-' : '+'}{formatMoney(balance)}
                </Text>
                <View style={styles.balanceMeta}>
                  <Text style={styles.balanceMetaText}>{txCount}건 거래</Text>
                  <View style={styles.balanceMetaDot} />
                  <Text style={styles.balanceMetaText}>지출률 {incomeRatio}%</Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.balanceLabel}>
                  {myAllowance > 0 ? `내 ${FUND_TYPE_MAP.personal?.name || '용돈'} 잔액` : sharedBudgetInfo ? `${FUND_TYPE_MAP.shared?.name || '공금'} 잔액` : '이번 달 내 지출'}
                </Text>
                <Text style={styles.balanceAmount}>
                  {myAllowance > 0
                    ? (myAllowanceRemain < 0 ? '-' : '') + formatMoney(myAllowanceRemain)
                    : sharedBudgetInfo
                      ? (sharedBudgetInfo.remaining < 0 ? '-' : '') + formatMoney(sharedBudgetInfo.remaining)
                      : formatMoney(myPersonalExpense)
                  }
                </Text>
                {sharedBudgetInfo && !myAllowance && (
                  <View style={styles.balanceMeta}>
                    <Text style={styles.balanceMetaText}>예산 {sharedBudgetInfo.pct}% 사용</Text>
                  </View>
                )}
              </>
            )}
          </View>

          {/* 오늘의 요약 (헤더 안) */}
          {(todayExpense > 0 || todayIncome > 0) && (
            <View style={styles.todaySummary}>
              {todayExpense > 0 && (
                <View style={styles.todaySummaryItem}>
                  <Ionicons name="arrow-up" size={12} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.todaySummaryText}>오늘 -{formatMoney(todayExpense)}</Text>
                </View>
              )}
              {todayIncome > 0 && (
                <View style={styles.todaySummaryItem}>
                  <Ionicons name="arrow-down" size={12} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.todaySummaryText}>오늘 +{formatMoney(todayIncome)}</Text>
                </View>
              )}
            </View>
          )}
        </LinearGradient>

        {/* ===== 대시보드 카드들 (그라데이션 위에 플로팅) ===== */}
        <View style={styles.dashboardContainer}>
          {isAdmin ? (
            /* ===== 관리자: 수입/지출 개별 카드 ===== */
            <>
              <View style={styles.summaryCards}>
                <View style={styles.summaryCardSingle}>
                  <View style={[styles.summaryAccent, { backgroundColor: Colors.income }]} />
                  <View style={styles.summaryCardInner}>
                    <View style={styles.summaryCardTop}>
                      <View style={[styles.summaryIconWrap, { backgroundColor: Colors.income + '15' }]}>
                        <Ionicons name="arrow-down-circle" size={18} color={Colors.income} />
                      </View>
                      <Text style={styles.summaryCardLabel}>수입</Text>
                    </View>
                    <Text style={[styles.summaryCardAmount, { color: Colors.income }]}>{formatMoney(totalIncome)}</Text>
                  </View>
                </View>

                <View style={styles.summaryCardSingle}>
                  <View style={[styles.summaryAccent, { backgroundColor: Colors.expense }]} />
                  <View style={styles.summaryCardInner}>
                    <View style={styles.summaryCardTop}>
                      <View style={[styles.summaryIconWrap, { backgroundColor: Colors.expense + '15' }]}>
                        <Ionicons name="arrow-up-circle" size={18} color={Colors.expense} />
                      </View>
                      <Text style={styles.summaryCardLabel}>지출</Text>
                    </View>
                    <Text style={[styles.summaryCardAmount, { color: Colors.expense }]}>{formatMoney(totalExpense)}</Text>
                  </View>
                </View>
              </View>

              {/* 지출 6분류 상세 + 소비 비율 바 */}
              <View style={styles.fundDetailCard}>
                {/* 소비 비율 바 */}
                {totalIncome > 0 && (
                  <View style={styles.ratioBarContainer}>
                    <View style={styles.ratioBar}>
                      <View style={[styles.ratioBarFill, { width: `${Math.min(incomeRatio, 100)}%`, backgroundColor: incomeRatio >= 90 ? Colors.expense : incomeRatio >= 70 ? Colors.warning : Colors.income }]} />
                    </View>
                    <View style={styles.ratioBarLabels}>
                      <Text style={styles.ratioBarLabel}>0%</Text>
                      <Text style={[styles.ratioBarValue, { color: incomeRatio >= 90 ? Colors.expense : incomeRatio >= 70 ? Colors.warning : Colors.income }]}>
                        수입 대비 {incomeRatio}% 지출
                      </Text>
                      <Text style={styles.ratioBarLabel}>100%</Text>
                    </View>
                  </View>
                )}
                <View style={styles.fundDetailDividerH} />
                {/* 6분류 그리드 */}
                <View style={styles.fundBreakdownGrid}>
                  {FUND_TYPES.map((ft) => {
                    const amt = monthlyFundBreakdown?.[ft.id] || 0;
                    if (ft.id === 'personal') return (
                      <View key={ft.id} style={styles.fundBreakdownItem}>
                        <View style={[styles.fundBreakdownDot, { backgroundColor: ft.color }]} />
                        <Text style={styles.fundBreakdownLabel}>{ft.name} 배분</Text>
                        <Text style={[styles.fundBreakdownAmt, { color: ft.color }]}>{formatMoney(totalAllowance)}</Text>
                      </View>
                    );
                    return (
                      <View key={ft.id} style={styles.fundBreakdownItem}>
                        <View style={[styles.fundBreakdownDot, { backgroundColor: ft.color }]} />
                        <Text style={styles.fundBreakdownLabel}>{ft.name}</Text>
                        <Text style={[styles.fundBreakdownAmt, { color: ft.color }]}>{formatMoney(amt)}</Text>
                      </View>
                    );
                  })}
                </View>
                {/* 순지출 */}
                {monthlyFundBreakdown && (
                  <View style={styles.netExpenseRow}>
                    <Text style={styles.netExpenseLabel}>순지출 (자산이전 제외)</Text>
                    <Text style={[styles.netExpenseAmount, { color: Colors.expense }]}>{formatMoney(monthlyFundBreakdown.netExpense)}</Text>
                  </View>
                )}
              </View>

              {/* 누적 자산 카드 (예적금/투자/비상금) */}
              {accumulatedFunds && accumulatedFunds.total > 0 && (
                <View style={styles.accumulatedCard}>
                  <View style={styles.accumulatedHeader}>
                    <View style={[styles.summaryIconWrap, { backgroundColor: '#2980B9' + '15' }]}>
                      <Ionicons name="bar-chart" size={18} color="#2980B9" />
                    </View>
                    <Text style={styles.accumulatedTitle}>누적 자산</Text>
                    <Text style={styles.accumulatedTotal}>{formatMoney(accumulatedFunds.total)}</Text>
                  </View>
                  <View style={styles.accumulatedRow}>
                    {accumulatedFunds.savings > 0 && (
                      <View style={styles.accumulatedItem}>
                        <Ionicons name="wallet" size={14} color="#2980B9" />
                        <Text style={styles.accumulatedItemLabel}>예적금</Text>
                        <Text style={[styles.accumulatedItemAmt, { color: '#2980B9' }]}>{formatMoney(accumulatedFunds.savings)}</Text>
                      </View>
                    )}
                    {accumulatedFunds.investment > 0 && (
                      <View style={styles.accumulatedItem}>
                        <Ionicons name="trending-up" size={14} color="#8E44AD" />
                        <Text style={styles.accumulatedItemLabel}>투자</Text>
                        <Text style={[styles.accumulatedItemAmt, { color: '#8E44AD' }]}>{formatMoney(accumulatedFunds.investment)}</Text>
                      </View>
                    )}
                    {accumulatedFunds.emergency > 0 && (
                      <View style={styles.accumulatedItem}>
                        <Ionicons name="shield-checkmark" size={14} color="#16A085" />
                        <Text style={styles.accumulatedItemLabel}>비상금</Text>
                        <Text style={[styles.accumulatedItemAmt, { color: '#16A085' }]}>{formatMoney(accumulatedFunds.emergency)}</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* 주간 지출 차트 (풀 와이드) */}
              <View style={styles.weekChartCard}>
                <View style={styles.weekChartHeader}>
                  <Text style={styles.weekChartTitle}>주간 지출 추이</Text>
                  {selectedBarIdx !== null && weeklySpending[selectedBarIdx] && (
                    <View style={styles.weekChartTooltip}>
                      <Text style={styles.weekChartTooltipText}>
                        {weeklySpending[selectedBarIdx].label}요일 {formatMoney(weeklySpending[selectedBarIdx].amount)}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.weekChart}>
                  {weeklySpending.map((day, idx) => {
                    const isSelected = selectedBarIdx === idx;
                    const barPct = day.amount > 0 ? Math.max((day.amount / weekMax) * 100, 8) : 0;
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={styles.weekChartCol}
                        activeOpacity={0.7}
                        onPress={() => setSelectedBarIdx(isSelected ? null : idx)}
                      >
                        {/* 바 위에 금액 표시 */}
                        {isSelected && day.amount > 0 && (
                          <Text style={styles.weekChartBarAmount}>
                            {Math.round(day.amount / 10000) > 0 ? `${Math.round(day.amount / 10000)}만` : `${Math.round(day.amount / 1000)}천`}
                          </Text>
                        )}
                        <View style={styles.weekChartBarBg}>
                          <View style={[styles.weekChartBar, {
                            height: `${barPct}%`,
                            backgroundColor: isSelected ? Colors.primary : day.isToday ? Colors.primary : Colors.primary + '35',
                            width: isSelected ? '80%' : '55%',
                          }]} />
                        </View>
                        <Text style={[styles.weekChartLabel, (day.isToday || isSelected) && { color: Colors.primary, fontWeight: '700' }]}>{day.label}</Text>
                        {day.isToday && <View style={styles.weekChartTodayDot} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* 카테고리 TOP (가로 스크롤) */}
              {categoryBreakdown.length > 0 && (
                <View style={styles.catTopCard}>
                  <Text style={styles.catTopTitle}>지출 카테고리 TOP</Text>
                  <View style={styles.catTopRow}>
                    {categoryBreakdown.slice(0, 4).map((cat) => {
                      const pct = totalExpense > 0 ? Math.round((cat.amount / totalExpense) * 100) : 0;
                      return (
                        <View key={cat.id} style={styles.catTopItem}>
                          <View style={[styles.catTopIcon, { backgroundColor: (Colors.category[cat.id] || Colors.primary) + '12' }]}>
                            <Ionicons name={cat.icon} size={16} color={Colors.category[cat.id] || Colors.primary} />
                          </View>
                          <Text style={styles.catTopName} numberOfLines={1}>{cat.name}</Text>
                          <Text style={[styles.catTopPct, { color: Colors.category[cat.id] || Colors.primary }]}>{pct}%</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* 빠른 액션 */}
              <View style={styles.quickActions}>
                <TouchableOpacity style={styles.quickActionBtn} onPress={() => { setQuickType('expense'); setShowQuickAdd(true); }}>
                  <View style={[styles.quickActionIcon, { backgroundColor: Colors.expense + '12' }]}>
                    <Ionicons name="trending-up-outline" size={18} color={Colors.expense} />
                  </View>
                  <Text style={styles.quickActionLabel}>지출</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickActionBtn} onPress={() => { setQuickType('income'); setShowQuickAdd(true); }}>
                  <View style={[styles.quickActionIcon, { backgroundColor: Colors.income + '12' }]}>
                    <Ionicons name="trending-down-outline" size={18} color={Colors.income} />
                  </View>
                  <Text style={styles.quickActionLabel}>수입</Text>
                </TouchableOpacity>
                {isAdmin && (
                  <TouchableOpacity style={styles.quickActionBtn} onPress={() => { setQuickType('fixed'); setShowQuickAdd(true); }}>
                    <View style={[styles.quickActionIcon, { backgroundColor: Colors.primary + '12' }]}>
                      <Ionicons name="repeat-outline" size={18} color={Colors.primary} />
                    </View>
                    <Text style={styles.quickActionLabel}>고정</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.quickActionBtn} onPress={() => setShowFilter(true)}>
                  <View style={[styles.quickActionIcon, { backgroundColor: Colors.textGray + '10' }]}>
                    <Ionicons name="options-outline" size={18} color={Colors.textGray} />
                  </View>
                  <Text style={styles.quickActionLabel}>필터</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            /* ===== 일반 멤버: 내 용돈 중심 요약 ===== */
            <View style={styles.memberSummaryCard}>
              {myAllowance > 0 ? (
                <>
                  <View style={styles.memberAllowanceHeader}>
                    <View style={styles.memberAllowanceInfo}>
                      <Text style={styles.memberAllowanceLabel}>이번 달 용돈</Text>
                      <Text style={styles.memberAllowanceTotal}>{formatMoney(myAllowance)}</Text>
                    </View>
                    <View style={[styles.memberAllowanceDivider]} />
                    <View style={styles.memberAllowanceInfo}>
                      <Text style={styles.memberAllowanceLabel}>사용 금액</Text>
                      <Text style={[styles.memberAllowanceTotal, { color: Colors.expense }]}>{formatMoney(myPersonalExpense)}</Text>
                    </View>
                  </View>
                  <View style={styles.memberProgressBar}>
                    <View style={[styles.memberProgressFill, {
                      width: `${myAllowancePct}%`,
                      backgroundColor: myAllowancePct >= 90 ? Colors.expense : myAllowancePct >= 70 ? Colors.warning : Colors.income
                    }]} />
                  </View>
                  <View style={styles.memberProgressFooter}>
                    <Text style={styles.memberProgressText}>{myAllowancePct}% 사용</Text>
                    <Text style={[styles.memberProgressRemain, { color: myAllowanceRemain >= 0 ? Colors.income : Colors.expense }]}>
                      {formatMoney(myAllowanceRemain)} {myAllowanceRemain >= 0 ? '남음' : '초과'}
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.memberNoAllowance}>
                  <View style={[styles.summaryIconWrap, { backgroundColor: Colors.personal + '15' }]}>
                    <Ionicons name="wallet-outline" size={20} color={Colors.personal} />
                  </View>
                  <Text style={styles.memberNoAllowanceText}>아직 용돈이 설정되지 않았어요</Text>
                  <Text style={styles.memberNoAllowanceSubText}>용돈 탭에서 관리자에게 요청할 수 있어요</Text>
                </View>
              )}
            </View>
          )}

          {/* ===== 공금 예산 카드 (모든 구성원 공유) ===== */}
          {sharedBudgetInfo && (
            <View style={styles.sharedBudgetCard}>
              <View style={styles.sharedBudgetHeader}>
                <View style={[styles.summaryIconWrap, { backgroundColor: Colors.primary + '15' }]}>
                  <Ionicons name="briefcase" size={18} color={Colors.primary} />
                </View>
                <Text style={styles.sharedBudgetTitle}>공금 예산</Text>
                <Text style={[styles.sharedBudgetRemain, {
                  color: sharedBudgetInfo.remaining >= 0 ? Colors.income : Colors.expense,
                }]}>
                  {formatMoney(sharedBudgetInfo.remaining)} {sharedBudgetInfo.remaining >= 0 ? '남음' : '초과'}
                </Text>
              </View>
              <View style={styles.sharedBudgetBar}>
                <View style={[styles.sharedBudgetBarFill, {
                  width: `${Math.min(sharedBudgetInfo.pct, 100)}%`,
                  backgroundColor: sharedBudgetInfo.pct >= 90 ? Colors.expense : sharedBudgetInfo.pct >= 70 ? Colors.warning : Colors.income,
                }]} />
              </View>
              <View style={styles.sharedBudgetFooter}>
                <Text style={styles.sharedBudgetFooterText}>
                  {formatMoney(sharedBudgetInfo.budget)} 중 {formatMoney(sharedBudgetInfo.spent)} 사용
                </Text>
                <Text style={[styles.sharedBudgetPct, {
                  color: sharedBudgetInfo.pct >= 90 ? Colors.expense : sharedBudgetInfo.pct >= 70 ? Colors.warning : Colors.textGray,
                }]}>
                  {sharedBudgetInfo.pct}%
                </Text>
              </View>
            </View>
          )}

          {/* 관리자용: 내 용돈 카드 (관리자도 용돈이 있을 수 있음) */}
          {isAdmin && myAllowance > 0 && (
            <View style={styles.myAllowanceCard}>
              <View style={styles.myAllowanceHeader}>
                <View style={styles.myAllowanceLeft}>
                  <View style={[styles.summaryIconWrap, { backgroundColor: Colors.personal + '15' }]}>
                    <Ionicons name="cash" size={18} color={Colors.personal} />
                  </View>
                  <Text style={styles.myAllowanceTitle}>내 용돈</Text>
                </View>
                <Text style={[styles.myAllowanceRemain, { color: myAllowanceRemain >= 0 ? Colors.income : Colors.expense }]}>
                  {formatMoney(myAllowanceRemain)} {myAllowanceRemain >= 0 ? '남음' : '초과'}
                </Text>
              </View>
              <View style={styles.myAllowanceBar}>
                <View style={[styles.myAllowanceBarFill, {
                  width: `${myAllowancePct}%`,
                  backgroundColor: myAllowancePct >= 90 ? Colors.expense : myAllowancePct >= 70 ? Colors.warning : Colors.income
                }]} />
              </View>
              <View style={styles.myAllowanceFooter}>
                <Text style={styles.myAllowanceFooterText}>{formatMoney(myAllowance)} 중 {formatMoney(myPersonalExpense)} 사용</Text>
                <Text style={[styles.myAllowanceFooterPct, { color: myAllowancePct >= 90 ? Colors.expense : myAllowancePct >= 70 ? Colors.warning : Colors.textGray }]}>{myAllowancePct}%</Text>
              </View>
            </View>
          )}
        </View>

        {/* ===== 검색/필터 바 ===== */}
        <View style={styles.filterSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={Colors.textGray} />
            <TextInput
              style={styles.searchInput}
              placeholder="메모, 카테고리 검색..."
              placeholderTextColor={Colors.textLight}
              value={searchText}
              onChangeText={setSearchText}
            />
            {searchText ? (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <Ionicons name="close-circle" size={18} color={Colors.textGray} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity 
            style={[styles.filterBtn, hasActiveFilter && styles.filterBtnActive]} 
            onPress={() => setShowFilter(true)}
          >
            <Ionicons name="filter" size={18} color={hasActiveFilter ? '#fff' : Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* 활성 필터 표시 */}
        {hasActiveFilter && (
          <View style={styles.activeFilters}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {filterType !== 'all' && (
                <View style={styles.filterChip}>
                  <Text style={styles.filterChipText}>{filterType === 'income' ? '수입' : '지출'}</Text>
                  <TouchableOpacity onPress={() => setFilterType('all')}>
                    <Ionicons name="close" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              )}
              {filterFundType !== 'all' && (
                <View style={styles.filterChip}>
                  <Text style={styles.filterChipText}>{FUND_TYPE_MAP[filterFundType]?.name || filterFundType}</Text>
                  <TouchableOpacity onPress={() => setFilterFundType('all')}>
                    <Ionicons name="close" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              )}
              {filterCategory !== 'all' && (
                <View style={styles.filterChip}>
                  <Text style={styles.filterChipText}>{allCatNames[filterCategory]}</Text>
                  <TouchableOpacity onPress={() => setFilterCategory('all')}>
                    <Ionicons name="close" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity style={styles.clearAllBtn} onPress={resetFilters}>
                <Text style={styles.clearAllText}>전체 해제</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ===== 거래 내역 ===== */}
        <View style={[styles.section, { paddingBottom: 120 }]}>
          <View style={styles.sectionDivider} />
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="receipt-outline" size={18} color={Colors.textBlack} />
              <Text style={styles.sectionTitle}>거래 내역</Text>
            </View>
            <View style={styles.sectionCountBadge}>
              <Text style={styles.sectionCount}>{filteredTransactions.length}건</Text>
            </View>
          </View>

          {filteredTransactions.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="receipt-outline" size={32} color={Colors.textLight} />
              </View>
              <Text style={styles.emptyTitle}>
                {hasActiveFilter ? '필터에 맞는 내역이 없어요' : '아직 기록이 없어요'}
              </Text>
              <Text style={styles.emptyText}>
                {hasActiveFilter ? '다른 조건으로 검색해 보세요' : '오른쪽 하단 + 버튼으로 시작해 보세요'}
              </Text>
              {hasActiveFilter && (
                <TouchableOpacity style={styles.emptyBtn} onPress={resetFilters}>
                  <Text style={styles.emptyBtnText}>필터 해제</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            groupedTransactions.map((entry) => {
              if (entry.type === 'header') {
                return (
                  <View key={entry.key} style={styles.dateHeader}>
                    <View style={styles.dateHeaderLine} />
                    <Text style={styles.dateHeaderText}>{entry.label}</Text>
                    <View style={styles.dateHeaderLine} />
                  </View>
                );
              }
              const item = entry.data;
              const ftInfo = FUND_TYPE_MAP[item.fundType] || FUND_TYPE_MAP['shared'];
              return (
                <TouchableOpacity
                  key={entry.key}
                  style={styles.txCard}
                  onPress={() => handleEdit(item)}
                  onLongPress={() => handleDelete(item.id, item.memo || allCatNames[item.category] || '기타')}
                  delayLongPress={500}
                  activeOpacity={0.7}
                >
                  <View style={[styles.txIcon, { backgroundColor: (Colors.category[item.category] || Colors.primary) + '15' }]}>
                    <Ionicons name={allCatIcons[item.category] || 'ellipsis-horizontal-outline'} size={20} color={Colors.category[item.category] || Colors.primary} />
                  </View>
                  <View style={styles.txInfo}>
                    <Text style={styles.txTitle} numberOfLines={1}>{item.memo || allCatNames[item.category] || '기타'}</Text>
                    <View style={styles.txMeta}>
                      <Text style={styles.txDate}>{item.member ? `${item.member} · ` : ''}{allCatNames[item.category] || '기타'}</Text>
                      {item.type === 'expense' && ftInfo && (
                        <View style={[styles.txTag, { backgroundColor: ftInfo.color + '15' }]}>
                          <Text style={[styles.txTagText, { color: ftInfo.color }]}>
                            {ftInfo.name}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={[styles.txAmount, { color: item.type === 'income' ? Colors.income : Colors.expense }]}>
                    {item.type === 'income' ? '+' : '-'}{formatMoney(item.amount)}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ===== FAB (빠른 등록) ===== */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: Colors.primary }]}
        onPress={() => setShowQuickAdd(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabLabel}>추가</Text>
      </TouchableOpacity>

      {/* ===== 빠른 등록 모달 ===== */}
      <Modal visible={showQuickAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.quickAddModal}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>빠른 등록</Text>

            {/* 수입/지출/고정지출 선택 */}
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[styles.typeBtn, quickType === 'expense' && { backgroundColor: Colors.expense }]}
                onPress={() => { setQuickType('expense'); setQuickCategory(null); }}
              >
                <Text style={[styles.typeBtnText, quickType === 'expense' && { color: '#fff' }]}>지출</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, quickType === 'income' && { backgroundColor: Colors.income }]}
                onPress={() => { setQuickType('income'); setQuickCategory(null); }}
              >
                <Text style={[styles.typeBtnText, quickType === 'income' && { color: '#fff' }]}>수입</Text>
              </TouchableOpacity>
              {isAdmin && (
                <TouchableOpacity
                  style={[styles.typeBtn, quickType === 'fixed' && { backgroundColor: Colors.primary }]}
                  onPress={() => setQuickType('fixed')}
                >
                  <Text style={[styles.typeBtnText, quickType === 'fixed' && { color: '#fff' }]}>고정</Text>
                </TouchableOpacity>
              )}
            </View>

            {quickType === 'fixed' ? (
              /* ===== 고정 지출/수입 등록 폼 ===== */
              <>
                {/* 고정 지출/수입 서브 토글 */}
                <View style={styles.fixedSubToggle}>
                  <TouchableOpacity
                    style={[styles.fixedSubBtn, fixedType === 'expense' && { backgroundColor: Colors.expense + '18' }]}
                    onPress={() => setFixedType('expense')}
                  >
                    <Ionicons name="arrow-up-circle" size={16} color={fixedType === 'expense' ? Colors.expense : Colors.textGray} />
                    <Text style={[styles.fixedSubBtnText, fixedType === 'expense' && { color: Colors.expense }]}>고정 지출</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.fixedSubBtn, fixedType === 'income' && { backgroundColor: Colors.income + '18' }]}
                    onPress={() => setFixedType('income')}
                  >
                    <Ionicons name="arrow-down-circle" size={16} color={fixedType === 'income' ? Colors.income : Colors.textGray} />
                    <Text style={[styles.fixedSubBtnText, fixedType === 'income' && { color: Colors.income }]}>고정 수입</Text>
                  </TouchableOpacity>
                </View>

                {/* 1. 지출 출처 (고정 지출일 때만) */}
                {fixedType === 'expense' && (
                  <View style={styles.fundSelector}>
                    {FUND_TYPES.filter(ft => ft.id !== 'personal').map((ft) => (
                      <TouchableOpacity
                        key={ft.id}
                        style={[styles.fundBtn, quickFundType === ft.id && { backgroundColor: ft.color + '20', borderColor: ft.color }]}
                        onPress={() => setQuickFundType(ft.id)}
                      >
                        <Ionicons name={ft.icon} size={14} color={ft.color} />
                        <Text style={[styles.fundBtnText, { color: ft.color }]}>{ft.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* 2. 금액 */}
                <Text style={styles.inputLabel}>금액</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="number-pad"
                  value={quickAmount}
                  onChangeText={(t) => setQuickAmount(formatAmountInput(t))}
                />
                {quickAmount ? (
                  <Text style={[styles.amountPreview, { color: fixedType === 'income' ? Colors.income : Colors.primary }]}>
                    매월 {parseAmount(quickAmount).toLocaleString()}원
                  </Text>
                ) : null}

                {/* 3. 항목명 (카테고리) */}
                <Text style={styles.inputLabel}>항목명</Text>
                <TextInput
                  style={styles.memoInput}
                  placeholder={fixedType === 'expense' ? '예: 월세, 통신비, 보험료' : '예: 월급, 임대수익, 용돈'}
                  placeholderTextColor={Colors.textLight}
                  value={fixedName}
                  onChangeText={setFixedName}
                />

                {/* 4. 자동 기록일 */}
                <Text style={styles.inputLabel}>자동 기록일</Text>
                <View style={styles.fixedDayRow}>
                  <Text style={styles.fixedDayLabel}>매월</Text>
                  <TextInput
                    style={styles.fixedDayInput}
                    placeholder="1"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="number-pad"
                    maxLength={2}
                    value={fixedDay}
                    onChangeText={(t) => setFixedDay(t.replace(/[^0-9]/g, ''))}
                  />
                  <Text style={styles.fixedDayLabel}>일</Text>
                </View>
                <Text style={styles.fixedDayHint}>
                  해당 날짜에 {fixedType === 'income' ? '수입(급여 카테고리)' : `${FUND_TYPE_MAP[quickFundType]?.name || '공과금'} 지출(주거 카테고리)`}로 자동 기록됩니다
                </Text>

                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowQuickAdd(false)}>
                    <Text style={styles.cancelBtnText}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.saveBtn, { backgroundColor: fixedType === 'income' ? Colors.income : Colors.primary }]} onPress={handleQuickAddFixed}>
                    <Text style={styles.saveBtnText}>등록</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              /* ===== 일반 지출/수입 등록 폼 ===== */
              <>
                {/* 지출 출처 선택 (지출일 때만) */}
                {quickType === 'expense' && (
                  <View style={styles.fundSelector}>
                    {FUND_TYPES.map((ft) => (
                      <TouchableOpacity
                        key={ft.id}
                        style={[styles.fundBtn, quickFundType === ft.id && { backgroundColor: ft.color + '20', borderColor: ft.color }]}
                        onPress={() => setQuickFundType(ft.id)}
                      >
                        <Ionicons name={ft.icon} size={14} color={ft.color} />
                        <Text style={[styles.fundBtnText, { color: ft.color }]}>{ft.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* 금액 */}
                <Text style={styles.inputLabel}>금액</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="number-pad"
                  value={quickAmount}
                  onChangeText={(t) => setQuickAmount(formatAmountInput(t))}
                />
                {quickAmount ? (
                  <Text style={styles.amountPreview}>{parseAmount(quickAmount).toLocaleString()}원</Text>
                ) : null}

                {/* 카테고리 */}
                <Text style={styles.inputLabel}>카테고리</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                  {quickCategories.map((cat) => {
                    const catColor = Colors.category[cat.id] || Colors.primary;
                    return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryChip,
                        quickCategory === cat.id && { backgroundColor: catColor, borderColor: catColor }
                      ]}
                      onPress={() => setQuickCategory(cat.id)}
                    >
                      <Ionicons name={cat.icon} size={16} color={quickCategory === cat.id ? '#fff' : catColor} />
                      <Text style={[styles.categoryChipText, quickCategory === cat.id && { color: '#fff' }]}>{cat.name}</Text>
                    </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* 메모 */}
                <Text style={styles.inputLabel}>메모 (선택)</Text>
                <TextInput
                  style={styles.memoInput}
                  placeholder="메모를 입력하세요"
                  placeholderTextColor={Colors.textLight}
                  value={quickMemo}
                  onChangeText={setQuickMemo}
                />

                {/* 버튼 */}
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowQuickAdd(false)}>
                    <Text style={styles.cancelBtnText}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.saveBtn, { backgroundColor: quickType === 'income' ? Colors.income : Colors.expense }]} onPress={handleQuickAdd}>
                    <Text style={styles.saveBtnText}>등록</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ===== 필터 모달 ===== */}
      <Modal visible={showFilter} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.filterModal}>
            <View style={styles.modalHandle} />
            <View style={styles.filterHeader}>
              <Text style={styles.modalTitle}>필터</Text>
              <TouchableOpacity onPress={resetFilters}>
                <Text style={styles.resetText}>초기화</Text>
              </TouchableOpacity>
            </View>

            {/* 유형 필터 */}
            <Text style={styles.filterLabel}>거래 유형</Text>
            <View style={styles.filterOptions}>
              {[{ key: 'all', label: '전체' }, { key: 'income', label: '수입' }, { key: 'expense', label: '지출' }].map((opt) => (
                <TouchableOpacity 
                  key={opt.key}
                  style={[styles.filterOption, filterType === opt.key && styles.filterOptionActive]}
                  onPress={() => setFilterType(opt.key)}
                >
                  <Text style={[styles.filterOptionText, filterType === opt.key && styles.filterOptionTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 지출 출처 필터 */}
            <Text style={styles.filterLabel}>지출 출처</Text>
            <View style={styles.filterOptions}>
              {[{ key: 'all', label: '전체' }, ...FUND_TYPES.map(ft => ({ key: ft.id, label: ft.name }))].map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterOption, filterFundType === opt.key && styles.filterOptionActive]}
                  onPress={() => setFilterFundType(opt.key)}
                >
                  <Text style={[styles.filterOptionText, filterFundType === opt.key && styles.filterOptionTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 카테고리 필터 */}
            <Text style={styles.filterLabel}>카테고리</Text>
            <ScrollView style={{ maxHeight: 150 }} showsVerticalScrollIndicator={false}>
              <View style={styles.categoryFilterGrid}>
                <TouchableOpacity 
                  style={[styles.categoryFilterItem, filterCategory === 'all' && styles.categoryFilterItemActive]}
                  onPress={() => setFilterCategory('all')}
                >
                  <Text style={[styles.categoryFilterText, filterCategory === 'all' && styles.categoryFilterTextActive]}>전체</Text>
                </TouchableOpacity>
                {[...EXPENSE_CATEGORIES, ...customCats].map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.categoryFilterItem, filterCategory === cat.id && styles.categoryFilterItemActive]}
                    onPress={() => setFilterCategory(cat.id)}
                  >
                    <Ionicons name={cat.icon} size={16} color={filterCategory === cat.id ? '#fff' : (Colors.category[cat.id] || Colors.primary)} />
                    <Text style={[styles.categoryFilterText, filterCategory === cat.id && styles.categoryFilterTextActive]}>{cat.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity style={[styles.applyBtn, { backgroundColor: Colors.primary }]} onPress={() => setShowFilter(false)}>
              <Text style={styles.applyBtnText}>적용하기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== 수정 모달 ===== */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.quickAddModal}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>내역 수정</Text>
            
            <View style={styles.typeSelector}>
              <TouchableOpacity style={[styles.typeBtn, editType === 'expense' && { backgroundColor: Colors.expense }]} onPress={() => setEditType('expense')}>
                <Text style={[styles.typeBtnText, editType === 'expense' && { color: '#fff' }]}>지출</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeBtn, editType === 'income' && { backgroundColor: Colors.income }]} onPress={() => setEditType('income')}>
                <Text style={[styles.typeBtnText, editType === 'income' && { color: '#fff' }]}>수입</Text>
              </TouchableOpacity>
            </View>
            
            {editType === 'expense' && (
              <View style={styles.fundSelector}>
                {FUND_TYPES.map((ft) => (
                  <TouchableOpacity key={ft.id} style={[styles.fundBtn, editFundType === ft.id && { backgroundColor: ft.color + '20', borderColor: ft.color }]} onPress={() => setEditFundType(ft.id)}>
                    <Ionicons name={ft.icon} size={14} color={ft.color} /><Text style={[styles.fundBtnText, { color: ft.color }]}>{ft.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            
            <Text style={styles.inputLabel}>금액</Text>
            <TextInput style={styles.amountInput} keyboardType="numeric" value={editAmount} onChangeText={(t) => setEditAmount(formatAmountInput(t))} />
            
            <Text style={styles.inputLabel}>카테고리</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {[...EXPENSE_CATEGORIES, ...customCats].map((cat) => (
                <TouchableOpacity key={cat.id} style={[styles.categoryChip, editCategory === cat.id && { backgroundColor: Colors.category[cat.id] || Colors.primary, borderColor: Colors.category[cat.id] || Colors.primary }]} onPress={() => setEditCategory(cat.id)}>
                  <Ionicons name={cat.icon} size={16} color={editCategory === cat.id ? '#fff' : (Colors.category[cat.id] || Colors.primary)} />
                  <Text style={[styles.categoryChipText, editCategory === cat.id && { color: '#fff' }]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            <Text style={styles.inputLabel}>메모</Text>
            <TextInput style={styles.memoInput} placeholder="메모" placeholderTextColor={Colors.textLight} value={editMemo} onChangeText={setEditMemo} />
            
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowEditModal(false)}><Text style={styles.cancelBtnText}>취소</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: Colors.primary }]} onPress={handleSaveEdit}><Text style={styles.saveBtnText}>수정</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  
  // 헤더
  headerGradient: { paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingBottom: 68, paddingHorizontal: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  walletIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  welcomeText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2, letterSpacing: 0.1 },
  appTitle: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  headerRight: { flexDirection: 'row', gap: 8 },
  monthBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  monthBadgeText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },

  // 잔액 (그라데이션 안)
  balanceSection: { alignItems: 'center', paddingBottom: 6 },
  balanceLabel: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' },
  balanceAmount: { fontSize: 34, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1 },
  balanceMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  balanceMetaText: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
  balanceMetaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.35)' },
  // 오늘 요약 (헤더 안)
  todaySummary: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 10, paddingBottom: 4 },
  todaySummaryItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  todaySummaryText: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },

  // 대시보드 (플로팅)
  dashboardContainer: { paddingHorizontal: 16, marginTop: -38 },

  // 수입/지출 개별 카드
  summaryCards: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  summaryCardSingle: { flex: 1, backgroundColor: Colors.surface, borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 5 },
  summaryAccent: { height: 3, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  summaryCardInner: { padding: 16 },
  summaryCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  summaryIconWrap: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  summaryCardLabel: { fontSize: 13, fontWeight: '600', color: Colors.textGray },
  summaryCardAmount: { fontSize: 20, fontWeight: '800' },

  // 지출 상세 (공금/용돈)
  fundDetailCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  ratioBarContainer: { marginBottom: 12 },
  ratioBar: { height: 6, backgroundColor: Colors.background, borderRadius: 3, overflow: 'hidden' },
  ratioBarFill: { height: 6, borderRadius: 3 },
  ratioBarLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  ratioBarLabel: { fontSize: 9, color: Colors.textLight },
  ratioBarValue: { fontSize: 11, fontWeight: '700' },
  fundDetailDividerH: { height: 1, backgroundColor: Colors.divider, marginBottom: 12 },
  // 6분류 그리드
  fundBreakdownGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  fundBreakdownItem: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  fundBreakdownDot: { width: 8, height: 8, borderRadius: 4 },
  fundBreakdownLabel: { fontSize: 12, fontWeight: '600', color: Colors.textGray, flex: 1 },
  fundBreakdownAmt: { fontSize: 12, fontWeight: '700' },
  netExpenseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.divider },
  netExpenseLabel: { fontSize: 12, fontWeight: '700', color: Colors.textGray },
  netExpenseAmount: { fontSize: 14, fontWeight: '800' },
  // 누적 자산 카드
  accumulatedCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  accumulatedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  accumulatedTitle: { fontSize: 14, fontWeight: '700', color: Colors.textBlack, flex: 1 },
  accumulatedTotal: { fontSize: 16, fontWeight: '800', color: '#2980B9' },
  accumulatedRow: { flexDirection: 'row', gap: 8 },
  accumulatedItem: { flex: 1, backgroundColor: Colors.background, borderRadius: 12, padding: 10, alignItems: 'center', gap: 4 },
  accumulatedItemLabel: { fontSize: 11, color: Colors.textGray, fontWeight: '600' },
  accumulatedItemAmt: { fontSize: 12, fontWeight: '700' },

  // 주간 차트 카드 (풀 와이드)
  weekChartCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  weekChartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  weekChartTitle: { fontSize: 13, fontWeight: '700', color: Colors.textGray, letterSpacing: 0.2 },
  weekChartTooltip: { backgroundColor: Colors.primary + '12', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  weekChartTooltipText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  weekChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 80 },
  weekChartCol: { flex: 1, alignItems: 'center' },
  weekChartBarAmount: { fontSize: 9, fontWeight: '700', color: Colors.primary, marginBottom: 2 },
  weekChartBarBg: { width: '100%', height: 56, justifyContent: 'flex-end', alignItems: 'center' },
  weekChartBar: { borderRadius: 4, minHeight: 0 },
  weekChartLabel: { fontSize: 10, color: Colors.textLight, marginTop: 5, fontWeight: '500' },
  weekChartTodayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary, marginTop: 3 },
  // 카테고리 TOP (가로)
  catTopCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  catTopTitle: { fontSize: 12, fontWeight: '700', color: Colors.textGray, marginBottom: 12, letterSpacing: 0.2 },
  catTopRow: { flexDirection: 'row', justifyContent: 'space-around' },
  catTopItem: { alignItems: 'center', gap: 5 },
  catTopIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  catTopName: { fontSize: 10, fontWeight: '600', color: Colors.textGray, maxWidth: 50, textAlign: 'center' },
  catTopPct: { fontSize: 12, fontWeight: '800' },
  // 빠른 액션
  quickActions: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: Colors.surface, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 10, marginBottom: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  quickActionBtn: { alignItems: 'center', gap: 5 },
  quickActionIcon: { width: 42, height: 42, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  quickActionLabel: { fontSize: 11, fontWeight: '600', color: Colors.textGray },

  // 일반 멤버 요약 카드
  memberSummaryCard: { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 5 },
  memberAllowanceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 16 },
  memberAllowanceInfo: { alignItems: 'center' },
  memberAllowanceDivider: { width: 1, height: 36, backgroundColor: Colors.divider },
  memberAllowanceLabel: { fontSize: 12, fontWeight: '600', color: Colors.textGray, marginBottom: 4 },
  memberAllowanceTotal: { fontSize: 20, fontWeight: '800', color: Colors.textBlack },
  memberProgressBar: { height: 8, backgroundColor: Colors.background, borderRadius: 4, overflow: 'hidden' },
  memberProgressFill: { height: 8, borderRadius: 4 },
  memberProgressFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  memberProgressText: { fontSize: 12, fontWeight: '600', color: Colors.textGray },
  memberProgressRemain: { fontSize: 13, fontWeight: '700' },
  memberNoAllowance: { alignItems: 'center', paddingVertical: 8, gap: 8 },
  memberNoAllowanceText: { fontSize: 15, fontWeight: '600', color: Colors.textBlack },
  memberNoAllowanceSubText: { fontSize: 13, color: Colors.textGray },

  // 공금 예산 카드
  sharedBudgetCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 },
  sharedBudgetHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sharedBudgetTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.textBlack },
  sharedBudgetRemain: { fontSize: 15, fontWeight: '800' },
  sharedBudgetBar: { height: 8, backgroundColor: Colors.background, borderRadius: 4, overflow: 'hidden' },
  sharedBudgetBarFill: { height: 8, borderRadius: 4 },
  sharedBudgetFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  sharedBudgetFooterText: { fontSize: 11, color: Colors.textGray },
  sharedBudgetPct: { fontSize: 12, fontWeight: '700' },

  // 내 용돈
  myAllowanceCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 },
  myAllowanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  myAllowanceLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  myAllowanceTitle: { fontSize: 14, fontWeight: '700', color: Colors.textBlack },
  myAllowanceRemain: { fontSize: 15, fontWeight: '800' },
  myAllowanceBar: { height: 6, backgroundColor: Colors.background, borderRadius: 3, marginTop: 12 },
  myAllowanceBarFill: { height: 6, borderRadius: 3 },
  myAllowanceFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  myAllowanceFooterText: { fontSize: 11, color: Colors.textGray },
  myAllowanceFooterPct: { fontSize: 12, fontWeight: '700' },

  // 검색/필터
  filterSection: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 18, gap: 10 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 14, paddingHorizontal: 14, height: 44, gap: 8, borderWidth: 1, borderColor: Colors.border + '60' },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textBlack },
  filterBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center' },
  filterBtnActive: { backgroundColor: Colors.primary },
  
  activeFilters: { paddingHorizontal: 20, paddingTop: 12 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primary + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8 },
  filterChipText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  clearAllBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  clearAllText: { fontSize: 12, color: Colors.textGray },

  // 거래 내역
  section: { paddingHorizontal: 20, paddingTop: 20 },
  sectionDivider: { height: 1, backgroundColor: Colors.divider, marginBottom: 16, marginHorizontal: -20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.textBlack },
  sectionCountBadge: { backgroundColor: Colors.primary + '12', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  sectionCount: { fontSize: 12, fontWeight: '600', color: Colors.primary },

  emptyCard: { alignItems: 'center', paddingVertical: 48, backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border + '30', borderStyle: 'dashed' },
  emptyIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: Colors.textBlack },
  emptyText: { fontSize: 12, color: Colors.textGray, marginTop: 4 },
  emptyBtn: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.primary + '15', borderRadius: 8 },
  emptyBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  // 날짜 헤더
  dateHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, marginBottom: 8, paddingHorizontal: 4 },
  dateHeaderLine: { flex: 1, height: 1, backgroundColor: Colors.border + '50' },
  dateHeaderText: { fontSize: 11, fontWeight: '600', color: Colors.textLight, letterSpacing: 0.3 },

  txCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: 6, gap: 12, borderWidth: 1, borderColor: Colors.border + '40' },
  txIcon: { width: 42, height: 42, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  txInfo: { flex: 1 },
  txTitle: { fontSize: 15, fontWeight: '600', color: Colors.textBlack },
  txMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  txDate: { fontSize: 12, color: Colors.textGray },
  txTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  txTagText: { fontSize: 10, fontWeight: '600' },
  txAmount: { fontSize: 15, fontWeight: '700' },

  // FAB
  fab: { position: 'absolute', right: 20, bottom: 90, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 8 },
  fabLabel: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // 모달 공통
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.textLight, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.textBlack, marginBottom: 20 },

  // 빠른 등록 모달
  quickAddModal: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '90%' },
  typeSelector: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: Colors.background },
  typeBtnText: { fontSize: 15, fontWeight: '700', color: Colors.textGray },
  fundSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  fundBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background },
  fundBtnText: { fontSize: 11, fontWeight: '600' },
  inputLabel: { fontSize: 13, fontWeight: '600', color: Colors.textGray, marginBottom: 8, marginTop: 12 },
  amountInput: { backgroundColor: Colors.background, borderRadius: 12, padding: 16, fontSize: 24, fontWeight: '700', color: Colors.textBlack, textAlign: 'center' },
  amountPreview: { fontSize: 14, color: Colors.primary, textAlign: 'center', marginTop: 4 },
  categoryScroll: { marginBottom: 8 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginRight: 8, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  categoryChipText: { fontSize: 13, fontWeight: '600', color: Colors.textDark },
  memoInput: { backgroundColor: Colors.background, borderRadius: 12, padding: 14, fontSize: 15, color: Colors.textBlack },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, backgroundColor: Colors.background, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: Colors.textGray },
  saveBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // 필터 모달
  filterModal: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '80%' },
  filterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  resetText: { fontSize: 14, color: Colors.primary },
  filterLabel: { fontSize: 13, fontWeight: '600', color: Colors.textGray, marginTop: 16, marginBottom: 10 },
  filterOptions: { flexDirection: 'row', gap: 8 },
  filterOption: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.background },
  filterOptionActive: { backgroundColor: Colors.primary },
  filterOptionText: { fontSize: 14, fontWeight: '600', color: Colors.textGray },
  filterOptionTextActive: { color: '#fff' },
  categoryFilterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryFilterItem: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.background },
  categoryFilterItemActive: { backgroundColor: Colors.primary },
  categoryFilterText: { fontSize: 13, fontWeight: '600', color: Colors.textGray },
  categoryFilterTextActive: { color: '#fff' },
  applyBtn: { marginTop: 24, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  applyBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // 고정 지출/수입 폼
  fixedSubToggle: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  fixedSubBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.background },
  fixedSubBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textGray },
  fixedDayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 4 },
  fixedDayLabel: { fontSize: 16, fontWeight: '600', color: Colors.textBlack },
  fixedDayInput: { width: 60, backgroundColor: Colors.background, borderRadius: 12, padding: 12, fontSize: 20, fontWeight: '700', color: Colors.textBlack, textAlign: 'center' },
  fixedDayHint: { fontSize: 12, color: Colors.textGray, textAlign: 'center', marginTop: 8 },
});