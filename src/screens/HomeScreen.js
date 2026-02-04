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
import { ALL_CATEGORY_NAMES, ALL_CATEGORY_ICONS, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants/categories';
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
  const { currentWalletId, currentWallet, isAdmin } = useWallet();
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
  const [quickType, setQuickType] = useState('expense');
  const [quickAmount, setQuickAmount] = useState('');
  const [quickCategory, setQuickCategory] = useState(null);
  const [quickMemo, setQuickMemo] = useState('');
  const [quickFundType, setQuickFundType] = useState('shared');
  
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

  // 고정 지출 자동 기록
  useEffect(() => {
    if (!isAdmin || !currentWalletId || autoRecordDone.current) return;
    autoRecordDone.current = true;
    const autoRecord = async () => {
      try {
        const now = new Date();
        const today = now.getDate();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const fixedSnapshot = await getDocs(collection(db, 'wallets', currentWalletId, 'fixedExpenses'));
        let count = 0;
        for (const fixedDoc of fixedSnapshot.docs) {
          const data = fixedDoc.data();
          if (data.lastRecordedMonth === currentMonth) continue;
          const effectiveDay = Math.min(data.day || 1, lastDay);
          if (today >= effectiveDay) {
            await addDoc(collection(db, 'wallets', currentWalletId, 'transactions'), {
              type: 'expense', amount: data.amount, category: 'housing',
              memo: `[자동] ${data.name}`, member: '자동 기록', userId: 'system',
              fundType: 'shared',
              date: new Date(now.getFullYear(), now.getMonth(), effectiveDay).toISOString(),
              createdAt: new Date().toISOString(), fixedExpenseId: fixedDoc.id,
            });
            await updateDoc(doc(db, 'wallets', currentWalletId, 'fixedExpenses', fixedDoc.id), { lastRecordedMonth: currentMonth });
            count++;
          }
        }
        if (count > 0) showAlert('자동 기록 📋', `고정 지출 ${count}건 자동 기록 완료!`);
      } catch (error) { console.error('자동 기록 오류:', error); }
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
    setEditingItem(item); setEditAmount(String(item.amount));
    setEditCategory(item.category); setEditMemo(item.memo || '');
    setEditType(item.type); setEditFundType(item.fundType || 'shared');
    setShowEditModal(true);
  };
  
  const handleSaveEdit = async () => {
    if (!editAmount || editAmount === '0') { showAlert('알림', '금액을 입력해 주세요!'); return; }
    try {
      const updateData = { amount: parseInt(editAmount), category: editCategory, memo: editMemo, type: editType };
      if (editType === 'expense') updateData.fundType = editFundType;
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
    if (!quickAmount || quickAmount === '0') { showAlert('알림', '금액을 입력해 주세요!'); return; }
    if (!quickCategory) { showAlert('알림', '카테고리를 선택해 주세요!'); return; }
    
    try {
      const txData = {
        type: quickType,
        amount: parseInt(quickAmount),
        category: quickCategory,
        memo: quickMemo || '',
        date: new Date().toISOString(),
        userId: user.uid,
        member: currentWallet?.members?.[user.uid]?.name || userProfile?.name || user.displayName || '미지정',
        createdAt: new Date().toISOString(),
      };
      if (quickType === 'expense') txData.fundType = quickFundType;
      
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

  // ★ 필터링된 트랜잭션
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // 다른 사람의 용돈 사용 숨기기
      if (t.fundType === 'personal' && t.userId !== user?.uid) return false;
      
      // 필터: 유형
      if (filterType !== 'all' && t.type !== filterType) return false;
      
      // 필터: 공금/용돈
      if (filterFundType !== 'all') {
        if (filterFundType === 'shared' && t.fundType === 'personal') return false;
        if (filterFundType === 'personal' && t.fundType !== 'personal') return false;
      }
      
      // 필터: 카테고리
      if (filterCategory !== 'all' && t.category !== filterCategory) return false;
      
      // 검색어
      if (searchText) {
        const search = searchText.toLowerCase();
        const memo = (t.memo || '').toLowerCase();
        const catName = (ALL_CATEGORY_NAMES[t.category] || '').toLowerCase();
        const member = (t.member || '').toLowerCase();
        if (!memo.includes(search) && !catName.includes(search) && !member.includes(search)) return false;
      }
      
      return true;
    });
  }, [transactions, filterType, filterFundType, filterCategory, searchText, user?.uid]);

  const formatMoney = (num) => Math.abs(num).toLocaleString('ko-KR') + '원';
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diff === 0) return '오늘';
    if (diff === 1) return '어제';
    if (diff < 7) return `${diff}일 전`;
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const myWalletName = currentWallet?.members?.[user?.uid]?.name || userProfile?.name || '';
  const quickCategories = quickType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

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
            <View>
              <Text style={styles.welcomeText}>{myWalletName}님, 안녕하세요! 👋</Text>
              <Text style={styles.appTitle}>{currentWallet?.name || '가계부'}</Text>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.monthBadge}>
                <Text style={styles.monthBadgeText}>{now.getMonth() + 1}월</Text>
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
              </>
            ) : (
              <>
                <Text style={styles.balanceLabel}>{myAllowance > 0 ? '내 용돈 잔액' : '이번 달 내 지출'}</Text>
                <Text style={styles.balanceAmount}>
                  {myAllowance > 0
                    ? (myAllowanceRemain < 0 ? '-' : '') + formatMoney(myAllowanceRemain)
                    : formatMoney(myPersonalExpense)
                  }
                </Text>
              </>
            )}
          </View>
        </LinearGradient>

        {/* ===== 대시보드 카드들 (그라데이션 위에 플로팅) ===== */}
        <View style={styles.dashboardContainer}>
          {isAdmin ? (
            /* ===== 관리자: 수입/지출 전체 요약 ===== */
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <View style={[styles.summaryIconWrap, { backgroundColor: Colors.income + '15' }]}>
                  <Ionicons name="trending-up" size={18} color={Colors.income} />
                </View>
                <Text style={styles.summaryCardLabel}>수입</Text>
                <Text style={[styles.summaryCardAmount, { color: Colors.income }]}>{formatMoney(totalIncome)}</Text>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryCard}>
                <View style={[styles.summaryIconWrap, { backgroundColor: Colors.expense + '15' }]}>
                  <Ionicons name="trending-down" size={18} color={Colors.expense} />
                </View>
                <Text style={styles.summaryCardLabel}>지출</Text>
                <Text style={[styles.summaryCardAmount, { color: Colors.expense }]}>{formatMoney(totalExpense)}</Text>
                <View style={styles.fundBreakdown}>
                  <View style={styles.fundBreakdownItem}>
                    <View style={[styles.fundDot, { backgroundColor: Colors.primary }]} />
                    <Text style={styles.fundBreakdownText}>공금 {formatMoney(sharedExpense)}</Text>
                  </View>
                  <View style={styles.fundBreakdownItem}>
                    <View style={[styles.fundDot, { backgroundColor: Colors.personal }]} />
                    <Text style={styles.fundBreakdownText}>용돈 {formatMoney(totalAllowance)}</Text>
                  </View>
                </View>
              </View>
            </View>
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
                  <Text style={styles.memberProgressText}>{myAllowancePct}% 사용</Text>
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
                  <Text style={styles.filterChipText}>{filterFundType === 'shared' ? '공금' : '용돈'}</Text>
                  <TouchableOpacity onPress={() => setFilterFundType('all')}>
                    <Ionicons name="close" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              )}
              {filterCategory !== 'all' && (
                <View style={styles.filterChip}>
                  <Text style={styles.filterChipText}>{ALL_CATEGORY_NAMES[filterCategory]}</Text>
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
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>거래 내역</Text>
            <Text style={styles.sectionCount}>{filteredTransactions.length}건</Text>
          </View>

          {filteredTransactions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="receipt-outline" size={48} color={Colors.textLight} />
              <Text style={styles.emptyText}>
                {hasActiveFilter ? '필터에 맞는 내역이 없어요' : '아직 기록이 없어요'}
              </Text>
              {hasActiveFilter && (
                <TouchableOpacity style={styles.emptyBtn} onPress={resetFilters}>
                  <Text style={styles.emptyBtnText}>필터 해제</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredTransactions.slice(0, 50).map((item) => {
              const isPersonal = item.type === 'expense' && item.fundType === 'personal';
              return (
                <TouchableOpacity 
                  key={item.id} 
                  style={styles.txCard} 
                  onPress={() => handleEdit(item)} 
                  onLongPress={() => handleDelete(item.id, item.memo || ALL_CATEGORY_NAMES[item.category] || '기타')} 
                  delayLongPress={500}
                  activeOpacity={0.7}
                >
                  <View style={[styles.txIcon, { backgroundColor: (Colors.category[item.category] || Colors.primary) + '15' }]}>
                    <Ionicons name={ALL_CATEGORY_ICONS[item.category] || 'ellipsis-horizontal-outline'} size={20} color={Colors.category[item.category] || Colors.primary} />
                  </View>
                  <View style={styles.txInfo}>
                    <Text style={styles.txTitle} numberOfLines={1}>{item.memo || ALL_CATEGORY_NAMES[item.category] || '기타'}</Text>
                    <View style={styles.txMeta}>
                      <Text style={styles.txDate}>{formatDate(item.date)}</Text>
                      {item.type === 'expense' && (
                        <View style={[styles.txTag, { backgroundColor: isPersonal ? Colors.personal + '15' : Colors.primary + '10' }]}>
                          <Text style={[styles.txTagText, { color: isPersonal ? Colors.personal : Colors.primary }]}>
                            {isPersonal ? '용돈' : '공금'}
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

            {/* 수입/지출 선택 */}
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
            </View>

            {/* 공금/용돈 선택 (지출일 때만) */}
            {quickType === 'expense' && (
              <View style={styles.fundSelector}>
                <TouchableOpacity 
                  style={[styles.fundBtn, quickFundType === 'shared' && { backgroundColor: Colors.primary + '20', borderColor: Colors.primary }]} 
                  onPress={() => setQuickFundType('shared')}
                >
                  <Ionicons name="people" size={16} color={Colors.primary} />
                  <Text style={[styles.fundBtnText, { color: Colors.primary }]}>공금</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.fundBtn, quickFundType === 'personal' && { backgroundColor: Colors.personal + '20', borderColor: Colors.personal }]}
                  onPress={() => setQuickFundType('personal')}
                >
                  <Ionicons name="person" size={16} color={Colors.personal} />
                  <Text style={[styles.fundBtnText, { color: Colors.personal }]}>용돈</Text>
                </TouchableOpacity>
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
              onChangeText={(t) => setQuickAmount(t.replace(/[^0-9]/g, ''))}
            />
            {quickAmount ? (
              <Text style={styles.amountPreview}>{parseInt(quickAmount).toLocaleString()}원</Text>
            ) : null}

            {/* 카테고리 */}
            <Text style={styles.inputLabel}>카테고리</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {quickCategories.map((cat) => (
                <TouchableOpacity 
                  key={cat.id} 
                  style={[
                    styles.categoryChip, 
                    quickCategory === cat.id && { backgroundColor: Colors.category[cat.id], borderColor: Colors.category[cat.id] }
                  ]} 
                  onPress={() => setQuickCategory(cat.id)}
                >
                  <Ionicons name={cat.icon} size={16} color={quickCategory === cat.id ? '#fff' : Colors.category[cat.id]} />
                  <Text style={[styles.categoryChipText, quickCategory === cat.id && { color: '#fff' }]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
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

            {/* 공금/용돈 필터 */}
            <Text style={styles.filterLabel}>지출 구분</Text>
            <View style={styles.filterOptions}>
              {[{ key: 'all', label: '전체' }, { key: 'shared', label: '공금' }, { key: 'personal', label: '용돈' }].map((opt) => (
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
                {EXPENSE_CATEGORIES.map((cat) => (
                  <TouchableOpacity 
                    key={cat.id}
                    style={[styles.categoryFilterItem, filterCategory === cat.id && styles.categoryFilterItemActive]}
                    onPress={() => setFilterCategory(cat.id)}
                  >
                    <Ionicons name={cat.icon} size={16} color={filterCategory === cat.id ? '#fff' : Colors.category[cat.id]} />
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
                <TouchableOpacity style={[styles.fundBtn, editFundType === 'shared' && { backgroundColor: Colors.primary + '20', borderColor: Colors.primary }]} onPress={() => setEditFundType('shared')}>
                  <Ionicons name="people" size={16} color={Colors.primary} /><Text style={[styles.fundBtnText, { color: Colors.primary }]}>공금</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.fundBtn, editFundType === 'personal' && { backgroundColor: Colors.personal + '20', borderColor: Colors.personal }]} onPress={() => setEditFundType('personal')}>
                  <Ionicons name="person" size={16} color={Colors.personal} /><Text style={[styles.fundBtnText, { color: Colors.personal }]}>용돈</Text>
                </TouchableOpacity>
              </View>
            )}
            
            <Text style={styles.inputLabel}>금액</Text>
            <TextInput style={styles.amountInput} keyboardType="numeric" value={editAmount} onChangeText={(t) => setEditAmount(t.replace(/[^0-9]/g, ''))} />
            
            <Text style={styles.inputLabel}>카테고리</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {EXPENSE_CATEGORIES.map((cat) => (
                <TouchableOpacity key={cat.id} style={[styles.categoryChip, editCategory === cat.id && { backgroundColor: Colors.category[cat.id], borderColor: Colors.category[cat.id] }]} onPress={() => setEditCategory(cat.id)}>
                  <Ionicons name={cat.icon} size={16} color={editCategory === cat.id ? '#fff' : Colors.category[cat.id]} />
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
  headerGradient: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 60, paddingHorizontal: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  welcomeText: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  appTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 2 },
  headerRight: { flexDirection: 'row', gap: 8 },
  monthBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  monthBadgeText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // 잔액 (그라데이션 안)
  balanceSection: { alignItems: 'center', paddingBottom: 8 },
  balanceLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  balanceAmount: { fontSize: 34, fontWeight: '800', color: '#FFFFFF' },

  // 대시보드 (플로팅)
  dashboardContainer: { paddingHorizontal: 16, marginTop: -36 },

  // 수입/지출 통합 카드
  summaryRow: { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 6 },
  summaryCard: { flex: 1, alignItems: 'center' },
  summaryIconWrap: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  summaryCardLabel: { fontSize: 12, fontWeight: '600', color: Colors.textGray, marginBottom: 4 },
  summaryCardAmount: { fontSize: 18, fontWeight: '800' },
  summaryDivider: { width: 1, height: '100%', backgroundColor: Colors.divider, marginHorizontal: 4 },
  fundBreakdown: { marginTop: 8, gap: 2, alignItems: 'flex-start' },
  fundBreakdownItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fundDot: { width: 6, height: 6, borderRadius: 3 },
  fundBreakdownText: { fontSize: 10, color: Colors.textGray },

  // 일반 멤버 요약 카드
  memberSummaryCard: { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 6 },
  memberAllowanceHeader: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  memberAllowanceInfo: { alignItems: 'center' },
  memberAllowanceLabel: { fontSize: 12, fontWeight: '600', color: Colors.textGray, marginBottom: 4 },
  memberAllowanceTotal: { fontSize: 20, fontWeight: '800', color: Colors.textBlack },
  memberProgressBar: { height: 8, backgroundColor: Colors.background, borderRadius: 4, overflow: 'hidden' },
  memberProgressFill: { height: 8, borderRadius: 4 },
  memberProgressText: { fontSize: 12, fontWeight: '600', color: Colors.textGray, textAlign: 'right', marginTop: 6 },
  memberNoAllowance: { alignItems: 'center', paddingVertical: 8, gap: 8 },
  memberNoAllowanceText: { fontSize: 15, fontWeight: '600', color: Colors.textBlack },
  memberNoAllowanceSubText: { fontSize: 13, color: Colors.textGray },

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
  filterSection: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, height: 44, gap: 8 },
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
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.textBlack },
  sectionCount: { fontSize: 13, color: Colors.textGray },

  emptyCard: { alignItems: 'center', paddingVertical: 48, backgroundColor: Colors.surface, borderRadius: 16 },
  emptyText: { fontSize: 14, color: Colors.textGray, marginTop: 12 },
  emptyBtn: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.primary + '15', borderRadius: 8 },
  emptyBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  txCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: 8, gap: 12 },
  txIcon: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  txInfo: { flex: 1 },
  txTitle: { fontSize: 15, fontWeight: '600', color: Colors.textBlack },
  txMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  txDate: { fontSize: 12, color: Colors.textGray },
  txTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  txTagText: { fontSize: 10, fontWeight: '600' },
  txAmount: { fontSize: 15, fontWeight: '700' },

  // FAB
  fab: { position: 'absolute', right: 20, bottom: 90, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  fabLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // 모달 공통
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.textLight, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.textBlack, marginBottom: 20 },

  // 빠른 등록 모달
  quickAddModal: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '90%' },
  typeSelector: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: Colors.background },
  typeBtnText: { fontSize: 15, fontWeight: '700', color: Colors.textGray },
  fundSelector: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  fundBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background },
  fundBtnText: { fontSize: 13, fontWeight: '600' },
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
});