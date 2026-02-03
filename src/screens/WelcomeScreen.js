import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../constants/ThemeContext';

export default function WelcomeScreen({ onNewUser, onExistingUser }) {
  const { colors: Colors } = useTheme();
  const styles = getStyles(Colors);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.gradientStart, Colors.gradientMiddle, Colors.gradientEnd]}
        style={styles.background}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        {/* 상단 장식 */}
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />
        <View style={styles.decorCircle3} />

        <View style={styles.content}>
          {/* 로고 */}
          <View style={styles.logoBox}>
            <Ionicons name="wallet" size={44} color={Colors.primary} />
          </View>

          <Text style={styles.title}>패밀리 월렛</Text>
          <Text style={styles.subtitle}>우리 가족의 똑똑한 가계부</Text>

          {/* 기능 미리보기 */}
          <View style={styles.featureRow}>
            <View style={styles.featureItem}>
              <View style={styles.featureIcon}><Ionicons name="people" size={18} color="#FFFFFF" /></View>
              <Text style={styles.featureText}>가족 공유</Text>
            </View>
            <View style={styles.featureItem}>
              <View style={styles.featureIcon}><Ionicons name="trending-up" size={18} color="#FFFFFF" /></View>
              <Text style={styles.featureText}>저축 분석</Text>
            </View>
            <View style={styles.featureItem}>
              <View style={styles.featureIcon}><Ionicons name="wallet" size={18} color="#FFFFFF" /></View>
              <Text style={styles.featureText}>용돈 관리</Text>
            </View>
          </View>

          {/* 버튼 영역 */}
          <View style={styles.buttonArea}>
            <TouchableOpacity style={styles.newUserBtn} onPress={onNewUser} activeOpacity={0.9}>
              <View style={styles.newUserInner}>
                <Ionicons name="sparkles" size={22} color={Colors.primary} />
                <View style={styles.newUserTextBox}>
                  <Text style={styles.newUserTitle}>처음이에요! ✨</Text>
                  <Text style={styles.newUserDesc}>사용법을 알려드릴게요</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.existingBtn} onPress={onExistingUser} activeOpacity={0.9}>
              <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />
              <Text style={styles.existingBtnText}>기존 사용자예요</Text>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const getStyles = (Colors) => StyleSheet.create({
  container: { flex: 1 },
  background: { flex: 1, justifyContent: 'center' },
  content: { alignItems: 'center', paddingHorizontal: 30 },
  // 장식
  decorCircle1: { position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.06)' },
  decorCircle2: { position: 'absolute', bottom: 100, left: -80, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.04)' },
  decorCircle3: { position: 'absolute', top: '30%', right: 30, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.05)' },
  // 로고
  logoBox: { width: 88, height: 88, borderRadius: 28, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 8 },
  title: { fontSize: 34, fontWeight: '900', color: '#FFFFFF', marginTop: 24, letterSpacing: -1 },
  subtitle: { fontSize: 16, color: 'rgba(255,255,255,0.75)', marginTop: 8, fontWeight: '500' },
  // 기능
  featureRow: { flexDirection: 'row', gap: 24, marginTop: 36, marginBottom: 50 },
  featureItem: { alignItems: 'center', gap: 8 },
  featureIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  featureText: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  // 버튼
  buttonArea: { width: '100%', gap: 14 },
  newUserBtn: { backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
  newUserInner: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 14 },
  newUserTextBox: { flex: 1 },
  newUserTitle: { fontSize: 17, fontWeight: '800', color: Colors.primary },
  newUserDesc: { fontSize: 13, color: Colors.textGray, marginTop: 2 },
  existingBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, paddingVertical: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  existingBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});