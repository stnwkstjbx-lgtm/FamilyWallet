import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
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

export default function CalendarScreen() {
  const { colors: Colors } = useTheme();
  const { user } = useAuth();
  const { currentWalletId, currentWallet } = useWallet();
  const styles = getStyles(Colors);
  const [allTransactions, setAllTransactions] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    if (!currentWalletId) return;
    const unsub = onSnapshot(query(collection(db, 'wallets', currentWalletId, 'transactions')), (snapshot) => {
      setAllTransactions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [currentWalletId]);

  // 다른 사람의 용돈 사용 내역 필터링 (userId 또는 memberId 확인)
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

  // 날짜별 수입/지출 합계
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

  // 월간 요약
  const monthlySummary = useMemo(() => {
    let income = 0, expense = 0;
    Object.entries(dateAggregates).forEach(([date, data]) => {
      if (date.startsWith(currentMonth)) {
        income += data.income;
        expense += data.expense;
      }
    });
    return { income, expense };
  }, [dateAggregates, currentMonth]);

  // 캘린더 마크
  const calendarMarks = useMemo(() => {
    const marks = {};
    Object.entries(dateAggregates).forEach(([date, data]) => {
      const dots = [];
      if (data.income > 0) dots.push({ key: 'income', color: Colors.income });
      if (data.expense > 0) dots.push({ key: 'expense', color: Colors.expense });
      marks[date] = {
        dots,
        selected: selectedDate === date,
        selectedColor: Colors.primary + '20',
        selectedTextColor: Colors.primary,
      };
    });
    if (selectedDate && !marks[selectedDate]) {
      marks[selectedDate] = {
        selected: true,
        selectedColor: Colors.primary + '20',
        selectedTextColor: Colors.primary,
        dots: [],
      };
    }
    return marks;
  }, [dateAggregates, selectedDate, Colors]);

  // 선택한 날짜의 트랜잭션
  const selectedTx = useMemo(() => {
    if (!selectedDate) return [];
    return transactions
      .filter((t) => (t.date || '').startsWith(selectedDate))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [transactions, selectedDate]);

  const dayData = dateAggregates[selectedDate] || { income: 0, expense: 0 };

  const formatMoney = (n) => {
    if (n == null) return '0원';
    return Math.abs(n).toLocaleString('ko-KR') + '원';
  };

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

  const formatDateLabel = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    return `${parseInt(m)}월 ${parseInt(d)}일 (${weekdays[date.getDay()]})`;
  };

  // 커스텀 데이 컴포넌트
  const renderDayComponent = ({ date, state, marking }) => {
    const dateKey = date.dateString;
    const data = dateAggregates[dateKey];
    const isSelected = selectedDate === dateKey;
    const isToday = dateKey === new Date().toISOString().slice(0, 10);
    const isDisabled = state === 'disabled';

    return (
      <TouchableOpacity
        style={[
          styles.dayContainer,
          isSelected && { backgroundColor: Colors.primary + '15', borderColor: Colors.primary + '40', borderWidth: 1 },
          isToday && !isSelected && { borderColor: Colors.primary + '30', borderWidth: 1 },
        ]}
        onPress={() => setSelectedDate(dateKey)}
        activeOpacity={0.7}
      >
        <Text style={[
          styles.dayText,
          isDisabled && { color: Colors.textLight },
          isToday && { color: Colors.primary, fontWeight: '800' },
          isSelected && { color: Colors.primary, fontWeight: '800' },
        ]}>
          {date.day}
        </Text>
        {data && !isDisabled && (
          <View style={styles.dayAmounts}>
            {data.income > 0 && (
              <Text style={styles.dayIncome} numberOfLines={1}>+{formatMoneyShort(data.income)}</Text>
            )}
            {data.expense > 0 && (
              <Text style={styles.dayExpense} numberOfLines={1}>-{formatMoneyShort(data.expense)}</Text>
            )}
          </View>
        )}
        {!data && !isDisabled && <View style={styles.dayAmountsPlaceholder} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[Colors.gradientStart, Colors.gradientMiddle, Colors.gradientEnd]} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.headerTitle}>캘린더</Text>
          <Text style={styles.headerSubtitle}>{currentWallet?.name || '가계부'}</Text>

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
          {/* 캘린더 */}
          <View style={styles.calendarCard}>
            <Calendar
              markingType="multi-dot"
              markedDates={calendarMarks}
              onDayPress={(day) => setSelectedDate(day.dateString)}
              onMonthChange={(month) => {
                setCurrentMonth(`${month.year}-${String(month.month).padStart(2, '0')}`);
              }}
              dayComponent={renderDayComponent}
              theme={{
                backgroundColor: Colors.surface,
                calendarBackground: Colors.surface,
                textSectionTitleColor: Colors.textGray,
                arrowColor: Colors.primary,
                monthTextColor: Colors.textBlack,
                textMonthFontWeight: '800',
                textMonthFontSize: 17,
                textDayHeaderFontWeight: '600',
                textDayHeaderFontSize: 13,
              }}
              style={{ borderRadius: 18 }}
            />
          </View>

          {/* 범례 */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.income }]} />
              <Text style={styles.legendText}>수입</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.expense }]} />
              <Text style={styles.legendText}>지출</Text>
            </View>
            <View style={styles.legendItem}>
              <Ionicons name="lock-closed" size={11} color={Colors.textLight} />
              <Text style={styles.legendText}>타인 용돈은 숨김</Text>
            </View>
          </View>

          {/* 선택된 날짜 상세 */}
          {selectedDate && (
            <View style={styles.dayDetail}>
              <View style={styles.dayDetailHeader}>
                <Text style={styles.dayDetailTitle}>{formatDateLabel(selectedDate)}</Text>
                {(dayData.income > 0 || dayData.expense > 0) && (
                  <Text style={[styles.dayDetailNet, {
                    color: (dayData.income - dayData.expense) >= 0 ? Colors.income : Colors.expense,
                  }]}>
                    {(dayData.income - dayData.expense) >= 0 ? '+' : '-'}{formatMoney(dayData.income - dayData.expense)}
                  </Text>
                )}
              </View>

              {(dayData.income > 0 || dayData.expense > 0) && (
                <View style={styles.daySummary}>
                  <View style={styles.daySummaryItem}>
                    <View style={[styles.daySummaryIcon, { backgroundColor: Colors.income + '18' }]}>
                      <Ionicons name="arrow-down-circle" size={16} color={Colors.income} />
                    </View>
                    <View>
                      <Text style={styles.daySummaryLabel}>수입</Text>
                      <Text style={[styles.daySummaryAmount, { color: Colors.income }]}>{formatMoney(dayData.income)}</Text>
                    </View>
                  </View>
                  <View style={styles.daySummaryItem}>
                    <View style={[styles.daySummaryIcon, { backgroundColor: Colors.expense + '18' }]}>
                      <Ionicons name="arrow-up-circle" size={16} color={Colors.expense} />
                    </View>
                    <View>
                      <Text style={styles.daySummaryLabel}>지출</Text>
                      <Text style={[styles.daySummaryAmount, { color: Colors.expense }]}>{formatMoney(dayData.expense)}</Text>
                    </View>
                  </View>
                </View>
              )}

              {selectedTx.length === 0 ? (
                <View style={styles.noDataBox}>
                  <Ionicons name="receipt-outline" size={36} color={Colors.textLight} />
                  <Text style={styles.noDataText}>이 날의 기록이 없어요</Text>
                </View>
              ) : (
                <View style={styles.txList}>
                  <Text style={styles.txListTitle}>상세 내역</Text>
                  {selectedTx.map((item, index) => {
                    const isPersonal = item.type === 'expense' && item.fundType === 'personal';
                    const catColor = Colors.category[item.category] || Colors.primary;
                    return (
                      <View key={item.id} style={[styles.txItem, index === selectedTx.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={[styles.txIcon, { backgroundColor: catColor + '15' }]}>
                          <Ionicons name={ALL_CATEGORY_ICONS[item.category] || 'ellipsis-horizontal-outline'} size={18} color={catColor} />
                        </View>
                        <View style={styles.txInfo}>
                          <View style={styles.txTitleRow}>
                            <Text style={styles.txTitle} numberOfLines={1}>{item.memo || ALL_CATEGORY_NAMES[item.category] || '기타'}</Text>
                            {item.type === 'expense' && (
                              <View style={[styles.fundTag, { backgroundColor: isPersonal ? Colors.income + '15' : Colors.primary + '12' }]}>
                                <Ionicons name={isPersonal ? 'person' : 'people'} size={9} color={isPersonal ? Colors.income : Colors.primary} />
                                <Text style={[styles.fundTagText, { color: isPersonal ? Colors.income : Colors.primary }]}>{isPersonal ? '용돈' : '공금'}</Text>
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
            <View style={styles.hintBox}>
              <Ionicons name="hand-left-outline" size={20} color={Colors.textLight} />
              <Text style={styles.hintText}>날짜를 눌러 상세 내역을 확인하세요</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 24, paddingHorizontal: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },

  // 월간 요약
  monthSummary: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 14, padding: 14, marginTop: 16 },
  monthSummaryItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  monthSummaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  monthSummaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  monthSummaryValue: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },

  // 캘린더
  calendarCard: { backgroundColor: Colors.surface, borderRadius: 18, padding: 6, marginBottom: 8, borderWidth: 1, borderColor: Colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },

  // 날짜 셀
  dayContainer: { alignItems: 'center', justifyContent: 'flex-start', width: 44, minHeight: 56, paddingTop: 4, paddingBottom: 2, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  dayText: { fontSize: 14, fontWeight: '500', color: Colors.textBlack },
  dayAmounts: { alignItems: 'center', marginTop: 2 },
  dayAmountsPlaceholder: { height: 20 },
  dayIncome: { fontSize: 8, fontWeight: '700', color: Colors.income, lineHeight: 11 },
  dayExpense: { fontSize: 8, fontWeight: '700', color: Colors.expense, lineHeight: 11 },

  // 범례
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingVertical: 8, marginBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: Colors.textGray },

  // 날짜 상세
  dayDetail: { backgroundColor: Colors.surface, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: Colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  dayDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  dayDetailTitle: { fontSize: 17, fontWeight: '800', color: Colors.textBlack, letterSpacing: -0.3 },
  dayDetailNet: { fontSize: 15, fontWeight: '700' },

  daySummary: { flexDirection: 'row', gap: 12, marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  daySummaryItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.background, borderRadius: 12, padding: 12 },
  daySummaryIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  daySummaryLabel: { fontSize: 11, color: Colors.textGray },
  daySummaryAmount: { fontSize: 16, fontWeight: '700', marginTop: 1 },

  noDataBox: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  noDataText: { fontSize: 14, color: Colors.textLight },

  // 트랜잭션 리스트
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

  // 힌트
  hintBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 24 },
  hintText: { fontSize: 14, color: Colors.textLight },
});
