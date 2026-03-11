import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Circle } from 'react-native-svg';
import { useTheme } from '../constants/ThemeContext';
import { useWallet } from '../constants/WalletContext';
import { ALL_CATEGORY_NAMES, ALL_CATEGORY_ICONS, FUND_TYPES } from '../constants/categories';
import { db } from '../firebase/firebaseConfig';
import { collection, onSnapshot, query } from 'firebase/firestore';

export default function StatsScreen() {
  const { colors: Colors } = useTheme();
  const { currentWalletId, currentWallet } = useWallet();
  const styles = getStyles(Colors);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    if (!currentWalletId) return;
    const unsub = onSnapshot(query(collection(db, 'wallets', currentWalletId, 'transactions')), (snapshot) => {
      setTransactions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [currentWalletId]);

  const now = new Date();
  const monthly = transactions.filter((t) => {
    const d = new Date(t.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const totalIncome = monthly.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = monthly.filter((t) => t.type === 'expense' && t.fundType !== 'allowance_allocation').reduce((s, t) => s + t.amount, 0);

  // 6분류별 금액 집계
  const fundBreakdown = {};
  FUND_TYPES.forEach((ft) => { fundBreakdown[ft.id] = 0; });
  monthly.filter((t) => t.type === 'expense' && t.fundType !== 'allowance_allocation').forEach((t) => {
    const ft = t.fundType || 'shared';
    if (fundBreakdown[ft] !== undefined) fundBreakdown[ft] += t.amount;
  });

  const catData = {};
  monthly.filter((t) => t.type === 'expense' && t.fundType !== 'allowance_allocation').forEach((t) => {
    if (!catData[t.category]) catData[t.category] = { total: 0 };
    catData[t.category].total += t.amount;
  });
  const sortedCats = Object.entries(catData).sort((a, b) => b[1].total - a[1].total);

  const chartSize = 180;
  const strokeWidth = 28;
  const radius = (chartSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  const formatMoney = (n) => Math.abs(n).toLocaleString('ko-KR') + '원';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[Colors.gradientStart, Colors.gradientMiddle, Colors.gradientEnd]} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.headerTitle}>통계</Text>
          <Text style={styles.headerSubtitle}>📒 {currentWallet?.name || '가계부'} · {now.getMonth() + 1}월</Text>
        </LinearGradient>

        <View style={styles.content}>
          {/* 요약 */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { borderLeftColor: Colors.income }]}>
              <Text style={styles.summaryLabel}>수입</Text>
              <Text style={[styles.summaryAmount, { color: Colors.income }]}>{formatMoney(totalIncome)}</Text>
            </View>
            <View style={[styles.summaryCard, { borderLeftColor: Colors.expense }]}>
              <Text style={styles.summaryLabel}>지출</Text>
              <Text style={[styles.summaryAmount, { color: Colors.expense }]}>{formatMoney(totalExpense)}</Text>
            </View>
          </View>

          {/* 6분류 지출 출처 비율 */}
          {totalExpense > 0 && (
            <View style={styles.fundCard}>
              <Text style={styles.fundCardTitle}>💳 지출 출처 비율</Text>
              <View style={styles.fundBarRow}>
                {FUND_TYPES.map((ft) => {
                  const amt = fundBreakdown[ft.id] || 0;
                  const pct = totalExpense > 0 ? Math.round((amt / totalExpense) * 100) : 0;
                  if (pct === 0) return null;
                  return (
                    <View key={ft.id} style={[styles.fundBar, { flex: pct, backgroundColor: ft.color }]}>
                      {pct >= 15 && <Text style={styles.fundBarText}>{ft.name} {pct}%</Text>}
                    </View>
                  );
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

          {/* 도넛 차트 */}
          {sortedCats.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>지출 카테고리</Text>
              <View style={styles.chartCenter}>
                <Svg width={chartSize} height={chartSize}>
                  <G rotation="-90" origin={`${chartSize / 2}, ${chartSize / 2}`}>
                    {totalExpense > 0 && sortedCats.map(([cat, data]) => {
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
                <View style={styles.chartCenterText}>
                  <Text style={styles.chartCenterLabel}>총 지출</Text>
                  <Text style={styles.chartCenterAmount}>{formatMoney(totalExpense)}</Text>
                </View>
              </View>

              {sortedCats.map(([cat, data]) => (
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

          {sortedCats.length === 0 && (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconBox}><Ionicons name="bar-chart-outline" size={36} color={Colors.textLight} /></View>
              <Text style={styles.emptyText}>이번 달 지출 데이터가 없어요</Text>
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
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  summaryCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderLeftWidth: 4, borderWidth: 1, borderColor: Colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  summaryLabel: { fontSize: 13, color: Colors.textGray },
  summaryAmount: { fontSize: 19, fontWeight: '800', marginTop: 4 },
  // 공금/용돈 비율
  fundCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: Colors.border },
  fundCardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textBlack, marginBottom: 14 },
  fundBarRow: { flexDirection: 'row', height: 28, borderRadius: 14, overflow: 'hidden', marginBottom: 14, gap: 2 },
  fundBar: { justifyContent: 'center', alignItems: 'center' },
  fundBarText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  fundLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  fundLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fundLegendDot: { width: 8, height: 8, borderRadius: 4 },
  fundLegendLabel: { fontSize: 13, color: Colors.textGray },
  fundLegendValue: { fontSize: 13, fontWeight: '600', color: Colors.textDark },
  // 도넛
  chartCard: { backgroundColor: Colors.surface, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: Colors.border },
  chartTitle: { fontSize: 16, fontWeight: '800', color: Colors.textBlack, marginBottom: 16, letterSpacing: -0.3 },
  chartCenter: { alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  chartCenterText: { position: 'absolute', alignItems: 'center' },
  chartCenterLabel: { fontSize: 12, color: Colors.textGray },
  chartCenterAmount: { fontSize: 18, fontWeight: '800', color: Colors.textBlack },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 8 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catName: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textDark },
  catFundSplit: { flexDirection: 'row', gap: 2 },
  catFundDot: { width: 6, height: 6, borderRadius: 3 },
  catAmount: { fontSize: 14, fontWeight: '700', color: Colors.textBlack },
  catPct: { fontSize: 13, color: Colors.textGray, width: 40, textAlign: 'right' },
  emptyCard: { alignItems: 'center', paddingVertical: 50, backgroundColor: Colors.surface, borderRadius: 18, borderWidth: 1, borderColor: Colors.border },
  emptyIconBox: { width: 60, height: 60, borderRadius: 18, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  emptyText: { fontSize: 14, color: Colors.textGray },
});