import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, TouchableOpacity, Platform, TextInput, Modal, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Circle } from 'react-native-svg';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useTheme } from '../constants/ThemeContext';
import { useAuth } from '../constants/AuthContext';
import { useWallet } from '../constants/WalletContext';
import { ALL_CATEGORY_NAMES, ALL_CATEGORY_ICONS, EXPENSE_CATEGORIES, FUND_TYPES, FUND_TYPE_MAP, ASSET_FUND_TYPES } from '../constants/categories';
import { formatAmountInput, parseAmount, validateAmount } from '../utils/format';
import { db } from '../firebase/firebaseConfig';
import { collection, onSnapshot, query, where, orderBy, addDoc, doc, updateDoc } from 'firebase/firestore';

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
    currentWalletId, currentWallet, isAdmin, accumulatedFunds,
    requestAllowance, respondToAllowanceRequest,
  } = useWallet();
  const styles = getStyles(Colors);

  const [tab, setTab] = useState('stats'); // 'stats' | 'asset'
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
      if (monthlyStats[key] && monthlyStats[key].allowance > 0) recentMonths.push(monthlyStats[key]);
    }
    const totalSaved = recentMonths.reduce((sum, m) => sum + Math.max(0, m.saved), 0);
    const avgSaved = recentMonths.length > 0 ? Math.round(totalSaved / recentMonths.length) : Math.max(0, current.saved);
    const currentMonthTxs = personalTransactions.filter((tx) => tx.date?.slice(0, 7) === cm);
    return { cm, current, last, totalSaved, avgSaved, projectedYearly: avgSaved * 12, currentMonthTxs, recentMonths };
  }, [monthlyStats, personalTransactions, myAllowance]);

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
  // 자산 탭 데이터
  // ═══════════════════════════════════
  const fundGoals = currentWallet?.fundGoals || {};

  const assetHistory = useMemo(() => {
    const months = {};
    allTransactions.forEach((tx) => {
      if (tx.type !== 'expense' || !ASSET_FUND_TYPES.includes(tx.fundType)) return;
      const ym = (tx.date || '').slice(0, 7);
      if (!ym) return;
      if (!months[ym]) months[ym] = { savings: 0, investment: 0, emergency: 0 };
      months[ym][tx.fundType] += tx.amount || 0;
    });
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b));
  }, [allTransactions]);

  const totalAsset = (accumulatedFunds?.savings || 0) + (accumulatedFunds?.investment || 0) + (accumulatedFunds?.emergency || 0);
  const assetRatios = totalAsset > 0 ? {
    savings: Math.round(((accumulatedFunds?.savings || 0) / totalAsset) * 100),
    investment: Math.round(((accumulatedFunds?.investment || 0) / totalAsset) * 100),
    emergency: Math.round(((accumulatedFunds?.emergency || 0) / totalAsset) * 100),
  } : { savings: 0, investment: 0, emergency: 0 };

  // 자산 분배 추천 (강화)
  const getAssetAdvice = () => {
    if (totalAsset === 0) return { icon: 'bulb-outline', title: '자산 관리를 시작해보세요', desc: '예적금, 투자, 비상금으로 자산을 분류하여 기록하면\n맞춤 분석을 제공합니다.' };
    const advices = [];
    // 비상금 분석
    if (assetRatios.emergency < 10) advices.push({ type: 'warning', text: `비상금이 ${assetRatios.emergency}%로 부족합니다. 최소 10-20% (${formatMoney(Math.round(totalAsset * 0.15) - (accumulatedFunds?.emergency || 0))} 추가 필요)를 비상금으로 확보하세요.` });
    else if (assetRatios.emergency > 30) advices.push({ type: 'info', text: `비상금 비율이 ${assetRatios.emergency}%로 높아요. 초과분은 예적금이나 투자로 이동시키면 더 나은 수익을 기대할 수 있습니다.` });
    // 투자 분석
    if (assetRatios.investment > 70) advices.push({ type: 'warning', text: `투자 비중이 ${assetRatios.investment}%로 높아요. 시장 변동 리스크가 큽니다. 예적금과 비상금 비율을 높여 안정성을 확보하세요.` });
    else if (assetRatios.investment === 0 && totalAsset >= 500000) advices.push({ type: 'tip', text: '투자를 시작하지 않았어요. 자산의 30% 정도를 ETF나 적립식 펀드로 시작해보는 것을 추천합니다.' });
    else if (assetRatios.investment > 0 && assetRatios.investment < 20 && totalAsset >= 1000000) advices.push({ type: 'tip', text: `투자 비율이 ${assetRatios.investment}%로 보수적입니다. 장기적으로 30-40%까지 늘리면 자산 증식에 유리합니다.` });
    // 예적금 분석
    if (assetRatios.savings > 80) advices.push({ type: 'info', text: `예적금 비중이 ${assetRatios.savings}%로 매우 높아요. 안전하지만 물가 상승률을 고려하면 일부를 투자로 전환하는 것이 좋습니다.` });
    // 균형 잡힘
    if (advices.length === 0) advices.push({ type: 'success', text: '자산 배분이 균형 잡혀 있어요! 현재 비율을 꾸준히 유지하세요.' });
    return advices;
  };

  const getInvestmentInsight = () => {
    const monthlyAvg = assetHistory.length > 0
      ? Math.round(assetHistory.reduce((s, [, d]) => s + d.savings + d.investment + d.emergency, 0) / assetHistory.length)
      : 0;
    const insights = [];
    if (monthlyAvg > 0) insights.push({ icon: 'calculator-outline', text: `월 평균 ${formatMoney(monthlyAvg)}을 자산에 투입하고 있어요.` });
    if (assetHistory.length >= 3) {
      const recent3 = assetHistory.slice(-3);
      const recent3Total = recent3.reduce((s, [, d]) => s + d.savings + d.investment + d.emergency, 0);
      const recent3Avg = Math.round(recent3Total / 3);
      if (recent3Avg > monthlyAvg) insights.push({ icon: 'arrow-up-circle-outline', text: '최근 3개월 투입 금액이 증가 추세입니다.' });
      else if (recent3Avg < monthlyAvg * 0.7) insights.push({ icon: 'arrow-down-circle-outline', text: '최근 3개월 투입 금액이 감소했어요. 자산 증식 속도가 느려지고 있습니다.' });
    }
    // 목표 달성 예측
    ASSET_FUND_TYPES.forEach((ft) => {
      const goal = fundGoals[ft] || 0;
      const current = accumulatedFunds?.[ft] || 0;
      if (goal > 0 && current < goal) {
        const recentContribs = assetHistory.slice(-6).map(([, d]) => d[ft] || 0);
        const avgContrib = recentContribs.length > 0 ? recentContribs.reduce((s, v) => s + v, 0) / recentContribs.length : 0;
        if (avgContrib > 0) {
          const monthsLeft = Math.ceil((goal - current) / avgContrib);
          insights.push({ icon: 'flag-outline', text: `${FUND_TYPE_MAP[ft].name} 목표까지 약 ${monthsLeft}개월 (월 ${formatMoney(Math.round(avgContrib))} 투입 기준)` });
        }
      }
    });
    if (insights.length === 0) insights.push({ icon: 'time-outline', text: '자산 데이터가 쌓이면 더 정확한 인사이트를 제공합니다.' });
    return insights;
  };

  // 투자처 추천
  const getInvestmentRecommendations = () => {
    const recommendations = [];
    const investAmt = accumulatedFunds?.investment || 0;
    const savingsAmt = accumulatedFunds?.savings || 0;
    const emergencyAmt = accumulatedFunds?.emergency || 0;

    // 자산 규모별 추천
    if (totalAsset < 1000000) {
      recommendations.push({
        title: '비상금 우선 확보',
        icon: 'shield-checkmark',
        color: FUND_TYPE_MAP.emergency.color,
        desc: '월 생활비의 3개월분을 비상금으로 먼저 모으세요.',
        products: ['CMA 통장 (수시입출금+이자)', '파킹통장 (높은 이율)', '자유적금'],
      });
    }

    if (totalAsset >= 500000) {
      recommendations.push({
        title: '안정형 저축',
        icon: 'wallet',
        color: FUND_TYPE_MAP.savings.color,
        desc: '원금 보장으로 안정적인 수익을 추구합니다.',
        products: ['정기적금 (연 3-4%)', '청년우대적금 (정부지원)', '주택청약종합저축'],
      });
    }

    if (totalAsset >= 1000000) {
      recommendations.push({
        title: '분산 투자 시작',
        icon: 'pie-chart',
        color: FUND_TYPE_MAP.investment.color,
        desc: '소액부터 다양한 자산에 분산하여 리스크를 줄입니다.',
        products: ['국내 ETF (KODEX 200 등)', '해외 ETF (S&P500, 나스닥)', '적립식 펀드'],
      });
    }

    if (totalAsset >= 3000000 && investAmt > 0) {
      recommendations.push({
        title: '성장형 투자',
        icon: 'rocket',
        color: '#E74C3C',
        desc: '장기 투자로 높은 수익률을 목표로 합니다.',
        products: ['글로벌 ETF 포트폴리오', '테마형 ETF (AI, 반도체 등)', 'ISA 계좌 활용 (세제 혜택)'],
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        title: '자산 관리 시작하기',
        icon: 'bulb',
        color: Colors.primary,
        desc: '먼저 자산을 기록하고 현황을 파악해보세요.',
        products: ['지출 시 예적금/투자/비상금으로 분류', '월 저축 목표 설정', '자동이체로 강제 저축'],
      });
    }

    return recommendations;
  };

  // 자산 건강도 점수
  const getAssetHealthScore = () => {
    if (totalAsset === 0) return { score: 0, grade: '-', color: Colors.textLight };
    let score = 50; // 기본
    // 비상금 비율 (10-20%가 이상적)
    if (assetRatios.emergency >= 10 && assetRatios.emergency <= 20) score += 15;
    else if (assetRatios.emergency >= 5) score += 8;
    // 투자 비율 (30-40%가 이상적)
    if (assetRatios.investment >= 20 && assetRatios.investment <= 50) score += 15;
    else if (assetRatios.investment >= 10) score += 8;
    // 예적금 비율 (40-50%가 이상적)
    if (assetRatios.savings >= 30 && assetRatios.savings <= 60) score += 10;
    else if (assetRatios.savings >= 20) score += 5;
    // 꾸준함 보너스 (3개월 이상 기록)
    if (assetHistory.length >= 3) score += 5;
    if (assetHistory.length >= 6) score += 5;
    score = Math.min(100, score);
    let grade, color;
    if (score >= 85) { grade = 'A'; color = Colors.income; }
    else if (score >= 70) { grade = 'B'; color = '#2980B9'; }
    else if (score >= 55) { grade = 'C'; color = '#E67E22'; }
    else { grade = 'D'; color = Colors.expense; }
    return { score, grade, color };
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

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>이번 달 잔액</Text>
          <Text style={[styles.balanceAmount, { color: (totalIncome - totalExpense) >= 0 ? Colors.income : Colors.expense }]}>
            {(totalIncome - totalExpense) >= 0 ? '+' : '-'}{formatMoney(totalIncome - totalExpense)}
          </Text>
        </View>

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

        {/* 도넛 차트 */}
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
            {expenseCatData.map(([cat, data]) => (
              <View key={cat} style={styles.catRow}>
                <View style={[styles.catDot, { backgroundColor: Colors.category[cat] || Colors.primary }]} />
                <Ionicons name={ALL_CATEGORY_ICONS[cat] || 'ellipsis-horizontal-outline'} size={16} color={Colors.category[cat] || Colors.primary} />
                <Text style={styles.catName}>{ALL_CATEGORY_NAMES[cat] || cat}</Text>
                <Text style={styles.catAmount}>{formatMoney(data.total)}</Text>
                <Text style={styles.catPct}>{Math.round((data.total / totalExpense) * 100)}%</Text>
              </View>
            ))}
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

        {/* 캘린더 */}
        <View style={styles.chartCard}>
          <Text style={styles.sectionTitle}>캘린더</Text>
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
                const ftInfo = FUND_TYPE_MAP[item.fundType] || FUND_TYPE_MAP['shared'];
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

        {/* 용돈 간략 현황 */}
        {myAllowance > 0 && (
          <View style={styles.chartCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="wallet" size={18} color={Colors.primary} />
                <Text style={styles.sectionTitle}>용돈 현황</Text>
              </View>
              <TouchableOpacity style={[styles.addBtnSmall, { backgroundColor: Colors.primary }]} onPress={() => setShowAddModal(true)}>
                <Ionicons name="add" size={16} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 11 }}>사용 추가</Text>
              </TouchableOpacity>
            </View>
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: Colors.textLight }}>{remainingPercent}% 남음</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="lock-closed" size={10} color={Colors.textLight} />
                <Text style={{ fontSize: 10, color: Colors.textLight }}>나만 보기</Text>
              </View>
            </View>
          </View>
        )}
        {!myAllowance && !myPendingRequest && (
          <View style={styles.chartCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Ionicons name="wallet-outline" size={18} color={Colors.textGray} />
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>용돈</Text>
            </View>
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <Text style={styles.emptyText}>용돈이 설정되지 않았어요</Text>
              <TouchableOpacity style={[styles.requestBtn, { backgroundColor: Colors.primary, marginTop: 10 }]} onPress={() => setShowRequestModal(true)}>
                <Ionicons name="hand-right-outline" size={14} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12, marginLeft: 6 }}>용돈 요청하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {!myAllowance && myPendingRequest && (
          <View style={styles.chartCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Ionicons name="wallet-outline" size={18} color={Colors.textGray} />
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>용돈</Text>
            </View>
            <View style={[styles.pendingBadge, { backgroundColor: '#FFD93D20', alignSelf: 'center' }]}>
              <Ionicons name="time-outline" size={16} color="#E6A800" />
              <Text style={{ color: '#E6A800', fontWeight: '600', marginLeft: 6 }}>요청 대기 중 ({parseInt(myPendingRequest.amount).toLocaleString()}원)</Text>
            </View>
          </View>
        )}

        {/* 관리자: 용돈 요청 */}
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
  // 렌더링 - 자산 탭
  // ═══════════════════════════════════
  const renderAsset = () => {
    const advices = getAssetAdvice();
    const insights = getInvestmentInsight();
    const recommendations = getInvestmentRecommendations();
    const health = getAssetHealthScore();
    const adviceIcons = { warning: 'warning-outline', info: 'information-circle-outline', tip: 'bulb-outline', success: 'checkmark-circle-outline' };
    const adviceColors = { warning: Colors.expense, info: '#2980B9', tip: '#E67E22', success: Colors.income };
    return (
      <>
        {/* 자산 건강도 + 총액 */}
        <View style={styles.chartCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={styles.sectionTitle}>누적 자산 현황</Text>
              <Text style={[styles.totalAssetAmount, { color: Colors.primary, textAlign: 'left', marginTop: 0 }]}>{formatMoney(totalAsset)}</Text>
            </View>
            {totalAsset > 0 && (
              <View style={[styles.healthBadge, { backgroundColor: health.color + '15', borderColor: health.color + '30' }]}>
                <Text style={[styles.healthGrade, { color: health.color }]}>{health.grade}</Text>
                <Text style={[styles.healthScore, { color: health.color }]}>{health.score}점</Text>
              </View>
            )}
          </View>

          {totalAsset > 0 && (
            <>
              <View style={[styles.assetBarRow, { marginTop: 16 }]}>
                {ASSET_FUND_TYPES.map((ft) => {
                  const amt = accumulatedFunds?.[ft] || 0;
                  const pct = totalAsset > 0 ? Math.max(Math.round((amt / totalAsset) * 100), 0) : 0;
                  if (pct === 0) return null;
                  const info = FUND_TYPE_MAP[ft];
                  return <View key={ft} style={[styles.assetBar, { flex: pct, backgroundColor: info.color }]}>{pct >= 15 && <Text style={styles.assetBarText}>{info.name} {pct}%</Text>}</View>;
                })}
              </View>

              {ASSET_FUND_TYPES.map((ft) => {
                const amt = accumulatedFunds?.[ft] || 0;
                const goal = fundGoals[ft] || 0;
                const info = FUND_TYPE_MAP[ft];
                const pct = goal > 0 ? Math.min(Math.round((amt / goal) * 100), 100) : 0;
                return (
                  <View key={ft} style={styles.assetItem}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[styles.assetIcon, { backgroundColor: info.color + '15' }]}>
                        <Ionicons name={info.icon} size={18} color={info.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.assetItemName}>{info.name}</Text>
                        <Text style={{ fontSize: 12, color: Colors.textGray }}>
                          {formatMoney(amt)}{goal > 0 ? ` / ${formatMoney(goal)}` : ''}
                        </Text>
                      </View>
                      <Text style={[styles.assetPct, { color: goal > 0 && pct >= 100 ? Colors.income : info.color }]}>
                        {assetRatios[ft]}%
                      </Text>
                    </View>
                    {goal > 0 && (
                      <View style={styles.assetGoalBar}>
                        <View style={[styles.assetGoalBarFill, { width: `${pct}%`, backgroundColor: pct >= 100 ? Colors.income : info.color }]} />
                      </View>
                    )}
                  </View>
                );
              })}

              {/* 현재 vs 추천 비율 비교 */}
              <View style={[styles.ratioCompareBox, { backgroundColor: Colors.background }]}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textBlack, marginBottom: 10 }}>내 배분 vs 추천 배분</Text>
                {[
                  { ft: 'savings', name: '예적금', recommended: '40-50%' },
                  { ft: 'investment', name: '투자', recommended: '30-40%' },
                  { ft: 'emergency', name: '비상금', recommended: '10-20%' },
                ].map((item) => {
                  const myPct = assetRatios[item.ft];
                  const info = FUND_TYPE_MAP[item.ft];
                  return (
                    <View key={item.ft} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={[styles.assetLegendDot, { backgroundColor: info.color }]} />
                          <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.textBlack }}>{item.name}</Text>
                        </View>
                        <Text style={{ fontSize: 12, color: Colors.textGray }}>
                          <Text style={{ fontWeight: '700', color: info.color }}>{myPct}%</Text> / {item.recommended}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden' }}>
                        <View style={{ width: `${Math.min(myPct, 100)}%`, backgroundColor: info.color, borderRadius: 3 }} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {totalAsset === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Ionicons name="pie-chart-outline" size={40} color={Colors.textLight} />
              <Text style={[styles.emptyText, { marginTop: 8 }]}>아직 자산 기록이 없어요</Text>
              <Text style={{ fontSize: 12, color: Colors.textLight, marginTop: 4 }}>지출 추가 시 예적금/투자/비상금으로 분류해보세요</Text>
            </View>
          )}
        </View>

        {/* 월별 자산 추이 */}
        {assetHistory.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>월별 자산 투입 추이</Text>
            {assetHistory.slice(-6).map(([ym, data]) => {
              const total = data.savings + data.investment + data.emergency;
              return (
                <View key={ym} style={styles.assetHistoryRow}>
                  <Text style={styles.assetHistoryMonth}>{ym.split('-')[1]}월</Text>
                  <View style={styles.assetHistoryBarBg}>
                    {ASSET_FUND_TYPES.map((ft) => {
                      const amt = data[ft] || 0;
                      const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
                      if (pct === 0) return null;
                      return <View key={ft} style={[styles.assetHistoryBar, { flex: pct, backgroundColor: FUND_TYPE_MAP[ft].color }]} />;
                    })}
                  </View>
                  <Text style={styles.assetHistoryAmt}>{formatMoneyShort(total)}</Text>
                </View>
              );
            })}
            <View style={styles.assetLegendRow}>
              {ASSET_FUND_TYPES.map((ft) => (
                <View key={ft} style={styles.assetLegendItem}>
                  <View style={[styles.assetLegendDot, { backgroundColor: FUND_TYPE_MAP[ft].color }]} />
                  <Text style={styles.assetLegendText}>{FUND_TYPE_MAP[ft].name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 자산 분배 진단 */}
        <View style={[styles.chartCard, { backgroundColor: Colors.primary + '06' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Ionicons name="analytics-outline" size={22} color={Colors.primary} />
            <Text style={styles.sectionTitle}>자산 분배 진단</Text>
          </View>
          {Array.isArray(advices) ? advices.map((adv, i) => (
            <View key={i} style={[styles.adviceItem, { backgroundColor: (adviceColors[adv.type] || Colors.primary) + '08', borderLeftColor: adviceColors[adv.type] || Colors.primary }]}>
              <Ionicons name={adviceIcons[adv.type] || 'bulb-outline'} size={18} color={adviceColors[adv.type] || Colors.primary} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 13, color: Colors.textDark, lineHeight: 20, marginLeft: 8 }}>{adv.text}</Text>
            </View>
          )) : (
            <Text style={{ fontSize: 14, color: Colors.textDark, lineHeight: 22 }}>{advices.desc}</Text>
          )}
        </View>

        {/* 인사이트 & 목표 예측 */}
        {totalAsset > 0 && (
          <View style={styles.chartCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Ionicons name="bulb" size={22} color="#FFD93D" />
              <Text style={styles.sectionTitle}>인사이트</Text>
            </View>
            {insights.map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 10 }}>
                <Ionicons name={item.icon} size={18} color={Colors.primary} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 14, color: Colors.textDark, lineHeight: 22 }}>{item.text}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 투자처 추천 */}
        <View style={styles.chartCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Ionicons name="compass" size={22} color={Colors.primary} />
            <Text style={styles.sectionTitle}>투자처 추천</Text>
          </View>
          {recommendations.map((rec, i) => (
            <View key={i} style={[styles.recCard, { borderColor: rec.color + '30' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <View style={[styles.recIcon, { backgroundColor: rec.color + '15' }]}>
                  <Ionicons name={rec.icon} size={20} color={rec.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.textBlack }}>{rec.title}</Text>
                  <Text style={{ fontSize: 12, color: Colors.textGray, marginTop: 2 }}>{rec.desc}</Text>
                </View>
              </View>
              <View style={{ gap: 6, marginLeft: 2 }}>
                {rec.products.map((product, j) => (
                  <View key={j} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: rec.color }} />
                    <Text style={{ fontSize: 13, color: Colors.textDark }}>{product}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        {/* 추천 자산 배분 가이드 */}
        {totalAsset > 0 && (
          <View style={[styles.chartCard, { backgroundColor: Colors.income + '06' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Ionicons name="school" size={22} color={Colors.income} />
              <Text style={styles.sectionTitle}>자산 배분 가이드</Text>
            </View>
            {[
              { name: '예적금', pct: '40-50%', desc: '안정적 수익, 비상 시 유동성 확보. 정기적금과 자유적금을 병행하세요.', color: FUND_TYPE_MAP.savings.color, icon: FUND_TYPE_MAP.savings.icon },
              { name: '투자', pct: '30-40%', desc: 'ETF 중심 분산투자 추천. 국내+해외 비율을 3:7로 시작해보세요.', color: FUND_TYPE_MAP.investment.color, icon: FUND_TYPE_MAP.investment.icon },
              { name: '비상금', pct: '10-20%', desc: '월 생활비 3-6개월분 확보. CMA나 파킹통장에 보관하세요.', color: FUND_TYPE_MAP.emergency.color, icon: FUND_TYPE_MAP.emergency.icon },
            ].map((item) => (
              <View key={item.name} style={[styles.guideItem, { borderLeftColor: item.color }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name={item.icon} size={16} color={item.color} />
                    <Text style={{ fontWeight: '700', fontSize: 14, color: Colors.textBlack }}>{item.name}</Text>
                  </View>
                  <Text style={{ fontWeight: '800', fontSize: 14, color: item.color }}>{item.pct}</Text>
                </View>
                <Text style={{ fontSize: 12, color: Colors.textGray, lineHeight: 18 }}>{item.desc}</Text>
              </View>
            ))}
          </View>
        )}
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
              { id: 'asset', icon: 'trending-up', label: '자산' },
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
          {tab === 'asset' && renderAsset()}
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
  // 자산
  totalAssetAmount: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginTop: -6, marginBottom: 4 },
  assetBarRow: { flexDirection: 'row', height: 24, borderRadius: 12, overflow: 'hidden', gap: 2, marginBottom: 16 },
  assetBar: { justifyContent: 'center', alignItems: 'center' },
  assetBarText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  assetItem: { marginBottom: 14 },
  assetIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  assetItemName: { fontSize: 15, fontWeight: '600', color: Colors.textBlack },
  assetPct: { fontSize: 16, fontWeight: '800' },
  assetGoalBar: { height: 6, backgroundColor: Colors.background, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  assetGoalBarFill: { height: 6, borderRadius: 3 },
  assetHistoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  assetHistoryMonth: { width: 30, fontSize: 12, fontWeight: '600', color: Colors.textGray },
  assetHistoryBarBg: { flex: 1, flexDirection: 'row', height: 18, borderRadius: 9, overflow: 'hidden', backgroundColor: Colors.background, gap: 1 },
  assetHistoryBar: { height: 18 },
  assetHistoryAmt: { width: 50, fontSize: 11, fontWeight: '600', color: Colors.textGray, textAlign: 'right' },
  assetLegendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 10 },
  assetLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  assetLegendDot: { width: 8, height: 8, borderRadius: 4 },
  assetLegendText: { fontSize: 11, color: Colors.textGray },
  recommendBox: { borderRadius: 14, padding: 16, marginTop: 14 },
  ratioCompareBox: { borderRadius: 14, padding: 16, marginTop: 12 },
  healthBadge: { alignItems: 'center', justifyContent: 'center', width: 60, height: 60, borderRadius: 16, borderWidth: 1.5 },
  healthGrade: { fontSize: 22, fontWeight: '900' },
  healthScore: { fontSize: 10, fontWeight: '600', marginTop: -2 },
  adviceItem: { flexDirection: 'row', alignItems: 'flex-start', borderLeftWidth: 3, borderRadius: 10, padding: 12, marginBottom: 8 },
  recCard: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 10 },
  recIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  guideItem: { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 8, marginBottom: 10 },
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
