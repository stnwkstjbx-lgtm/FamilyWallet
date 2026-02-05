import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, TouchableOpacity, Platform, TextInput, Modal, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Circle } from 'react-native-svg';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useTheme } from '../constants/ThemeContext';
import { useAuth } from '../constants/AuthContext';
import { useWallet } from '../constants/WalletContext';
import { ALL_CATEGORY_NAMES, ALL_CATEGORY_ICONS, EXPENSE_CATEGORIES, FUND_TYPES, FUND_TYPE_MAP } from '../constants/categories';
import { formatAmountInput, parseAmount, validateAmount } from '../utils/format';
import { db } from '../firebase/firebaseConfig';
import { collection, onSnapshot, query, where, orderBy, addDoc } from 'firebase/firestore';

LocaleConfig.locales['ko'] = {
  monthNames: ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
  monthNamesShort: ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
  dayNames: ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'],
  dayNamesShort: ['일','월','화','수','목','금','토'],
};
LocaleConfig.defaultLocale = 'ko';

const showAlert = (title, message, buttons) => {
  if (Platform.OS === 'web') {
    if (buttons) {
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed && buttons[1]) buttons[1].onPress();
    } else { window.alert(`${title}\n\n${message}`); }
  } else { Alert.alert(title, message, buttons); }
};

