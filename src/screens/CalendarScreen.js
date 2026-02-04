import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useTheme } from '../constants/ThemeContext';
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
  const { currentWalletId, currentWallet } = useWallet();
  const styles = useMemo(() => getStyles(Colors), [Colors]);
  const [transactions, setTransactions] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    if (!currentWalletId) return;
    const unsub = onSnapshot(query(collection(db, 'wallets', currentWalletId, 'transactions')), (snapshot) => {
      setTransactions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [currentWalletId]);

  const calendarMarks = useMemo(() => {
    const markedDates = {};
    transactions.forEach((t) => {
      const dateKey = t.date.split('T')[0];
      if (!markedDates[dateKey]) markedDates[dateKey] = { income: 0, expense: 0 };
      if (t.type === 'income') markedDates[dateKey].income += t.amount;
      else markedDates[dateKey].expense += t.amount;
    });

    const marks = {};
    Object.entries(markedDates).forEach(([date, data]) => {
      const dots = [];
      if (data.income > 0) dots.push({ key: 'income', color: Colors.income });
      if (data.expense > 0) dots.push({ key: 'expense', color: Colors.expense });
      marks[date] = { dots, selected: selectedDate === date, selectedColor: Colors.primary + '25' };
    });
    if (selectedDate && !marks[selectedDate]) {
      marks[selectedDate] = { selected: true, selectedColor: Colors.primary + '25', dots: [] };
    }
    return marks;
  }, [transactions, selectedDate, Colors]);

  const selectedTx = useMemo(() =>
    selectedDate ? transactions.filter((t) => t.date.startsWith(selectedDate)) : [],
    [selectedDate, transactions]
  );
  const dayIncome = useMemo(() => selectedTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0), [selectedTx]);
  const dayExpense = useMemo(() => selectedTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0), [selectedTx]);
  const formatMoney = useCallback((n) => Math.abs(n).toLocaleString('ko-KR') + '원', []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[Colors.gradientStart, Colors.gradientMiddle, Colors.gradientEnd]} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.headerTitle}>캘린더</Text>
          <Text style={styles.headerSubtitle}>📒 {currentWallet?.name || '가계부'}</Text>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.calendarCard}>
            <Calendar
              markingType="multi-dot"
              markedDates={calendarMarks}
              onDayPress={useCallback((day) => setSelectedDate(day.dateString), [])}
              theme={{
                backgroundColor: Colors.surface, calendarBackground: Colors.surface,
                textSectionTitleColor: Colors.textGray,
                selectedDayBackgroundColor: Colors.primary, selectedDayTextColor: '#FFFFFF',
                todayTextColor: Colors.primary, dayTextColor: Colors.textBlack,
                textDisabledColor: Colors.textLight, arrowColor: Colors.primary,
                monthTextColor: Colors.textBlack,
                textDayFontWeight: '500', textMonthFontWeight: 'bold', textDayHeaderFontWeight: '600',
              }}
            />
          </View>

          {selectedDate && (
            <View style={styles.dayDetail}>
              <Text style={styles.dayTitle}>{selectedDate.replace(/-/g, '.')} 내역</Text>
              {selectedTx.length > 0 && (
                <View style={styles.daySummary}>
                  <View style={styles.daySummaryItem}>
                    <Ionicons name="arrow-down-circle" size={14} color={Colors.income} />
                    <Text style={[styles.daySummaryText, { color: Colors.income }]}>{formatMoney(dayIncome)}</Text>
                  </View>
                  <View style={styles.daySummaryItem}>
                    <Ionicons name="arrow-up-circle" size={14} color={Colors.expense} />
                    <Text style={[styles.daySummaryText, { color: Colors.expense }]}>{formatMoney(dayExpense)}</Text>
                  </View>
                </View>
              )}
              {selectedTx.length === 0 ? (
                <View style={styles.noDataBox}><Text style={styles.noDataText}>이 날의 기록이 없어요</Text></View>
              ) : (
                selectedTx.map((item) => {
                  const isPersonal = item.type === 'expense' && item.fundType === 'personal';
                  return (
                    <View key={item.id} style={styles.txItem}>
                      <View style={[styles.txIcon, { backgroundColor: (Colors.category[item.category] || Colors.primary) + '15' }]}>
                        <Ionicons name={ALL_CATEGORY_ICONS[item.category] || 'ellipsis-horizontal-outline'} size={18} color={Colors.category[item.category] || Colors.primary} />
                      </View>
                      <View style={styles.txInfo}>
                        <View style={styles.txTitleRow}>
                          <Text style={styles.txTitle}>{item.memo || ALL_CATEGORY_NAMES[item.category] || '기타'}</Text>
                          {item.type === 'expense' && (
                            <View style={[styles.fundTag, { backgroundColor: isPersonal ? Colors.income + '12' : Colors.primary + '10' }]}>
                              <Ionicons name={isPersonal ? 'person' : 'people'} size={9} color={isPersonal ? Colors.income : Colors.primary} />
                              <Text style={[styles.fundTagText, { color: isPersonal ? Colors.income : Colors.primary }]}>{isPersonal ? '용돈' : '공금'}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.txMember}>{item.member || '미지정'}</Text>
                      </View>
                      <Text style={[styles.txAmount, { color: item.type === 'income' ? Colors.income : Colors.expense }]}>
                        {item.type === 'income' ? '+' : '-'}{formatMoney(item.amount)}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: 60, paddingBottom: 30, paddingHorizontal: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 },
  calendarCard: { backgroundColor: Colors.surface, borderRadius: 18, padding: 10, marginBottom: 16, borderWidth: 1, borderColor: Colors.background, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  dayDetail: { backgroundColor: Colors.surface, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: Colors.background },
  dayTitle: { fontSize: 16, fontWeight: '800', color: Colors.textBlack, marginBottom: 12, letterSpacing: -0.3 },
  daySummary: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.background },
  daySummaryItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  daySummaryText: { fontSize: 15, fontWeight: '700' },
  noDataBox: { paddingVertical: 20 },
  noDataText: { fontSize: 14, color: Colors.textLight, textAlign: 'center' },
  txItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.background, gap: 10 },
  txIcon: { width: 38, height: 38, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  txInfo: { flex: 1 },
  txTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  txTitle: { fontSize: 14, fontWeight: '600', color: Colors.textBlack, flexShrink: 1 },
  fundTag: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  fundTagText: { fontSize: 9, fontWeight: '700' },
  txMember: { fontSize: 12, color: Colors.textGray, marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: '700' },
});