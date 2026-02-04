import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../constants/ThemeContext';
import { useAuth } from '../constants/AuthContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const showAlert = (title, message) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

export default function LoginScreen({ initialMode }) {
  const { colors: Colors } = useTheme();
  const { register, login, loginWithGoogle, loginWithApple, resetPassword } = useAuth();
  const styles = getStyles(Colors);

  // initialMode가 'signup'이면 회원가입 탭으로 시작
  const [isLogin, setIsLogin] = useState(initialMode !== 'signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(null);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password.trim()) { setError('이메일과 비밀번호를 입력해 주세요.'); return; }
    if (!isLogin && !name.trim()) { setError('이름을 입력해 주세요.'); return; }

    setLoading(true);
    const result = isLogin
      ? await login(email.trim(), password)
      : await register(email.trim(), password, name.trim());
    setLoading(false);

    if (!result.success) setError(result.message);
  };

  const handleGoogle = async () => {
    setSocialLoading('google'); setError('');
    const result = await loginWithGoogle();
    setSocialLoading(null);
    if (!result.success && result.message) setError(result.message);
  };

  const handleApple = async () => {
    setSocialLoading('apple'); setError('');
    const result = await loginWithApple();
    setSocialLoading(null);
    if (!result.success && result.message) setError(result.message);
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      setError('비밀번호를 재설정할 이메일을 입력해 주세요.');
      return;
    }
    setLoading(true);
    const result = await resetPassword(email.trim());
    setLoading(false);
    if (result.success) {
      setError('');
      showAlert('이메일 발송 완료', '비밀번호 재설정 링크가 이메일로 발송되었습니다. 메일함을 확인해 주세요.');
    } else {
      setError(result.message);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.gradientStart, Colors.gradientMiddle, Colors.background]}
        style={styles.gradientBg}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.55 }}
      >
        {/* 장식 원 */}
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

            {/* 헤더 — 온보딩과 같은 스타일 */}
            <View style={styles.header}>
              <View style={styles.logoBox}>
                <Ionicons name="wallet" size={32} color={Colors.primary} />
              </View>
              <Text style={styles.appName}>패밀리 월렛</Text>
              <Text style={styles.appDesc}>
                {isLogin ? '다시 만나서 반가워요! 👋' : '가족과 함께 시작해 보세요! ✨'}
              </Text>
            </View>

            {/* 카드 형태의 폼 — 온보딩 카드처럼 */}
            <View style={styles.formCard}>

              {/* 탭 전환 */}
              <View style={styles.tabRow}>
                <TouchableOpacity
                  style={[styles.tab, isLogin && styles.tabActive]}
                  onPress={() => { setIsLogin(true); setError(''); }}
                >
                  <Ionicons
                    name="log-in-outline"
                    size={16}
                    color={isLogin ? '#FFFFFF' : Colors.textGray}
                  />
                  <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>로그인</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, !isLogin && styles.tabActive]}
                  onPress={() => { setIsLogin(false); setError(''); }}
                >
                  <Ionicons
                    name="person-add-outline"
                    size={16}
                    color={!isLogin ? '#FFFFFF' : Colors.textGray}
                  />
                  <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>회원가입</Text>
                </TouchableOpacity>
              </View>

              {/* 에러 */}
              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={Colors.expense} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* 입력 필드 */}
              {!isLogin && (
                <View style={styles.inputGroup}>
                  <Ionicons name="person-outline" size={18} color={Colors.textGray} style={styles.inputIcon} />
                  <TextInput style={styles.input} placeholder="이름" placeholderTextColor={Colors.textLight} value={name} onChangeText={setName} />
                </View>
              )}

              <View style={styles.inputGroup}>
                <Ionicons name="mail-outline" size={18} color={Colors.textGray} style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="이메일" placeholderTextColor={Colors.textLight}
                  value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              </View>

              <View style={styles.inputGroup}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.textGray} style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="비밀번호 (6자 이상)" placeholderTextColor={Colors.textLight}
                  value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color={Colors.textGray} />
                </TouchableOpacity>
              </View>

              {/* 제출 버튼 */}
              <TouchableOpacity style={[styles.submitBtn, loading && { opacity: 0.7 }]} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
                <LinearGradient
                  colors={isLogin ? [Colors.gradientStart, Colors.primary] : ['#2BC48A', '#1FA870']}
                  style={styles.submitGradient}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                >
                  {loading ? <ActivityIndicator color="#FFF" /> : (
                    <>
                      <Ionicons name={isLogin ? 'log-in-outline' : 'person-add-outline'} size={20} color="#FFFFFF" />
                      <Text style={styles.submitText}>{isLogin ? '로그인' : '회원가입'}</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* 비밀번호 찾기 (로그인 모드일 때만) */}
              {isLogin && (
                <TouchableOpacity style={styles.forgotBtn} onPress={handleResetPassword}>
                  <Text style={styles.forgotText}>비밀번호를 잊으셨나요?</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 구분선 */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>또는</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* 소셜 로그인 — 카드 안 */}
            <View style={styles.socialCard}>
              <TouchableOpacity
                style={styles.googleBtn}
                onPress={handleGoogle}
                disabled={!!socialLoading}
                activeOpacity={0.85}
              >
                {socialLoading === 'google' ? <ActivityIndicator color="#EA4335" /> : (
                  <>
                    <View style={styles.socialIconBox}>
                      <Text style={styles.googleIcon}>G</Text>
                    </View>
                    <Text style={styles.googleBtnText}>Google로 계속하기</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.appleBtn}
                onPress={handleApple}
                disabled={!!socialLoading}
                activeOpacity={0.85}
              >
                {socialLoading === 'apple' ? <ActivityIndicator color="#FFF" /> : (
                  <>
                    <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                    <Text style={styles.appleBtnText}>Apple로 계속하기</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* 하단 전환 */}
            <TouchableOpacity style={styles.switchRow} onPress={() => { setIsLogin(!isLogin); setError(''); }}>
              <Text style={styles.switchText}>
                {isLogin ? '계정이 없으신가요? ' : '이미 계정이 있으신가요? '}
                <Text style={styles.switchLink}>{isLogin ? '회원가입' : '로그인'}</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}

const getStyles = (Colors) => StyleSheet.create({
  container: { flex: 1 },
  gradientBg: { flex: 1, position: 'relative', overflow: 'hidden' },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
  // 장식
  decorCircle1: { position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.06)' },
  decorCircle2: { position: 'absolute', top: '20%', left: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.04)' },
  // 헤더
  header: { alignItems: 'center', paddingTop: Platform.OS === 'web' ? 40 : 70, paddingBottom: 30 },
  logoBox: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
  appName: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', marginTop: 14, letterSpacing: -0.5 },
  appDesc: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 6 },
  // 폼 카드 — 온보딩 카드와 유사한 스타일
  formCard: {
    marginHorizontal: 24,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  tabRow: { flexDirection: 'row', backgroundColor: Colors.background, borderRadius: 14, padding: 4, marginBottom: 20 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 11 },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 14, fontWeight: '700', color: Colors.textGray },
  tabTextActive: { color: '#FFFFFF' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.expense + '10', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: Colors.expense + '20' },
  errorText: { fontSize: 13, color: Colors.expense, flex: 1 },
  inputGroup: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 12, marginBottom: 12, paddingHorizontal: 14 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: Colors.textBlack, paddingVertical: 15 },
  eyeBtn: { padding: 4 },
  submitBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  submitGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  submitText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  // 구분선
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, paddingHorizontal: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.textLight + '30' },
  dividerText: { fontSize: 13, color: Colors.textLight, marginHorizontal: 16, fontWeight: '600' },
  // 소셜 카드
  socialCard: {
    marginHorizontal: 24,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14, gap: 10, backgroundColor: Colors.background },
  googleBtnText: { fontSize: 15, fontWeight: '700', color: Colors.textDark },
  socialIconBox: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#EA4335', justifyContent: 'center', alignItems: 'center' },
  googleIcon: { fontSize: 14, fontWeight: '900', color: '#FFFFFF' },
  appleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14, gap: 10, backgroundColor: '#000000' },
  appleBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  // 하단
  switchRow: { alignItems: 'center', paddingVertical: 16 },
  switchText: { fontSize: 14, color: Colors.textGray },
  switchLink: { color: Colors.primary, fontWeight: '700' },
  forgotBtn: { alignItems: 'center', marginTop: 12 },
  forgotText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
});