export default function InsightsScreen() {
  const { colors: Colors } = useTheme();
  const { user } = useAuth();
  const {
    currentWalletId, currentWallet, isAdmin,
    requestAllowance, respondToAllowanceRequest,
  } = useWallet();
  const styles = getStyles(Colors);

  const [tab, setTab] = useState('stats'); // 'stats' | 'calendar' | 'allowance'
  const [allTransactions, setAllTransactions] = useState([]);

  // 월 네비게이션
  const [yearMonth, setYearMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedDate, setSelectedDate] = useState(null);

  const ymLabel = useMemo(() => {
    const [y, m] = yearMonth.split('-');
    return `${y}년 ${parseInt(m)}월`;
  }, [yearMonth]);

  const changeMonth = (delta) => {
    const [y, m] = yearMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  useEffect(() => {
    if (!currentWalletId) return;
    const unsub = onSnapshot(query(collection(db, 'wallets', currentWalletId, 'transactions')), (snapshot) => {
      setAllTransactions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [currentWalletId]);

  // 타인 용돈 필터링
  const transactions = useMemo(() => {
    return allTransactions.filter((t) => {
      if (t.fundType === 'personal') {
        if ((t.userId || t.memberId) !== user?.uid) return false;
      }
      if (t.fundType === 'allowance_allocation') return false;
      return true;
    });
  }, [allTransactions, user?.uid]);

  const monthly = useMemo(() => transactions.filter((t) => (t.date || '').startsWith(yearMonth)), [transactions, yearMonth]);
  const prevYm = useMemo(() => {
    const [y, m] = yearMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [yearMonth]);
  const prevMonthly = useMemo(() => transactions.filter((t) => (t.date || '').startsWith(prevYm)), [transactions, prevYm]);

  const formatMoney = (n) => Math.abs(n || 0).toLocaleString('ko-KR') + '원';
  const formatMoneyShort = (n) => {
    const abs = Math.abs(n || 0);
    if (abs >= 10000) {
      const man = Math.floor(abs / 10000);
      const rest = abs % 10000;
      return rest === 0 ? `${man}만` : `${man}.${Math.floor(rest / 1000)}만`;
    }
    return abs.toLocaleString('ko-KR');
  };

  // ═══════════════════════════════════
  // 통계 탭 데이터
  // ═══════════════════════════════════
  const totalIncome = monthly.filter((t) => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const totalExpense = monthly.filter((t) => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);

  const fundBreakdown = useMemo(() => {
    const result = {};
    FUND_TYPES.forEach((ft) => { result[ft.id] = 0; });
    monthly.filter((t) => t.type === 'expense' && t.fundType !== 'allowance_allocation').forEach((t) => {
      const ft = t.fundType || 'shared';
      if (result[ft] !== undefined) result[ft] += t.amount || 0;
    });
    return result;
  }, [monthly]);

  const prevTotalIncome = prevMonthly.filter((t) => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const prevTotalExpense = prevMonthly.filter((t) => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const incomeChange = prevTotalIncome > 0 ? Math.round(((totalIncome - prevTotalIncome) / prevTotalIncome) * 100) : null;
  const expenseChange = prevTotalExpense > 0 ? Math.round(((totalExpense - prevTotalExpense) / prevTotalExpense) * 100) : null;

  const expenseCatData = useMemo(() => {
    const catData = {};
    monthly.filter((t) => t.type === 'expense' && t.fundType !== 'allowance_allocation').forEach((t) => {
      if (!catData[t.category]) catData[t.category] = { total: 0 };
      catData[t.category].total += t.amount || 0;
    });
    return Object.entries(catData).sort((a, b) => b[1].total - a[1].total);
  }, [monthly]);

  const prevExpenseCatData = useMemo(() => {
    const catData = {};
    prevMonthly.filter((t) => t.type === 'expense' && t.fundType !== 'allowance_allocation').forEach((t) => {
      if (!catData[t.category]) catData[t.category] = 0;
      catData[t.category] += t.amount || 0;
    });
    return catData;
  }, [prevMonthly]);

  const incomeCatData = useMemo(() => {
    const catData = {};
    monthly.filter((t) => t.type === 'income').forEach((t) => {
      if (!catData[t.category]) catData[t.category] = 0;
      catData[t.category] += t.amount || 0;
    });
    return Object.entries(catData).sort((a, b) => b[1] - a[1]);
  }, [monthly]);

  const dailyExpense = useMemo(() => {
    const days = {};
    monthly.filter((t) => t.type === 'expense').forEach((t) => {
      const day = parseInt((t.date || '').split('-')[2] || '0');
      if (day > 0) days[day] = (days[day] || 0) + (t.amount || 0);
    });
    return days;
  }, [monthly]);
  const maxDailyExpense = useMemo(() => Math.max(...Object.values(dailyExpense), 1), [dailyExpense]);
  const daysInMonth = useMemo(() => {
    const [y, m] = yearMonth.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }, [yearMonth]);

  // 저축률
  const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;

  // 주중 vs 주말 소비
  const weekdayWeekend = useMemo(() => {
    let weekday = 0, weekend = 0, weekdayCount = 0, weekendCount = 0;
    monthly.filter((t) => t.type === 'expense').forEach((t) => {
      const [y, m, d] = (t.date || '').split('-').map(Number);
      if (!d) return;
      const dow = new Date(y, m - 1, d).getDay();
      if (dow === 0 || dow === 6) { weekend += t.amount || 0; weekendCount++; }
      else { weekday += t.amount || 0; weekdayCount++; }
    });
    return { weekday, weekend, weekdayAvg: weekdayCount > 0 ? Math.round(weekday / weekdayCount) : 0, weekendAvg: weekendCount > 0 ? Math.round(weekend / weekendCount) : 0 };
  }, [monthly]);

  const chartSize = 170;
  const strokeWidth = 26;
  const radius = (chartSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // ═══════════════════════════════════
  // 캘린더 데이터
  // ═══════════════════════════════════
  const dateAggregates = useMemo(() => {
    const agg = {};
    transactions.forEach((t) => {
      const dateKey = (t.date || '').split('T')[0];
      if (!dateKey) return;
      if (!agg[dateKey]) agg[dateKey] = { income: 0, expense: 0 };
      if (t.type === 'income') agg[dateKey].income += t.amount || 0;
      else if (t.type === 'expense') agg[dateKey].expense += t.amount || 0;
    });
    return agg;
  }, [transactions]);

  const calendarMarks = useMemo(() => {
    const marks = {};
    Object.entries(dateAggregates).forEach(([date, data]) => {
      const dots = [];
      if (data.income > 0) dots.push({ key: 'income', color: Colors.income });
      if (data.expense > 0) dots.push({ key: 'expense', color: Colors.expense });
      marks[date] = { dots, selected: selectedDate === date, selectedColor: Colors.primary + '20', selectedTextColor: Colors.primary };
    });
    if (selectedDate && !marks[selectedDate]) {
      marks[selectedDate] = { selected: true, selectedColor: Colors.primary + '20', selectedTextColor: Colors.primary, dots: [] };
    }
    return marks;
  }, [dateAggregates, selectedDate, Colors]);

  const selectedTx = useMemo(() => {
    if (!selectedDate) return [];
    return transactions.filter((t) => (t.date || '').startsWith(selectedDate)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [transactions, selectedDate]);

  const dayData = dateAggregates[selectedDate] || { income: 0, expense: 0 };
  const monthlySummary = useMemo(() => {
    let income = 0, expense = 0;
    Object.entries(dateAggregates).forEach(([date, data]) => {
      if (date.startsWith(yearMonth)) { income += data.income; expense += data.expense; }
    });
    return { income, expense };
  }, [dateAggregates, yearMonth]);

  // 무지출 연속일
  const noSpendStreak = useMemo(() => {
    const today = new Date();
    let streak = 0;
    for (let i = 0; i < 60; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const data = dateAggregates[key];
      if (!data || data.expense === 0) streak++;
      else break;
    }
    return streak;
  }, [dateAggregates]);

  // 이번 주 요약
  const weekSummary = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    let income = 0, expense = 0, days = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      if (d > today) break;
      days++;
      const key = d.toISOString().slice(0, 10);
      const data = dateAggregates[key];
      if (data) { income += data.income; expense += data.expense; }
    }
    return { income, expense, days, dailyAvg: days > 0 ? Math.round(expense / days) : 0 };
  }, [dateAggregates]);

  // 월 일평균 지출
  const monthlyDailyAvg = useMemo(() => {
    const expenseDays = Object.entries(dateAggregates).filter(([date, data]) => date.startsWith(yearMonth) && data.expense > 0);
    const total = expenseDays.reduce((s, [, d]) => s + d.expense, 0);
    return expenseDays.length > 0 ? Math.round(total / expenseDays.length) : 0;
  }, [dateAggregates, yearMonth]);

  const formatDateLabel = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    return `${parseInt(m)}월 ${parseInt(d)}일 (${weekdays[date.getDay()]})`;
  };

  const renderDayComponent = ({ date, state }) => {
    const dateKey = date.dateString;
    const data = dateAggregates[dateKey];
    const isSelected = selectedDate === dateKey;
    const isToday = dateKey === new Date().toISOString().slice(0, 10);
    const isDisabled = state === 'disabled';
    return (
      <TouchableOpacity
        style={[styles.dayContainer, isSelected && { backgroundColor: Colors.primary + '15', borderColor: Colors.primary + '40', borderWidth: 1 }, isToday && !isSelected && { borderColor: Colors.primary + '30', borderWidth: 1 }]}
        onPress={() => setSelectedDate(dateKey)} activeOpacity={0.7}
      >
        <Text style={[styles.dayText, isDisabled && { color: Colors.textLight }, isToday && { color: Colors.primary, fontWeight: '800' }, isSelected && { color: Colors.primary, fontWeight: '800' }]}>{date.day}</Text>
        {data && !isDisabled && (
          <View style={styles.dayAmounts}>
            {data.income > 0 && <Text style={styles.dayIncome} numberOfLines={1}>+{formatMoneyShort(data.income)}</Text>}
            {data.expense > 0 && <Text style={styles.dayExpense} numberOfLines={1}>-{formatMoneyShort(data.expense)}</Text>}
          </View>
        )}
        {!data && !isDisabled && <View style={styles.dayAmountsPlaceholder} />}
      </TouchableOpacity>
    );
  };

  // ═══════════════════════════════════
  // 용돈 탭 데이터
  // ═══════════════════════════════════
  const myAllowance = currentWallet?.members?.[user?.uid]?.monthlyAllowance || currentWallet?.members?.[user?.uid]?.allowance || 0;
  const [personalTransactions, setPersonalTransactions] = useState([]);
  const [allocationTransactions, setAllocationTransactions] = useState([]);
  const [allowanceRequests, setAllowanceRequests] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  const [requestMessage, setRequestMessage] = useState('');

  useEffect(() => {
    if (!currentWalletId || !user) return;
    const txRef = collection(db, 'wallets', currentWalletId, 'transactions');
    const q1 = query(txRef, where('fundType', '==', 'personal'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const q2 = query(txRef, where('fundType', '==', 'allowance_allocation'), where('allocatedTo', '==', user.uid));
    const unsub1 = onSnapshot(q1, (snap) => setPersonalTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const unsub2 = onSnapshot(q2, (snap) => setAllocationTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => { unsub1(); unsub2(); };
  }, [currentWalletId, user]);

  useEffect(() => {
    if (!currentWalletId) return;
    const reqRef = collection(db, 'wallets', currentWalletId, 'allowanceRequests');
    const q = query(reqRef, orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => setAllowanceRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [currentWalletId]);

  const monthlyStats = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const stats = {};
    const allocatedMonths = {};
    allocationTransactions.forEach((tx) => {
      const ym = tx.allocMonth || tx.date?.slice(0, 7);
      if (ym) allocatedMonths[ym] = tx.amount || 0;
    });
    if (!allocatedMonths[currentMonth] && myAllowance > 0) allocatedMonths[currentMonth] = myAllowance;
    Object.entries(allocatedMonths).forEach(([ym, amount]) => { stats[ym] = { allowance: amount, spent: 0, saved: amount }; });
    personalTransactions.forEach((tx) => {
      const txMonth = tx.date?.slice(0, 7);
      if (stats[txMonth]) { stats[txMonth].spent += tx.amount || 0; stats[txMonth].saved = stats[txMonth].allowance - stats[txMonth].spent; }
    });
    return stats;
  }, [personalTransactions, allocationTransactions, myAllowance]);

  const allowanceReport = useMemo(() => {
    const now = new Date();
    const cm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lm = (() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
    const current = monthlyStats[cm] || { allowance: myAllowance, spent: 0, saved: myAllowance };
    const last = monthlyStats[lm] || { allowance: myAllowance, spent: 0, saved: myAllowance };
    const recentMonths = [];
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyStats[key] && monthlyStats[key].allowance > 0) recentMonths.push({ ...monthlyStats[key], ym: key });
    }
    const totalSaved = recentMonths.reduce((sum, m) => sum + Math.max(0, m.saved), 0);
    const avgSaved = recentMonths.length > 0 ? Math.round(totalSaved / recentMonths.length) : Math.max(0, current.saved);
    const currentMonthTxs = personalTransactions.filter((tx) => tx.date?.slice(0, 7) === cm);
    return { cm, current, last, totalSaved, avgSaved, projectedYearly: avgSaved * 12, currentMonthTxs, recentMonths };
  }, [monthlyStats, personalTransactions, myAllowance]);

  // 용돈 카테고리별 분석
  const allowanceCatBreakdown = useMemo(() => {
    const catData = {};
    allowanceReport.currentMonthTxs.forEach((tx) => {
      const cat = tx.category || 'etc';
      if (!catData[cat]) catData[cat] = 0;
      catData[cat] += tx.amount || 0;
    });
    return Object.entries(catData).sort((a, b) => b[1] - a[1]);
  }, [allowanceReport.currentMonthTxs]);

  const remainingPercent = myAllowance > 0 ? Math.max(0, Math.min(100, Math.round((allowanceReport.current.saved / myAllowance) * 100))) : 0;
  const myPendingRequest = allowanceRequests.find((r) => r.userId === user?.uid && r.status === 'pending');
  const pendingRequests = allowanceRequests.filter((r) => r.status === 'pending');

  const handleAddExpense = async () => {
    if (!selectedCategory) { showAlert('알림', '카테고리를 선택해주세요'); return; }
    const amount = parseAmount(expenseAmount);
    const amtCheck = validateAmount(amount);
    if (!amtCheck.valid) { showAlert('알림', amtCheck.message); return; }
    try {
      await addDoc(collection(db, 'wallets', currentWalletId, 'transactions'), {
        type: 'expense', fundType: 'personal', category: selectedCategory, amount,
        memo: expenseDesc || ALL_CATEGORY_NAMES[selectedCategory] || selectedCategory,
        date: new Date().toISOString().slice(0, 10), userId: user.uid, memberId: user.uid,
        member: currentWallet?.members?.[user.uid]?.name || user.displayName || user.email,
        memberName: currentWallet?.members?.[user.uid]?.name || user.displayName || user.email,
        createdAt: new Date().toISOString(),
      });
      setShowAddModal(false); setSelectedCategory(null); setExpenseAmount(''); setExpenseDesc('');
    } catch (e) { showAlert('오류', e.message); }
  };

  const handleRequestAllowance = async () => {
    const amount = parseAmount(requestAmount);
    const amtCheck = validateAmount(amount);
    if (!amtCheck.valid) { showAlert('알림', amtCheck.message); return; }
    const result = await requestAllowance(amount, requestMessage);
    if (result.success) { setShowRequestModal(false); setRequestAmount(''); setRequestMessage(''); showAlert('요청 완료', '관리자에게 용돈 요청을 보냈어요!'); }
    else showAlert('오류', result.message);
  };

  // ═══════════════════════════════════
  // 렌더링 - 통계 탭
  // ═══════════════════════════════════
  const renderStats = () => {
    let accumulated = 0;
    return (
      <>
        {/* 월 네비 */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthNavBtn}><Ionicons name="chevron-back" size={20} color={Colors.primary} /></TouchableOpacity>
          <Text style={styles.monthNavText}>{ymLabel}</Text>
          <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthNavBtn}><Ionicons name="chevron-forward" size={20} color={Colors.primary} /></TouchableOpacity>
        </View>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { borderLeftColor: Colors.income }]}>
            <Text style={styles.summaryLabel}>수입</Text>
            <Text style={[styles.summaryAmount, { color: Colors.income }]}>{formatMoney(totalIncome)}</Text>
            {incomeChange !== null && (
              <View style={styles.changeRow}>
                <Ionicons name={incomeChange >= 0 ? 'trending-up' : 'trending-down'} size={12} color={incomeChange >= 0 ? Colors.income : Colors.expense} />
                <Text style={[styles.changeText, { color: incomeChange >= 0 ? Colors.income : Colors.expense }]}>전월 대비 {Math.abs(incomeChange)}%{incomeChange >= 0 ? ' 증가' : ' 감소'}</Text>
              </View>
            )}
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: Colors.expense }]}>
            <Text style={styles.summaryLabel}>지출</Text>
            <Text style={[styles.summaryAmount, { color: Colors.expense }]}>{formatMoney(totalExpense)}</Text>
            {expenseChange !== null && (
              <View style={styles.changeRow}>
                <Ionicons name={expenseChange <= 0 ? 'trending-down' : 'trending-up'} size={12} color={expenseChange <= 0 ? Colors.income : Colors.expense} />
                <Text style={[styles.changeText, { color: expenseChange <= 0 ? Colors.income : Colors.expense }]}>전월 대비 {Math.abs(expenseChange)}%{expenseChange >= 0 ? ' 증가' : ' 감소'}</Text>
              </View>
            )}
          </View>
        </View>

        {/* 잔액 + 저축률 */}
        <View style={styles.balanceCard}>
          <View>
            <Text style={styles.balanceLabel}>이번 달 잔액</Text>
            <Text style={[styles.balanceAmount, { color: (totalIncome - totalExpense) >= 0 ? Colors.income : Colors.expense }]}>
              {(totalIncome - totalExpense) >= 0 ? '+' : '-'}{formatMoney(totalIncome - totalExpense)}
            </Text>
          </View>
          {totalIncome > 0 && (
            <View style={[styles.savingsRateBadge, { backgroundColor: savingsRate >= 20 ? Colors.income + '15' : savingsRate >= 0 ? '#E67E22' + '15' : Colors.expense + '15' }]}>
              <Text style={{ fontSize: 10, color: Colors.textGray }}>저축률</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: savingsRate >= 20 ? Colors.income : savingsRate >= 0 ? '#E67E22' : Colors.expense }}>{savingsRate}%</Text>
            </View>
          )}
        </View>

        {/* 주중/주말 소비 패턴 */}
        {totalExpense > 0 && (weekdayWeekend.weekday > 0 || weekdayWeekend.weekend > 0) && (
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>소비 패턴</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[styles.patternCard, { backgroundColor: Colors.primary + '08' }]}>
                <Ionicons name="briefcase-outline" size={16} color={Colors.primary} />
                <Text style={{ fontSize: 11, color: Colors.textGray, marginTop: 4 }}>주중 건당 평균</Text>
                <Text style={{ fontSize: 15, fontWeight: '800', color: Colors.primary }}>{formatMoney(weekdayWeekend.weekdayAvg)}</Text>
              </View>
              <View style={[styles.patternCard, { backgroundColor: Colors.expense + '08' }]}>
                <Ionicons name="sunny-outline" size={16} color={Colors.expense} />
                <Text style={{ fontSize: 11, color: Colors.textGray, marginTop: 4 }}>주말 건당 평균</Text>
                <Text style={{ fontSize: 15, fontWeight: '800', color: Colors.expense }}>{formatMoney(weekdayWeekend.weekendAvg)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* 6분류 출처 */}
        {totalExpense > 0 && (
          <View style={styles.fundCard}>
            <Text style={styles.sectionTitle}>지출 출처 비율</Text>
            <View style={styles.fundBarRow}>
              {FUND_TYPES.map((ft) => {
                const amt = fundBreakdown[ft.id] || 0;
                const pct = totalExpense > 0 ? Math.round((amt / totalExpense) * 100) : 0;
                if (pct === 0) return null;
                return <View key={ft.id} style={[styles.fundBar, { flex: pct, backgroundColor: ft.color }]}>{pct >= 15 && <Text style={styles.fundBarText}>{ft.name} {pct}%</Text>}</View>;
              })}
            </View>
            <View style={styles.fundLegendRow}>
              {FUND_TYPES.map((ft) => {
                const amt = fundBreakdown[ft.id] || 0;
                if (amt === 0) return null;
                return (
                  <View key={ft.id} style={styles.fundLegendItem}>
                    <View style={[styles.fundLegendDot, { backgroundColor: ft.color }]} />
                    <Ionicons name={ft.icon} size={12} color={ft.color} />
                    <Text style={styles.fundLegendLabel}>{ft.name}</Text>
                    <Text style={styles.fundLegendValue}>{formatMoney(amt)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* 일별 지출 */}
        {Object.keys(dailyExpense).length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>일별 지출 추이</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.barChartScroll}>
              <View style={styles.barChartContainer}>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                  const val = dailyExpense[day] || 0;
                  const barH = val > 0 ? Math.max((val / maxDailyExpense) * 80, 4) : 0;
                  return (
                    <View key={day} style={styles.barItem}>
                      <View style={styles.barColumn}>
                        {val > 0 && <Text style={styles.barValue}>{formatMoneyShort(val)}</Text>}
                        <View style={[styles.bar, { height: barH, backgroundColor: val > 0 ? Colors.expense + 'CC' : Colors.background }]} />
                      </View>
                      <Text style={[styles.barLabel, day === new Date().getDate() && yearMonth === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}` && { color: Colors.primary, fontWeight: '700' }]}>{day}</Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        )}

        {/* 도넛 차트 + 전월 비교 */}
        {expenseCatData.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>지출 카테고리</Text>
            <View style={styles.donutCenter}>
              <Svg width={chartSize} height={chartSize}>
                <G rotation="-90" origin={`${chartSize / 2}, ${chartSize / 2}`}>
                  {totalExpense > 0 && expenseCatData.map(([cat, data]) => {
                    const pct = data.total / totalExpense;
                    const dashLength = circumference * pct;
                    const dashOffset = circumference * accumulated;
                    accumulated += pct;
                    return <Circle key={cat} cx={chartSize / 2} cy={chartSize / 2} r={radius} stroke={Colors.category[cat] || Colors.primary} strokeWidth={strokeWidth} strokeDasharray={`${dashLength} ${circumference - dashLength}`} strokeDashoffset={-dashOffset} fill="none" strokeLinecap="round" />;
                  })}
                </G>
              </Svg>
              <View style={styles.donutCenterText}>
                <Text style={styles.donutCenterLabel}>총 지출</Text>
                <Text style={styles.donutCenterAmount}>{formatMoney(totalExpense)}</Text>
              </View>
            </View>
            {expenseCatData.map(([cat, data]) => {
              const prevAmt = prevExpenseCatData[cat] || 0;
              const diff = prevAmt > 0 ? Math.round(((data.total - prevAmt) / prevAmt) * 100) : null;
              return (
                <View key={cat} style={styles.catRow}>
                  <View style={[styles.catDot, { backgroundColor: Colors.category[cat] || Colors.primary }]} />
                  <Ionicons name={ALL_CATEGORY_ICONS[cat] || 'ellipsis-horizontal-outline'} size={16} color={Colors.category[cat] || Colors.primary} />
                  <Text style={styles.catName}>{ALL_CATEGORY_NAMES[cat] || cat}</Text>
                  <Text style={styles.catAmount}>{formatMoney(data.total)}</Text>
                  <Text style={styles.catPct}>{Math.round((data.total / totalExpense) * 100)}%</Text>
                  {diff !== null && (
                    <Ionicons name={diff > 0 ? 'caret-up' : 'caret-down'} size={10} color={diff > 0 ? Colors.expense : Colors.income} style={{ marginLeft: 2 }} />
                  )}
                </View>
              );
            })}
          </View>
        )}

        {incomeCatData.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>수입 카테고리</Text>
            {incomeCatData.map(([cat, amount]) => (
              <View key={cat} style={styles.catRow}>
                <View style={[styles.catDot, { backgroundColor: Colors.category[cat] || Colors.income }]} />
                <Ionicons name={ALL_CATEGORY_ICONS[cat] || 'cash-outline'} size={16} color={Colors.category[cat] || Colors.income} />
                <Text style={styles.catName}>{ALL_CATEGORY_NAMES[cat] || cat}</Text>
                <Text style={styles.catAmount}>{formatMoney(amount)}</Text>
                <Text style={styles.catPct}>{Math.round((amount / totalIncome) * 100)}%</Text>
              </View>
            ))}
          </View>
        )}

        {expenseCatData.length === 0 && incomeCatData.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="bar-chart-outline" size={36} color={Colors.textLight} />
            <Text style={styles.emptyText}>이번 달 데이터가 없어요</Text>
          </View>
        )}
      </>
    );
  };

  // ═══════════════════════════════════
  // 렌더링 - 캘린더 탭
  // ═══════════════════════════════════
  const renderCalendar = () => (
    <>
      {/* 이번 주 요약 */}
      <View style={styles.chartCard}>
        <Text style={styles.sectionTitle}>이번 주 요약</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={[styles.weekStatItem, { backgroundColor: Colors.income + '10' }]}>
            <Ionicons name="arrow-down-circle" size={16} color={Colors.income} />
            <Text style={{ fontSize: 10, color: Colors.textGray, marginTop: 2 }}>수입</Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.income }}>{formatMoney(weekSummary.income)}</Text>
          </View>
          <View style={[styles.weekStatItem, { backgroundColor: Colors.expense + '10' }]}>
            <Ionicons name="arrow-up-circle" size={16} color={Colors.expense} />
            <Text style={{ fontSize: 10, color: Colors.textGray, marginTop: 2 }}>지출</Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.expense }}>{formatMoney(weekSummary.expense)}</Text>
          </View>
          <View style={[styles.weekStatItem, { backgroundColor: Colors.primary + '10' }]}>
            <Ionicons name="today-outline" size={16} color={Colors.primary} />
            <Text style={{ fontSize: 10, color: Colors.textGray, marginTop: 2 }}>일평균</Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.primary }}>{formatMoney(weekSummary.dailyAvg)}</Text>
          </View>
        </View>
      </View>

      {/* 무지출 & 일평균 */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <View style={[styles.miniCard, { flex: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="flame" size={18} color={noSpendStreak >= 3 ? Colors.income : '#E67E22'} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textBlack }}>무지출 연속</Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: noSpendStreak >= 3 ? Colors.income : '#E67E22', marginTop: 4 }}>{noSpendStreak}일</Text>
          {noSpendStreak >= 3 && <Text style={{ fontSize: 11, color: Colors.income }}>좋은 흐름이에요!</Text>}
        </View>
        <View style={[styles.miniCard, { flex: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="bar-chart-outline" size={18} color={Colors.primary} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textBlack }}>이달 일평균</Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: Colors.primary, marginTop: 4 }}>{formatMoney(monthlyDailyAvg)}</Text>
          <Text style={{ fontSize: 11, color: Colors.textGray }}>지출일 기준</Text>
        </View>
      </View>

      {/* 캘린더 */}
      <View style={styles.chartCard}>
        <Calendar
          markingType="multi-dot" markedDates={calendarMarks}
          onDayPress={(day) => setSelectedDate(day.dateString)}
          onMonthChange={(month) => setYearMonth(`${month.year}-${String(month.month).padStart(2, '0')}`)}
          key={yearMonth} current={`${yearMonth}-01`}
          dayComponent={renderDayComponent}
          theme={{ backgroundColor: Colors.surface, calendarBackground: Colors.surface, textSectionTitleColor: Colors.textGray, arrowColor: Colors.primary, monthTextColor: Colors.textBlack, textMonthFontWeight: '800', textMonthFontSize: 17, textDayHeaderFontWeight: '600', textDayHeaderFontSize: 13 }}
          style={{ borderRadius: 18 }}
        />
      </View>

      {/* 선택된 날짜 상세 */}
      {selectedDate && (
        <View style={styles.chartCard}>
          <Text style={styles.sectionTitle}>{formatDateLabel(selectedDate)}</Text>
          {(dayData.income > 0 || dayData.expense > 0) && (
            <View style={styles.daySummary}>
              <View style={[styles.daySummaryItem, { backgroundColor: Colors.income + '12' }]}>
                <Ionicons name="arrow-down-circle" size={16} color={Colors.income} />
                <Text style={[styles.daySummaryAmt, { color: Colors.income }]}>{formatMoney(dayData.income)}</Text>
              </View>
              <View style={[styles.daySummaryItem, { backgroundColor: Colors.expense + '12' }]}>
                <Ionicons name="arrow-up-circle" size={16} color={Colors.expense} />
                <Text style={[styles.daySummaryAmt, { color: Colors.expense }]}>{formatMoney(dayData.expense)}</Text>
              </View>
            </View>
          )}
          {selectedTx.length === 0 ? (
            <Text style={styles.emptyText}>이 날의 기록이 없어요</Text>
          ) : (
            selectedTx.map((item) => {
              const catColor = Colors.category[item.category] || Colors.primary;
              return (
                <View key={item.id} style={styles.catRow}>
                  <View style={[styles.txIconSmall, { backgroundColor: catColor + '15' }]}><Ionicons name={ALL_CATEGORY_ICONS[item.category] || 'ellipsis-horizontal-outline'} size={16} color={catColor} /></View>
                  <Text style={styles.catName} numberOfLines={1}>{item.memo || ALL_CATEGORY_NAMES[item.category] || '기타'}</Text>
                  <Text style={[styles.catAmount, { color: item.type === 'income' ? Colors.income : Colors.expense }]}>
                    {item.type === 'income' ? '+' : '-'}{formatMoney(item.amount)}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      )}
    </>
  );

  // ═══════════════════════════════════
  // 렌더링 - 용돈 탭
  // ═══════════════════════════════════
  const renderAllowance = () => {
    const hasAllowance = myAllowance > 0;
    return (
      <>
        {/* 내 용돈 현황 */}
        <View style={styles.chartCard}>
          <Text style={styles.sectionTitle}>내 용돈 현황</Text>
          {hasAllowance ? (
            <>
              <View style={styles.allowSummaryRow}>
                <View style={styles.allowSummaryItem}>
                  <Text style={styles.allowSummaryLabel}>배분</Text>
                  <Text style={[styles.allowSummaryVal, { color: Colors.primary }]}>{formatMoney(myAllowance)}</Text>
                </View>
                <View style={styles.allowSummaryItem}>
                  <Text style={styles.allowSummaryLabel}>사용</Text>
                  <Text style={[styles.allowSummaryVal, { color: Colors.expense }]}>{formatMoney(allowanceReport.current.spent)}</Text>
                </View>
                <View style={styles.allowSummaryItem}>
                  <Text style={styles.allowSummaryLabel}>잔액</Text>
                  <Text style={[styles.allowSummaryVal, { color: allowanceReport.current.saved >= 0 ? Colors.income : Colors.expense }]}>{formatMoney(allowanceReport.current.saved)}</Text>
                </View>
              </View>
              <View style={styles.allowBar}>
                <View style={[styles.allowBarFill, { width: `${Math.min(100, 100 - remainingPercent)}%`, backgroundColor: remainingPercent > 50 ? Colors.income : remainingPercent > 20 ? Colors.warning : Colors.expense }]} />
              </View>
              <Text style={[styles.allowBarText2, { color: Colors.textGray }]}>{remainingPercent}% 남음</Text>
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Ionicons name="wallet-outline" size={36} color={Colors.textLight} />
              <Text style={[styles.emptyText, { marginTop: 8 }]}>용돈이 설정되지 않았어요</Text>
              {!myPendingRequest && (
                <TouchableOpacity style={[styles.requestBtn, { backgroundColor: Colors.primary, marginTop: 12 }]} onPress={() => setShowRequestModal(true)}>
                  <Ionicons name="hand-right-outline" size={16} color="#FFF" />
                  <Text style={{ color: '#FFF', fontWeight: '700', marginLeft: 6 }}>용돈 요청하기</Text>
                </TouchableOpacity>
              )}
              {myPendingRequest && (
                <View style={[styles.pendingBadge, { backgroundColor: '#FFD93D20' }]}>
                  <Ionicons name="time-outline" size={16} color="#E6A800" />
                  <Text style={{ color: '#E6A800', fontWeight: '600', marginLeft: 6 }}>요청 대기 중 ({parseInt(myPendingRequest.amount).toLocaleString()}원)</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* 저축 리포트 */}
        {hasAllowance && (
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>저축 리포트</Text>
            <View style={{ gap: 10 }}>
              <View style={[styles.reportItem, { backgroundColor: Colors.background }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Ionicons name="calendar-outline" size={16} color="#6C63FF" />
                  <Text style={{ fontSize: 12, color: Colors.textGray }}>지난달 절약</Text>
                </View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: allowanceReport.last.saved >= 0 ? Colors.income : Colors.expense }}>
                  {allowanceReport.last.saved >= 0 ? '+' : ''}{formatMoney(allowanceReport.last.saved)}
                </Text>
              </View>
              <View style={[styles.reportItem, { backgroundColor: Colors.background }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Ionicons name="trending-up" size={16} color={Colors.income} />
                  <Text style={{ fontSize: 12, color: Colors.textGray }}>월 평균 절약</Text>
                </View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: Colors.textBlack }}>{formatMoney(allowanceReport.avgSaved)}</Text>
              </View>
              <View style={[styles.reportItem, { backgroundColor: Colors.income + '12', borderWidth: 1, borderColor: Colors.income + '30' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ fontSize: 12, color: Colors.textGray }}>이 추세로 1년 모으면</Text>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: Colors.income, marginTop: 4 }}>{formatMoney(allowanceReport.projectedYearly)}</Text>
                  </View>
                  <Ionicons name="rocket-outline" size={28} color={Colors.income} />
                </View>
              </View>
            </View>
          </View>
        )}

        {/* 월별 절약 추이 */}
        {hasAllowance && allowanceReport.recentMonths.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>월별 절약 추이</Text>
            {allowanceReport.recentMonths.slice().reverse().map((m) => {
              const spentPct = m.allowance > 0 ? Math.min(Math.round((m.spent / m.allowance) * 100), 100) : 0;
              return (
                <View key={m.ym} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textGray }}>{m.ym.split('-')[1]}월</Text>
                    <Text style={{ fontSize: 12, color: m.saved >= 0 ? Colors.income : Colors.expense, fontWeight: '700' }}>
                      {m.saved >= 0 ? '+' : ''}{formatMoney(m.saved)}
                    </Text>
                  </View>
                  <View style={{ height: 8, backgroundColor: Colors.background, borderRadius: 4, overflow: 'hidden' }}>
                    <View style={{ width: `${spentPct}%`, height: 8, borderRadius: 4, backgroundColor: spentPct > 90 ? Colors.expense : spentPct > 70 ? Colors.warning : Colors.income }} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 카테고리별 사용 분석 */}
        {hasAllowance && allowanceCatBreakdown.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>카테고리별 사용</Text>
            {allowanceCatBreakdown.map(([cat, amount]) => {
              const pct = allowanceReport.current.spent > 0 ? Math.round((amount / allowanceReport.current.spent) * 100) : 0;
              const catColor = Colors.category?.[cat] || Colors.primary;
              return (
                <View key={cat} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Ionicons name={ALL_CATEGORY_ICONS[cat] || 'ellipsis-horizontal-outline'} size={14} color={catColor} />
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textDark }}>{ALL_CATEGORY_NAMES[cat] || cat}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textBlack }}>{formatMoney(amount)}</Text>
                    <Text style={{ fontSize: 12, color: Colors.textGray, width: 35, textAlign: 'right' }}>{pct}%</Text>
                  </View>
                  <View style={{ height: 6, backgroundColor: Colors.background, borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: catColor }} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 이번 달 사용 내역 */}
        {hasAllowance && (
          <View style={styles.chartCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={styles.sectionTitle}>이번 달 사용 내역</Text>
              <TouchableOpacity style={[styles.addBtnSmall, { backgroundColor: Colors.primary }]} onPress={() => setShowAddModal(true)}>
                <Ionicons name="add" size={18} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>추가</Text>
              </TouchableOpacity>
            </View>
            {allowanceReport.currentMonthTxs.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <Ionicons name="receipt-outline" size={36} color={Colors.textLight} />
                <Text style={[styles.emptyText, { marginTop: 8 }]}>사용 내역이 없어요</Text>
              </View>
            ) : allowanceReport.currentMonthTxs.map((tx) => {
              const catColor = Colors.category?.[tx.category] || Colors.primary;
              return (
                <View key={tx.id} style={styles.catRow}>
                  <View style={[styles.txIconSmall, { backgroundColor: catColor + '15' }]}>
                    <Ionicons name={ALL_CATEGORY_ICONS[tx.category] || 'ellipsis-horizontal-outline'} size={16} color={catColor} />
                  </View>
                  <Text style={styles.catName}>{tx.memo || ALL_CATEGORY_NAMES[tx.category] || '기타'}</Text>
                  <Text style={[styles.catAmount, { color: Colors.expense }]}>-{formatMoney(tx.amount)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* 관리자: 대기 요청 */}
        {isAdmin && pendingRequests.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>용돈 요청 ({pendingRequests.length})</Text>
            {pendingRequests.map((req) => (
              <View key={req.id} style={[styles.requestCard, { backgroundColor: Colors.background }]}>
                <Text style={{ fontWeight: '700', color: Colors.textBlack }}>{req.userName}</Text>
                <Text style={{ fontWeight: '800', color: Colors.primary, marginTop: 2 }}>{parseInt(req.amount).toLocaleString()}원</Text>
                {req.message ? <Text style={{ fontSize: 12, color: Colors.textGray, marginTop: 4 }}>"{req.message}"</Text> : null}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity style={[styles.requestBtn, { backgroundColor: Colors.primary }]} onPress={async () => {
                    const result = await respondToAllowanceRequest(req.id, true, req.amount);
                    if (result.success) showAlert('승인 완료', `${req.userName}님 용돈 설정됨`);
                  }}>
                    <Ionicons name="checkmark" size={14} color="#FFF" />
                    <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12, marginLeft: 4 }}>승인</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.requestBtn, { backgroundColor: Colors.expense + '15' }]} onPress={async () => {
                    const result = await respondToAllowanceRequest(req.id, false, 0);
                    if (result.success) showAlert('거절 완료', '요청을 거절했어요.');
                  }}>
                    <Ionicons name="close" size={14} color={Colors.expense} />
                    <Text style={{ color: Colors.expense, fontWeight: '700', fontSize: 12, marginLeft: 4 }}>거절</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 }}>
          <Ionicons name="lock-closed" size={14} color={Colors.textLight} />
          <Text style={{ fontSize: 12, color: Colors.textLight }}>용돈 사용 내역은 나만 볼 수 있어요</Text>
        </View>
      </>
    );
  };

  // ═══════════════════════════════════
  // 메인 렌더
  // ═══════════════════════════════════
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[Colors.gradientStart, Colors.gradientMiddle, Colors.gradientEnd]} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.headerTitle}>분석</Text>
          <Text style={styles.headerSubtitle}>{currentWallet?.name || '가계부'}</Text>

          <View style={styles.segmentRow}>
            {[
              { id: 'stats', icon: 'pie-chart', label: '통계' },
              { id: 'calendar', icon: 'calendar', label: '캘린더' },
              { id: 'allowance', icon: 'wallet', label: '용돈' },
            ].map((t) => (
              <TouchableOpacity key={t.id} style={[styles.segmentBtn, tab === t.id && styles.segmentBtnActive]} onPress={() => setTab(t.id)}>
                <Ionicons name={t.icon} size={15} color={tab === t.id ? Colors.primary : 'rgba(255,255,255,0.7)'} />
                <Text style={[styles.segmentText, tab === t.id && styles.segmentTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.monthSummary}>
            <View style={styles.monthSummaryItem}>
              <Ionicons name="trending-up" size={16} color="#A8F0C6" />
              <Text style={styles.monthSummaryLabel}>수입</Text>
              <Text style={styles.monthSummaryValue}>{formatMoney(monthlySummary.income)}</Text>
            </View>
            <View style={styles.monthSummaryDivider} />
            <View style={styles.monthSummaryItem}>
              <Ionicons name="trending-down" size={16} color="#FF8E8E" />
              <Text style={styles.monthSummaryLabel}>지출</Text>
              <Text style={styles.monthSummaryValue}>{formatMoney(monthlySummary.expense)}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {tab === 'stats' && renderStats()}
          {tab === 'calendar' && renderCalendar()}
          {tab === 'allowance' && renderAllowance()}
        </View>
      </ScrollView>

      {/* 용돈 지출 추가 모달 */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>용돈 사용 추가</Text>
          <Text style={{ fontSize: 13, color: Colors.textGray, marginBottom: 12 }}>카테고리</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {EXPENSE_CATEGORIES.map((cat) => {
              const catColor = Colors.category?.[cat.id] || Colors.primary;
              return (
                <TouchableOpacity key={cat.id} style={[styles.catChip, selectedCategory === cat.id && { backgroundColor: catColor + '20', borderColor: catColor }]} onPress={() => setSelectedCategory(cat.id)}>
                  <Ionicons name={cat.icon} size={16} color={selectedCategory === cat.id ? catColor : Colors.textGray} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: selectedCategory === cat.id ? catColor : Colors.textGray }}>{cat.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput style={styles.modalInput} placeholder="금액" placeholderTextColor={Colors.textLight} keyboardType="numeric" value={expenseAmount} onChangeText={(t) => setExpenseAmount(formatAmountInput(t))} />
          <TextInput style={styles.modalInput} placeholder="메모 (선택)" placeholderTextColor={Colors.textLight} value={expenseDesc} onChangeText={setExpenseDesc} />
          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setShowAddModal(false); setSelectedCategory(null); setExpenseAmount(''); setExpenseDesc(''); }}><Text style={styles.modalCancelText}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleAddExpense}><Text style={styles.modalSaveText}>추가</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* 용돈 요청 모달 */}
      <Modal visible={showRequestModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>용돈 요청하기</Text>
          <TextInput style={[styles.modalInput, { fontSize: 20, fontWeight: '700', textAlign: 'center' }]} placeholder="희망 금액" placeholderTextColor={Colors.textLight} keyboardType="numeric" value={requestAmount} onChangeText={(t) => setRequestAmount(formatAmountInput(t))} />
          <TextInput style={styles.modalInput} placeholder="메시지 (선택)" placeholderTextColor={Colors.textLight} value={requestMessage} onChangeText={setRequestMessage} maxLength={50} />
          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setShowRequestModal(false); setRequestAmount(''); setRequestMessage(''); }}><Text style={styles.modalCancelText}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleRequestAllowance}><Text style={styles.modalSaveText}>요청</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}

const getStyles = (Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 20, paddingHorizontal: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  segmentRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 3, marginTop: 16 },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  segmentBtnActive: { backgroundColor: '#FFFFFF' },
  segmentText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  segmentTextActive: { color: Colors.primary },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 12 },
  monthNavBtn: { padding: 6, backgroundColor: Colors.primary + '12', borderRadius: 10 },
  monthNavText: { fontSize: 17, fontWeight: '700', color: Colors.textBlack },
  monthSummary: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 14, padding: 14, marginTop: 12 },
  monthSummaryItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  monthSummaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  monthSummaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  monthSummaryValue: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },
  // 통계
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  summaryCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderLeftWidth: 4, borderWidth: 1, borderColor: Colors.border },
  summaryLabel: { fontSize: 13, color: Colors.textGray },
  summaryAmount: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  changeText: { fontSize: 11, fontWeight: '600' },
  balanceCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { fontSize: 14, fontWeight: '600', color: Colors.textDark },
  balanceAmount: { fontSize: 20, fontWeight: '800' },
  savingsRateBadge: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  patternCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.textBlack, marginBottom: 14, letterSpacing: -0.3 },
  fundCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  fundBarRow: { flexDirection: 'row', height: 28, borderRadius: 14, overflow: 'hidden', marginBottom: 14, gap: 2 },
  fundBar: { justifyContent: 'center', alignItems: 'center' },
  fundBarText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  fundLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  fundLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fundLegendDot: { width: 8, height: 8, borderRadius: 4 },
  fundLegendLabel: { fontSize: 13, color: Colors.textGray },
  fundLegendValue: { fontSize: 13, fontWeight: '600', color: Colors.textDark },
  chartCard: { backgroundColor: Colors.surface, borderRadius: 18, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  barChartScroll: { marginBottom: 4 },
  barChartContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingBottom: 4, minHeight: 110 },
  barItem: { alignItems: 'center', width: 26 },
  barColumn: { alignItems: 'center', justifyContent: 'flex-end', height: 90 },
  bar: { width: 14, borderRadius: 4, minHeight: 0 },
  barValue: { fontSize: 7, color: Colors.textGray, marginBottom: 2, fontWeight: '600' },
  barLabel: { fontSize: 9, color: Colors.textLight, marginTop: 4 },
  donutCenter: { alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  donutCenterText: { position: 'absolute', alignItems: 'center' },
  donutCenterLabel: { fontSize: 12, color: Colors.textGray },
  donutCenterAmount: { fontSize: 18, fontWeight: '800', color: Colors.textBlack },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 8 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catName: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textDark },
  catAmount: { fontSize: 14, fontWeight: '700', color: Colors.textBlack },
  catPct: { fontSize: 13, color: Colors.textGray, width: 40, textAlign: 'right' },
  txIconSmall: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  emptyCard: { alignItems: 'center', paddingVertical: 50, backgroundColor: Colors.surface, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textGray, textAlign: 'center' },
  // 캘린더
  dayContainer: { alignItems: 'center', justifyContent: 'flex-start', width: 44, minHeight: 56, paddingTop: 4, paddingBottom: 2, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  dayText: { fontSize: 14, fontWeight: '500', color: Colors.textBlack },
  dayAmounts: { alignItems: 'center', marginTop: 2 },
  dayAmountsPlaceholder: { height: 20 },
  dayIncome: { fontSize: 8, fontWeight: '700', color: Colors.income, lineHeight: 11 },
  dayExpense: { fontSize: 8, fontWeight: '700', color: Colors.expense, lineHeight: 11 },
  daySummary: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  daySummaryItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  daySummaryAmt: { fontSize: 14, fontWeight: '700' },
  weekStatItem: { flex: 1, alignItems: 'center', borderRadius: 12, padding: 12 },
  miniCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  // 용돈
  allowSummaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  allowSummaryItem: { flex: 1, alignItems: 'center', backgroundColor: Colors.background, borderRadius: 12, padding: 12 },
  allowSummaryLabel: { fontSize: 11, color: Colors.textGray, marginBottom: 4 },
  allowSummaryVal: { fontSize: 16, fontWeight: '800' },
  allowBar: { height: 8, backgroundColor: Colors.background, borderRadius: 4, overflow: 'hidden' },
  allowBarFill: { height: 8, borderRadius: 4 },
  allowBarText2: { fontSize: 12, textAlign: 'right', marginTop: 4 },
  reportItem: { borderRadius: 14, padding: 16 },
  requestCard: { borderRadius: 12, padding: 14, marginBottom: 8 },
  requestBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  pendingBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginTop: 8 },
  addBtnSmall: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border },
  // 모달
  modalOverlay: { flex: 1, backgroundColor: Colors.modalOverlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.textBlack, marginBottom: 16 },
  modalInput: { backgroundColor: Colors.background, borderRadius: 12, padding: 14, fontSize: 16, color: Colors.textBlack, marginBottom: 12 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 10 },
  modalCancelBtn: { flex: 1, backgroundColor: Colors.background, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: Colors.textGray },
  modalSaveBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalSaveText: { fontSize: 15, fontWeight: 'bold', color: '#FFF' },
});
