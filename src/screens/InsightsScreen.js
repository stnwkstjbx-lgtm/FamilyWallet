import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Circle } from 'react-native-svg';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useTheme } from '../constants/ThemeContext';
import { useAuth } from '../constants/AuthContext';
import { useWallet } from '../constants/WalletContext';
import { ALL_CATEGORY_NAMES, ALL_CATEGORY_ICONS } from '../constants/categories';
import { db } from '../firebase/firebaseConfig';
import { collection, onSnapshot, query } from 'firebase/firestore';

LocaleConfig.locales['ko'] = {
  monthNames: ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
  monthNamesShort: ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
  dayNames: ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'],
  dayNamesShort: ['일','월','화','수','목','금','토'],
};
LocaleConfig.defaultLocale = 'ko';

export default function InsightsScreen() {
  const { colors: Colors } = useTheme();
  const { user } = useAuth();
  const { currentWalletId, currentWallet } = useWallet();
  const styles = getStyles(Colors);

  const [tab, setTab] = useState('stats'); // 'stats' | 'calendar'
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
        const txOwner = t.userId || t.memberId;
        if (txOwner !== user?.uid) return false;
      }
      if (t.fundType === 'allowance_allocation') return false;
      return true;
    });
  }, [allTransactions, user?.uid]);

  // 해당 월 거래
  const monthly = useMemo(() => {
    return transactions.filter((t) => (t.date || '').startsWith(yearMonth));
  }, [transactions, yearMonth]);

  // 이전 월
  const prevYm = useMemo(() => {
    const [y, m] = yearMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [yearMonth]);

  const prevMonthly = useMemo(() => {
    return transactions.filter((t) => (t.date || '').startsWith(prevYm));
  }, [transactions, prevYm]);

  const formatMoney = (n) => Math.abs(n || 0).toLocaleString('ko-KR') + '원';

  const formatMoneyShort = (n) => {
    const abs = Math.abs(n || 0);
    if (abs >= 10000) {
      const man = Math.floor(abs / 10000);
      const rest = abs % 10000;
      if (rest === 0) return `${man}만`;
      return `${man}.${Math.floor(rest / 1000)}만`;
    }
    return abs.toLocaleString('ko-KR');
  };

  // ═══════════════════════════════════
  // 통계 탭 데이터
  // ═══════════════════════════════════

  const totalIncome = monthly.filter((t) => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const totalExpense = monthly.filter((t) => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const sharedExpense = monthly.filter((t) => t.type === 'expense' && (t.fundType || 'shared') === 'shared').reduce((s, t) => s + (t.amount || 0), 0);
  const personalExpense = monthly.filter((t) => t.type === 'expense' && t.fundType === 'personal').reduce((s, t) => s + (t.amount || 0), 0);

  const prevTotalIncome = prevMonthly.filter((t) => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const prevTotalExpense = prevMonthly.filter((t) => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);

  const incomeChange = prevTotalIncome > 0 ? Math.round(((totalIncome - prevTotalIncome) / prevTotalIncome) * 100) : null;
  const expenseChange = prevTotalExpense > 0 ? Math.round(((totalExpense - prevTotalExpense) / prevTotalExpense) * 100) : null;

  // 지출 카테고리
  const expenseCatData = useMemo(() => {
    const catData = {};
    monthly.filter((t) => t.type === 'expense').forEach((t) => {
      if (!catData[t.category]) catData[t.category] = { total: 0, shared: 0, personal: 0 };
      catData[t.category].total += t.amount || 0;
      if (t.fundType === 'personal') catData[t.category].personal += t.amount || 0;
      else catData[t.category].shared += t.amount || 0;
    });
    return Object.entries(catData).sort((a, b) => b[1].total - a[1].total);
  }, [monthly]);

  // 수입 카테고리
  const incomeCatData = useMemo(() => {
    const catData = {};
    monthly.filter((t) => t.type === 'income').forEach((t) => {
      if (!catData[t.category]) catData[t.category] = 0;
      catData[t.category] += t.amount || 0;
    });
    return Object.entries(catData).sort((a, b) => b[1] - a[1]);
  }, [monthly]);

  // 일별 지출 추이 (바 차트)
  const dailyExpense = useMemo(() => {
    const days = {};
    monthly.filter((t) => t.type === 'expense').forEach((t) => {
      const day = parseInt((t.date || '').split('-')[2] || '0');
      if (day > 0) days[day] = (days[day] || 0) + (t.amount || 0);
    });
    return days;
  }, [monthly]);

  const maxDailyExpense = useMemo(() => {
    return Math.max(...Object.values(dailyExpense), 1);
  }, [dailyExpense]);

  const daysInMonth = useMemo(() => {
    const [y, m] = yearMonth.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }, [yearMonth]);

  // 도넛 차트
  const chartSize = 170;
  const strokeWidth = 26;
  const radius = (chartSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const sharedPct = totalExpense > 0 ? Math.round((sharedExpense / totalExpense) * 100) : 0;
  const personalPct = totalExpense > 0 ? Math.round((personalExpense / totalExpense) * 100) : 0;

  // ═══════════════════════════════════
  // 캘린더 탭 데이터
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
  // 렌더링
  // ═══════════════════════════════════

  const renderStats = () => {
    let accumulated = 0;
    return (
      <>
        {/* 수입/지출 요약 */}
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

        {/* 잔액 */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>이번 달 잔액</Text>
          <Text style={[styles.balanceAmount, { color: (totalIncome - totalExpense) >= 0 ? Colors.income : Colors.expense }]}>
            {(totalIncome - totalExpense) >= 0 ? '+' : '-'}{formatMoney(totalIncome - totalExpense)}
          </Text>
        </View>

        {/* 공금 vs 용돈 */}
        {totalExpense > 0 && (
          <View style={styles.fundCard}>
            <Text style={styles.sectionTitle}>지출 출처 비율</Text>
            <View style={styles.fundBarRow}>
              <View style={[styles.fundBar, { flex: sharedPct || 1, backgroundColor: Colors.primary }]}>
                {sharedPct >= 15 && <Text style={styles.fundBarText}>공금 {sharedPct}%</Text>}
              </View>
              <View style={[styles.fundBar, { flex: personalPct || 1, backgroundColor: Colors.personal }]}>
                {personalPct >= 15 && <Text style={styles.fundBarText}>용돈 {personalPct}%</Text>}
              </View>
            </View>
            <View style={styles.fundLegendRow}>
              <View style={styles.fundLegendItem}>
                <View style={[styles.fundLegendDot, { backgroundColor: Colors.primary }]} />
                <Ionicons name="people" size={12} color={Colors.primary} />
                <Text style={styles.fundLegendLabel}>공금</Text>
                <Text style={styles.fundLegendValue}>{formatMoney(sharedExpense)}</Text>
              </View>
              <View style={styles.fundLegendItem}>
                <View style={[styles.fundLegendDot, { backgroundColor: Colors.personal }]} />
                <Ionicons name="person" size={12} color={Colors.personal} />
                <Text style={styles.fundLegendLabel}>용돈</Text>
                <Text style={styles.fundLegendValue}>{formatMoney(personalExpense)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* 일별 지출 추이 */}
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

        {/* 지출 카테고리 도넛 */}
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
                    return (
                      <Circle key={cat} cx={chartSize / 2} cy={chartSize / 2} r={radius}
                        stroke={Colors.category[cat] || Colors.primary} strokeWidth={strokeWidth}
                        strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                        strokeDashoffset={-dashOffset} fill="none" strokeLinecap="round" />
                    );
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
                <View style={styles.catFundSplit}>
                  {data.shared > 0 && <View style={[styles.catFundDot, { backgroundColor: Colors.primary }]} />}
                  {data.personal > 0 && <View style={[styles.catFundDot, { backgroundColor: Colors.personal }]} />}
                </View>
                <Text style={styles.catAmount}>{formatMoney(data.total)}</Text>
                <Text style={styles.catPct}>{Math.round((data.total / totalExpense) * 100)}%</Text>
              </View>
            ))}
          </View>
        )}

        {/* 수입 카테고리 */}
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

  const renderCalendar = () => (
    <>
      <View style={styles.calendarCard}>
        <Calendar
          markingType="multi-dot" markedDates={calendarMarks}
          onDayPress={(day) => setSelectedDate(day.dateString)}
          onMonthChange={(month) => setYearMonth(`${month.year}-${String(month.month).padStart(2, '0')}`)}
          key={yearMonth}
          current={`${yearMonth}-01`}
          dayComponent={renderDayComponent}
          theme={{ backgroundColor: Colors.surface, calendarBackground: Colors.surface, textSectionTitleColor: Colors.textGray, arrowColor: Colors.primary, monthTextColor: Colors.textBlack, textMonthFontWeight: '800', textMonthFontSize: 17, textDayHeaderFontWeight: '600', textDayHeaderFontSize: 13 }}
          style={{ borderRadius: 18 }}
        />
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.income }]} /><Text style={styles.legendText}>수입</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.expense }]} /><Text style={styles.legendText}>지출</Text></View>
        <View style={styles.legendItem}><Ionicons name="lock-closed" size={11} color={Colors.textLight} /><Text style={styles.legendText}>타인 용돈은 숨김</Text></View>
      </View>

      {selectedDate && (
        <View style={styles.dayDetail}>
          <View style={styles.dayDetailHeader}>
            <Text style={styles.dayDetailTitle}>{formatDateLabel(selectedDate)}</Text>
            {(dayData.income > 0 || dayData.expense > 0) && (
              <Text style={[styles.dayDetailNet, { color: (dayData.income - dayData.expense) >= 0 ? Colors.income : Colors.expense }]}>
                {(dayData.income - dayData.expense) >= 0 ? '+' : '-'}{formatMoney(dayData.income - dayData.expense)}
              </Text>
            )}
          </View>
          {(dayData.income > 0 || dayData.expense > 0) && (
            <View style={styles.daySummary}>
              <View style={styles.daySummaryItem}>
                <View style={[styles.daySummaryIcon, { backgroundColor: Colors.income + '18' }]}><Ionicons name="arrow-down-circle" size={16} color={Colors.income} /></View>
                <View><Text style={styles.daySummaryLabel}>수입</Text><Text style={[styles.daySummaryAmountText, { color: Colors.income }]}>{formatMoney(dayData.income)}</Text></View>
              </View>
              <View style={styles.daySummaryItem}>
                <View style={[styles.daySummaryIcon, { backgroundColor: Colors.expense + '18' }]}><Ionicons name="arrow-up-circle" size={16} color={Colors.expense} /></View>
                <View><Text style={styles.daySummaryLabel}>지출</Text><Text style={[styles.daySummaryAmountText, { color: Colors.expense }]}>{formatMoney(dayData.expense)}</Text></View>
              </View>
            </View>
          )}
          {selectedTx.length === 0 ? (
            <View style={styles.noDataBox}><Ionicons name="receipt-outline" size={36} color={Colors.textLight} /><Text style={styles.noDataText}>이 날의 기록이 없어요</Text></View>
          ) : (
            <View style={styles.txList}>
              <Text style={styles.txListTitle}>상세 내역</Text>
              {selectedTx.map((item, index) => {
                const isPersonal = item.type === 'expense' && item.fundType === 'personal';
                const catColor = Colors.category[item.category] || Colors.primary;
                return (
                  <View key={item.id} style={[styles.txItem, index === selectedTx.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={[styles.txIcon, { backgroundColor: catColor + '15' }]}><Ionicons name={ALL_CATEGORY_ICONS[item.category] || 'ellipsis-horizontal-outline'} size={18} color={catColor} /></View>
                    <View style={styles.txInfo}>
                      <View style={styles.txTitleRow}>
                        <Text style={styles.txTitle} numberOfLines={1}>{item.memo || ALL_CATEGORY_NAMES[item.category] || '기타'}</Text>
                        {item.type === 'expense' && (
                          <View style={[styles.fundTag, { backgroundColor: isPersonal ? Colors.personal + '15' : Colors.primary + '12' }]}>
                            <Ionicons name={isPersonal ? 'person' : 'people'} size={9} color={isPersonal ? Colors.personal : Colors.primary} />
                            <Text style={[styles.fundTagText, { color: isPersonal ? Colors.personal : Colors.primary }]}>{isPersonal ? '용돈' : '공금'}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.txMember}>{item.member || item.memberName || '미지정'}</Text>
                    </View>
                    <Text style={[styles.txAmount, { color: item.type === 'income' ? Colors.income : Colors.expense }]}>
                      {item.type === 'income' ? '+' : '-'}{formatMoney(item.amount)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
      {!selectedDate && (
        <View style={styles.hintBox}><Ionicons name="hand-left-outline" size={20} color={Colors.textLight} /><Text style={styles.hintText}>날짜를 눌러 상세 내역을 확인하세요</Text></View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[Colors.gradientStart, Colors.gradientMiddle, Colors.gradientEnd]} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.headerTitle}>분석</Text>
          <Text style={styles.headerSubtitle}>{currentWallet?.name || '가계부'}</Text>

          {/* 세그먼트 토글 */}
          <View style={styles.segmentRow}>
            <TouchableOpacity style={[styles.segmentBtn, tab === 'stats' && styles.segmentBtnActive]} onPress={() => setTab('stats')}>
              <Ionicons name="pie-chart" size={15} color={tab === 'stats' ? Colors.primary : 'rgba(255,255,255,0.7)'} />
              <Text style={[styles.segmentText, tab === 'stats' && styles.segmentTextActive]}>통계</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.segmentBtn, tab === 'calendar' && styles.segmentBtnActive]} onPress={() => setTab('calendar')}>
              <Ionicons name="calendar" size={15} color={tab === 'calendar' ? Colors.primary : 'rgba(255,255,255,0.7)'} />
              <Text style={[styles.segmentText, tab === 'calendar' && styles.segmentTextActive]}>캘린더</Text>
            </TouchableOpacity>
          </View>

          {/* 월 네비게이션 */}
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthNavBtn}><Ionicons name="chevron-back" size={20} color="#FFFFFF" /></TouchableOpacity>
            <Text style={styles.monthNavText}>{ymLabel}</Text>
            <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthNavBtn}><Ionicons name="chevron-forward" size={20} color="#FFFFFF" /></TouchableOpacity>
          </View>

          {/* 월간 요약 */}
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
          {tab === 'stats' ? renderStats() : renderCalendar()}
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 20, paddingHorizontal: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },

  // 세그먼트
  segmentRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 3, marginTop: 16 },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  segmentBtnActive: { backgroundColor: '#FFFFFF' },
  segmentText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  segmentTextActive: { color: Colors.primary },

  // 월 네비
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 14 },
  monthNavBtn: { padding: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10 },
  monthNavText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },

  // 월간 요약
  monthSummary: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 14, padding: 14, marginTop: 12 },
  monthSummaryItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  monthSummaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  monthSummaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  monthSummaryValue: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },

  // ═══ 통계 탭 ═══
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  summaryCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderLeftWidth: 4, borderWidth: 1, borderColor: Colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
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
  fundLegendRow: { flexDirection: 'row', justifyContent: 'space-around' },
  fundLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fundLegendDot: { width: 8, height: 8, borderRadius: 4 },
  fundLegendLabel: { fontSize: 13, color: Colors.textGray },
  fundLegendValue: { fontSize: 13, fontWeight: '600', color: Colors.textDark },

  // 바 차트
  chartCard: { backgroundColor: Colors.surface, borderRadius: 18, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  barChartScroll: { marginBottom: 4 },
  barChartContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingBottom: 4, minHeight: 110 },
  barItem: { alignItems: 'center', width: 26 },
  barColumn: { alignItems: 'center', justifyContent: 'flex-end', height: 90 },
  bar: { width: 14, borderRadius: 4, minHeight: 0 },
  barValue: { fontSize: 7, color: Colors.textGray, marginBottom: 2, fontWeight: '600' },
  barLabel: { fontSize: 9, color: Colors.textLight, marginTop: 4 },

  // 도넛
  donutCenter: { alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  donutCenterText: { position: 'absolute', alignItems: 'center' },
  donutCenterLabel: { fontSize: 12, color: Colors.textGray },
  donutCenterAmount: { fontSize: 18, fontWeight: '800', color: Colors.textBlack },

  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 8 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catName: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textDark },
  catFundSplit: { flexDirection: 'row', gap: 2 },
  catFundDot: { width: 6, height: 6, borderRadius: 3 },
  catAmount: { fontSize: 14, fontWeight: '700', color: Colors.textBlack },
  catPct: { fontSize: 13, color: Colors.textGray, width: 40, textAlign: 'right' },

  emptyCard: { alignItems: 'center', paddingVertical: 50, backgroundColor: Colors.surface, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textGray },

  // ═══ 캘린더 탭 ═══
  calendarCard: { backgroundColor: Colors.surface, borderRadius: 18, padding: 6, marginBottom: 8, borderWidth: 1, borderColor: Colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  dayContainer: { alignItems: 'center', justifyContent: 'flex-start', width: 44, minHeight: 56, paddingTop: 4, paddingBottom: 2, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  dayText: { fontSize: 14, fontWeight: '500', color: Colors.textBlack },
  dayAmounts: { alignItems: 'center', marginTop: 2 },
  dayAmountsPlaceholder: { height: 20 },
  dayIncome: { fontSize: 8, fontWeight: '700', color: Colors.income, lineHeight: 11 },
  dayExpense: { fontSize: 8, fontWeight: '700', color: Colors.expense, lineHeight: 11 },

  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingVertical: 8, marginBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: Colors.textGray },

  dayDetail: { backgroundColor: Colors.surface, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: Colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  dayDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  dayDetailTitle: { fontSize: 17, fontWeight: '800', color: Colors.textBlack, letterSpacing: -0.3 },
  dayDetailNet: { fontSize: 15, fontWeight: '700' },

  daySummary: { flexDirection: 'row', gap: 12, marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  daySummaryItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.background, borderRadius: 12, padding: 12 },
  daySummaryIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  daySummaryLabel: { fontSize: 11, color: Colors.textGray },
  daySummaryAmountText: { fontSize: 16, fontWeight: '700', marginTop: 1 },

  noDataBox: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  noDataText: { fontSize: 14, color: Colors.textLight },

  txList: { marginTop: 2 },
  txListTitle: { fontSize: 14, fontWeight: '700', color: Colors.textGray, marginBottom: 10 },
  txItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 10 },
  txIcon: { width: 38, height: 38, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  txInfo: { flex: 1 },
  txTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  txTitle: { fontSize: 14, fontWeight: '600', color: Colors.textBlack, flexShrink: 1 },
  fundTag: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  fundTagText: { fontSize: 9, fontWeight: '700' },
  txMember: { fontSize: 12, color: Colors.textGray, marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: '700' },

  hintBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 24 },
  hintText: { fontSize: 14, color: Colors.textLight },
});
