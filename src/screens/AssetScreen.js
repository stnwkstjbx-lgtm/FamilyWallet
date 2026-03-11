import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../constants/ThemeContext';
import { useWallet } from '../constants/WalletContext';
import { FUND_TYPE_MAP, ASSET_FUND_TYPES } from '../constants/categories';
import { db } from '../firebase/firebaseConfig';
import { collection, onSnapshot, query } from 'firebase/firestore';

export default function AssetScreen() {
  const { colors: Colors } = useTheme();
  const { currentWalletId, currentWallet, accumulatedFunds } = useWallet();
  const styles = getStyles(Colors);

  const [allTransactions, setAllTransactions] = useState([]);

  useEffect(() => {
    if (!currentWalletId) return;
    const unsub = onSnapshot(query(collection(db, 'wallets', currentWalletId, 'transactions')), (snap) => {
      setAllTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [currentWalletId]);

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

  // 자산 건강도 점수
  const healthScore = useMemo(() => {
    if (totalAsset === 0) return { score: 0, grade: '-', color: Colors.textLight };
    let score = 50;
    if (assetRatios.emergency >= 10 && assetRatios.emergency <= 20) score += 15;
    else if (assetRatios.emergency >= 5) score += 8;
    if (assetRatios.investment >= 20 && assetRatios.investment <= 50) score += 15;
    else if (assetRatios.investment >= 10) score += 8;
    if (assetRatios.savings >= 30 && assetRatios.savings <= 60) score += 10;
    else if (assetRatios.savings >= 20) score += 5;
    if (assetHistory.length >= 3) score += 5;
    if (assetHistory.length >= 6) score += 5;
    score = Math.min(100, score);
    let grade, color;
    if (score >= 85) { grade = 'A'; color = Colors.income; }
    else if (score >= 70) { grade = 'B'; color = '#2980B9'; }
    else if (score >= 55) { grade = 'C'; color = '#E67E22'; }
    else { grade = 'D'; color = Colors.expense; }
    return { score, grade, color };
  }, [totalAsset, assetRatios, assetHistory.length, Colors]);

  // 자산 분배 진단
  const advices = useMemo(() => {
    if (totalAsset === 0) return [{ type: 'info', text: '예적금, 투자, 비상금으로 자산을 분류하여 기록하면 맞춤 분석을 제공합니다.' }];
    const list = [];
    if (assetRatios.emergency < 10) list.push({ type: 'warning', text: `비상금이 ${assetRatios.emergency}%로 부족합니다. 최소 10-20% (${formatMoney(Math.round(totalAsset * 0.15) - (accumulatedFunds?.emergency || 0))} 추가 필요)를 비상금으로 확보하세요.` });
    else if (assetRatios.emergency > 30) list.push({ type: 'info', text: `비상금 비율이 ${assetRatios.emergency}%로 높아요. 초과분은 예적금이나 투자로 이동시키면 더 나은 수익을 기대할 수 있습니다.` });
    if (assetRatios.investment > 70) list.push({ type: 'warning', text: `투자 비중이 ${assetRatios.investment}%로 높아요. 시장 변동 리스크가 큽니다. 예적금과 비상금 비율을 높여 안정성을 확보하세요.` });
    else if (assetRatios.investment === 0 && totalAsset >= 500000) list.push({ type: 'tip', text: '투자를 시작하지 않았어요. 자산의 30% 정도를 ETF나 적립식 펀드로 시작해보는 것을 추천합니다.' });
    else if (assetRatios.investment > 0 && assetRatios.investment < 20 && totalAsset >= 1000000) list.push({ type: 'tip', text: `투자 비율이 ${assetRatios.investment}%로 보수적입니다. 장기적으로 30-40%까지 늘리면 자산 증식에 유리합니다.` });
    if (assetRatios.savings > 80) list.push({ type: 'info', text: `예적금 비중이 ${assetRatios.savings}%로 매우 높아요. 안전하지만 물가 상승률을 고려하면 일부를 투자로 전환하는 것이 좋습니다.` });
    if (list.length === 0) list.push({ type: 'success', text: '자산 배분이 균형 잡혀 있어요! 현재 비율을 꾸준히 유지하세요.' });
    return list;
  }, [totalAsset, assetRatios, accumulatedFunds]);

  // 인사이트
  const insights = useMemo(() => {
    const monthlyAvg = assetHistory.length > 0
      ? Math.round(assetHistory.reduce((s, [, d]) => s + d.savings + d.investment + d.emergency, 0) / assetHistory.length) : 0;
    const list = [];
    if (monthlyAvg > 0) list.push({ icon: 'calculator-outline', text: `월 평균 ${formatMoney(monthlyAvg)}을 자산에 투입하고 있어요.` });
    if (assetHistory.length >= 3) {
      const recent3 = assetHistory.slice(-3);
      const recent3Avg = Math.round(recent3.reduce((s, [, d]) => s + d.savings + d.investment + d.emergency, 0) / 3);
      if (recent3Avg > monthlyAvg) list.push({ icon: 'arrow-up-circle-outline', text: '최근 3개월 투입 금액이 증가 추세입니다.' });
      else if (recent3Avg < monthlyAvg * 0.7) list.push({ icon: 'arrow-down-circle-outline', text: '최근 3개월 투입 금액이 감소했어요. 자산 증식 속도가 느려지고 있습니다.' });
    }
    ASSET_FUND_TYPES.forEach((ft) => {
      const goal = fundGoals[ft] || 0;
      const current = accumulatedFunds?.[ft] || 0;
      if (goal > 0 && current < goal) {
        const recentContribs = assetHistory.slice(-6).map(([, d]) => d[ft] || 0);
        const avgContrib = recentContribs.length > 0 ? recentContribs.reduce((s, v) => s + v, 0) / recentContribs.length : 0;
        if (avgContrib > 0) {
          const monthsLeft = Math.ceil((goal - current) / avgContrib);
          list.push({ icon: 'flag-outline', text: `${FUND_TYPE_MAP[ft].name} 목표까지 약 ${monthsLeft}개월 (월 ${formatMoney(Math.round(avgContrib))} 투입 기준)` });
        }
      }
    });
    if (list.length === 0) list.push({ icon: 'time-outline', text: '자산 데이터가 쌓이면 더 정확한 인사이트를 제공합니다.' });
    return list;
  }, [assetHistory, fundGoals, accumulatedFunds]);

  // 투자처 추천
  const recommendations = useMemo(() => {
    const list = [];
    const investAmt = accumulatedFunds?.investment || 0;
    if (totalAsset < 1000000) list.push({ title: '비상금 우선 확보', icon: 'shield-checkmark', color: FUND_TYPE_MAP.emergency.color, desc: '월 생활비의 3개월분을 비상금으로 먼저 모으세요.', products: ['CMA 통장 (수시입출금+이자)', '파킹통장 (높은 이율)', '자유적금'] });
    if (totalAsset >= 500000) list.push({ title: '안정형 저축', icon: 'wallet', color: FUND_TYPE_MAP.savings.color, desc: '원금 보장으로 안정적인 수익을 추구합니다.', products: ['정기적금 (연 3-4%)', '청년우대적금 (정부지원)', '주택청약종합저축'] });
    if (totalAsset >= 1000000) list.push({ title: '분산 투자 시작', icon: 'pie-chart', color: FUND_TYPE_MAP.investment.color, desc: '소액부터 다양한 자산에 분산하여 리스크를 줄입니다.', products: ['국내 ETF (KODEX 200 등)', '해외 ETF (S&P500, 나스닥)', '적립식 펀드'] });
    if (totalAsset >= 3000000 && investAmt > 0) list.push({ title: '성장형 투자', icon: 'rocket', color: '#E74C3C', desc: '장기 투자로 높은 수익률을 목표로 합니다.', products: ['글로벌 ETF 포트폴리오', '테마형 ETF (AI, 반도체 등)', 'ISA 계좌 활용 (세제 혜택)'] });
    if (list.length === 0) list.push({ title: '자산 관리 시작하기', icon: 'bulb', color: Colors.primary, desc: '먼저 자산을 기록하고 현황을 파악해보세요.', products: ['지출 시 예적금/투자/비상금으로 분류', '월 저축 목표 설정', '자동이체로 강제 저축'] });
    return list;
  }, [totalAsset, accumulatedFunds, Colors]);

  const adviceIcons = { warning: 'warning-outline', info: 'information-circle-outline', tip: 'bulb-outline', success: 'checkmark-circle-outline' };
  const adviceColors = { warning: Colors.expense, info: '#2980B9', tip: '#E67E22', success: Colors.income };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[Colors.gradientStart, Colors.gradientMiddle, Colors.gradientEnd]} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.headerTitle}>자산</Text>
          <Text style={styles.headerSubtitle}>{currentWallet?.name || '가계부'}</Text>

          <View style={styles.headerSummary}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerSummaryLabel}>총 자산</Text>
              <Text style={styles.headerSummaryValue}>{formatMoney(totalAsset)}</Text>
            </View>
            {totalAsset > 0 && (
              <View style={[styles.headerBadge, { backgroundColor: healthScore.color + '30' }]}>
                <Text style={[styles.headerBadgeGrade, { color: '#FFF' }]}>{healthScore.grade}</Text>
                <Text style={[styles.headerBadgeScore, { color: 'rgba(255,255,255,0.8)' }]}>{healthScore.score}점</Text>
              </View>
            )}
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {/* 자산 현황 */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>자산 구성</Text>
            {totalAsset > 0 ? (
              <>
                <View style={styles.assetBarRow}>
                  {ASSET_FUND_TYPES.map((ft) => {
                    const amt = accumulatedFunds?.[ft] || 0;
                    const pct = Math.max(Math.round((amt / totalAsset) * 100), 0);
                    if (pct === 0) return null;
                    const info = FUND_TYPE_MAP[ft];
                    return <View key={ft} style={[styles.assetBar, { flex: pct, backgroundColor: info.color }]}>{pct >= 15 && <Text style={styles.assetBarText}>{info.name} {pct}%</Text>}</View>;
                  })}
                </View>
                {ASSET_FUND_TYPES.map((ft) => {
                  const amt = accumulatedFunds?.[ft] || 0;
                  const goal = fundGoals[ft] || 0;
                  const info = FUND_TYPE_MAP[ft];
                  const goalPct = goal > 0 ? Math.min(Math.round((amt / goal) * 100), 100) : 0;
                  return (
                    <View key={ft} style={styles.assetItem}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={[styles.assetIcon, { backgroundColor: info.color + '15' }]}>
                          <Ionicons name={info.icon} size={18} color={info.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.assetItemName}>{info.name}</Text>
                          <Text style={{ fontSize: 12, color: Colors.textGray }}>{formatMoney(amt)}{goal > 0 ? ` / ${formatMoney(goal)}` : ''}</Text>
                        </View>
                        <Text style={[styles.assetPct, { color: goal > 0 && goalPct >= 100 ? Colors.income : info.color }]}>{assetRatios[ft]}%</Text>
                      </View>
                      {goal > 0 && (
                        <View style={styles.goalBar}><View style={[styles.goalBarFill, { width: `${goalPct}%`, backgroundColor: goalPct >= 100 ? Colors.income : info.color }]} /></View>
                      )}
                    </View>
                  );
                })}

                {/* 내 배분 vs 추천 */}
                <View style={[styles.compareBox, { backgroundColor: Colors.background }]}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textBlack, marginBottom: 10 }}>내 배분 vs 추천 배분</Text>
                  {[
                    { ft: 'savings', name: '예적금', rec: '40-50%' },
                    { ft: 'investment', name: '투자', rec: '30-40%' },
                    { ft: 'emergency', name: '비상금', rec: '10-20%' },
                  ].map((item) => {
                    const myPct = assetRatios[item.ft];
                    const info = FUND_TYPE_MAP[item.ft];
                    return (
                      <View key={item.ft} style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={[styles.legendDot, { backgroundColor: info.color }]} />
                            <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.textBlack }}>{item.name}</Text>
                          </View>
                          <Text style={{ fontSize: 12, color: Colors.textGray }}><Text style={{ fontWeight: '700', color: info.color }}>{myPct}%</Text> / {item.rec}</Text>
                        </View>
                        <View style={{ height: 6, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden' }}>
                          <View style={{ width: `${Math.min(myPct, 100)}%`, height: 6, backgroundColor: info.color, borderRadius: 3 }} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Ionicons name="pie-chart-outline" size={40} color={Colors.textLight} />
                <Text style={[styles.emptyText, { marginTop: 8 }]}>아직 자산 기록이 없어요</Text>
                <Text style={{ fontSize: 12, color: Colors.textLight, marginTop: 4 }}>지출 추가 시 예적금/투자/비상금으로 분류해보세요</Text>
              </View>
            )}
          </View>

          {/* 월별 추이 */}
          {assetHistory.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>월별 자산 투입 추이</Text>
              {assetHistory.slice(-6).map(([ym, data]) => {
                const total = data.savings + data.investment + data.emergency;
                return (
                  <View key={ym} style={styles.historyRow}>
                    <Text style={styles.historyMonth}>{ym.split('-')[1]}월</Text>
                    <View style={styles.historyBarBg}>
                      {ASSET_FUND_TYPES.map((ft) => {
                        const amt = data[ft] || 0;
                        const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
                        if (pct === 0) return null;
                        return <View key={ft} style={[styles.historyBar, { flex: pct, backgroundColor: FUND_TYPE_MAP[ft].color }]} />;
                      })}
                    </View>
                    <Text style={styles.historyAmt}>{formatMoneyShort(total)}</Text>
                  </View>
                );
              })}
              <View style={styles.legendRow}>
                {ASSET_FUND_TYPES.map((ft) => (
                  <View key={ft} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: FUND_TYPE_MAP[ft].color }]} />
                    <Text style={styles.legendText}>{FUND_TYPE_MAP[ft].name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 자산 분배 진단 */}
          <View style={[styles.card, { backgroundColor: Colors.primary + '06' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Ionicons name="analytics-outline" size={22} color={Colors.primary} />
              <Text style={styles.sectionTitle}>자산 분배 진단</Text>
            </View>
            {advices.map((adv, i) => (
              <View key={i} style={[styles.adviceItem, { backgroundColor: (adviceColors[adv.type] || Colors.primary) + '08', borderLeftColor: adviceColors[adv.type] || Colors.primary }]}>
                <Ionicons name={adviceIcons[adv.type] || 'bulb-outline'} size={18} color={adviceColors[adv.type] || Colors.primary} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 13, color: Colors.textDark, lineHeight: 20, marginLeft: 8 }}>{adv.text}</Text>
              </View>
            ))}
          </View>

          {/* 인사이트 */}
          {totalAsset > 0 && (
            <View style={styles.card}>
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
          <View style={styles.card}>
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

          {/* 자산 배분 가이드 */}
          {totalAsset > 0 && (
            <View style={[styles.card, { backgroundColor: Colors.income + '06' }]}>
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
  headerSummary: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 14, padding: 16, marginTop: 16 },
  headerSummaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  headerSummaryValue: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginTop: 2 },
  headerBadge: { alignItems: 'center', justifyContent: 'center', width: 54, height: 54, borderRadius: 14 },
  headerBadgeGrade: { fontSize: 20, fontWeight: '900' },
  headerBadgeScore: { fontSize: 10, fontWeight: '600', marginTop: -2 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },
  card: { backgroundColor: Colors.surface, borderRadius: 18, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.textBlack, marginBottom: 14, letterSpacing: -0.3 },
  emptyText: { fontSize: 14, color: Colors.textGray, textAlign: 'center' },
  assetBarRow: { flexDirection: 'row', height: 24, borderRadius: 12, overflow: 'hidden', gap: 2, marginBottom: 16 },
  assetBar: { justifyContent: 'center', alignItems: 'center' },
  assetBarText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  assetItem: { marginBottom: 14 },
  assetIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  assetItemName: { fontSize: 15, fontWeight: '600', color: Colors.textBlack },
  assetPct: { fontSize: 16, fontWeight: '800' },
  goalBar: { height: 6, backgroundColor: Colors.background, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  goalBarFill: { height: 6, borderRadius: 3 },
  compareBox: { borderRadius: 14, padding: 16, marginTop: 12 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 11, color: Colors.textGray },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  historyMonth: { width: 30, fontSize: 12, fontWeight: '600', color: Colors.textGray },
  historyBarBg: { flex: 1, flexDirection: 'row', height: 18, borderRadius: 9, overflow: 'hidden', backgroundColor: Colors.background, gap: 1 },
  historyBar: { height: 18 },
  historyAmt: { width: 50, fontSize: 11, fontWeight: '600', color: Colors.textGray, textAlign: 'right' },
  adviceItem: { flexDirection: 'row', alignItems: 'flex-start', borderLeftWidth: 3, borderRadius: 10, padding: 12, marginBottom: 8 },
  recCard: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 10 },
  recIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  guideItem: { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 8, marginBottom: 10 },
});
