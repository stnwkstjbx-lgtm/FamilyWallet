import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../constants/ThemeContext';
import { useAuth } from '../constants/AuthContext';
import { useWallet } from '../constants/WalletContext';

const showAlert = (title, message) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export default function WalletSetupScreen() {
  const { colors: Colors } = useTheme();
  const { user, userProfile } = useAuth();
  const { createWallet, joinWallet } = useWallet();
  const styles = getStyles(Colors);

  const [mode, setMode] = useState(null); // null, 'create', 'join'
  const [walletName, setWalletName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  // URL에서 초대 코드 자동 감지
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('invite');
      if (code) {
        setMode('join');
        setInviteCode(code.toUpperCase());
      }
    }
  }, []);

  const handleCreate = async () => {
    if (!walletName.trim()) {
      showAlert('알림', '가계부 이름을 입력해 주세요!');
      return;
    }
    setLoading(true);
    const result = await createWallet(walletName.trim());
    setLoading(false);

    if (result.success) {
      showAlert('🎉 가계부 생성 완료!', `"${walletName.trim()}" 가계부가 만들어졌습니다!\n\n초대 코드: ${result.inviteCode}\n\n가족에게 초대 링크를 공유하세요!`);
    } else {
      showAlert('오류', result.message);
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim() || inviteCode.trim().length < 6) {
      showAlert('알림', '올바른 초대 코드를 입력해 주세요!');
      return;
    }
    setLoading(true);
    const result = await joinWallet(inviteCode.trim());
    setLoading(false);

    if (result.success) {
      showAlert('🎉 합류 완료!', `"${result.walletName}" 가계부에 합류했습니다!`);
    } else {
      showAlert('오류', result.message);
    }
  };

  const userName = userProfile?.name || user?.displayName || '사용자';

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>

          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientMiddle, Colors.gradientEnd]}
            style={styles.heroSection}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="wallet-outline" size={60} color="#FFFFFF" />
            <Text style={styles.heroTitle}>패밀리 월렛</Text>
            <Text style={styles.heroSubtitle}>{userName}님, 환영합니다! 👋</Text>
            <Text style={styles.heroDesc}>가족 가계부를 만들거나, 초대받은 가계부에 합류하세요</Text>
          </LinearGradient>

          {/* 선택 화면 */}
          {!mode && (
            <View style={styles.choiceContainer}>
              <TouchableOpacity style={styles.choiceCard} onPress={() => setMode('create')}>
                <View style={[styles.choiceIconBox, { backgroundColor: Colors.primary + '20' }]}>
                  <Ionicons name="add-circle" size={32} color={Colors.primary} />
                </View>
                <Text style={styles.choiceTitle}>새 가계부 만들기</Text>
                <Text style={styles.choiceDesc}>관리자로 가계부를 만들고{'\n'}가족을 초대하세요</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.choiceCard} onPress={() => setMode('join')}>
                <View style={[styles.choiceIconBox, { backgroundColor: Colors.income + '20' }]}>
                  <Ionicons name="people" size={32} color={Colors.income} />
                </View>
                <Text style={styles.choiceTitle}>초대 코드로 합류</Text>
                <Text style={styles.choiceDesc}>공유받은 초대 코드나{'\n'}링크로 가계부에 합류하세요</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
              </TouchableOpacity>
            </View>
          )}

          {/* 가계부 만들기 */}
          {mode === 'create' && (
            <View style={styles.formContainer}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setMode(null)}>
                <Ionicons name="arrow-back" size={20} color={Colors.primary} />
                <Text style={styles.backBtnText}>돌아가기</Text>
              </TouchableOpacity>

              <View style={styles.formCard}>
                <Ionicons name="add-circle" size={36} color={Colors.primary} />
                <Text style={styles.formTitle}>새 가계부 만들기</Text>
                <Text style={styles.formDesc}>가계부 이름을 입력하세요</Text>

                <TextInput
                  style={styles.formInput}
                  placeholder="예: 김씨네 가계부, 우리집 살림"
                  placeholderTextColor={Colors.textLight}
                  value={walletName}
                  onChangeText={setWalletName}
                  maxLength={20}
                />

                <TouchableOpacity
                  style={[styles.formButton, loading && { opacity: 0.6 }]}
                  onPress={handleCreate}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={[Colors.gradientStart, Colors.primary]}
                    style={styles.formButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                    <Text style={styles.formButtonText}>{loading ? '생성 중...' : '가계부 만들기'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 초대 코드로 합류 */}
          {mode === 'join' && (
            <View style={styles.formContainer}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setMode(null)}>
                <Ionicons name="arrow-back" size={20} color={Colors.primary} />
                <Text style={styles.backBtnText}>돌아가기</Text>
              </TouchableOpacity>

              <View style={styles.formCard}>
                <Ionicons name="people" size={36} color={Colors.income} />
                <Text style={styles.formTitle}>가계부 합류하기</Text>
                <Text style={styles.formDesc}>초대 코드 6자리를 입력하세요</Text>

                <TextInput
                  style={[styles.formInput, styles.codeInput]}
                  placeholder="ABC123"
                  placeholderTextColor={Colors.textLight}
                  value={inviteCode}
                  onChangeText={(t) => setInviteCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  maxLength={6}
                  autoCapitalize="characters"
                />

                <TouchableOpacity
                  style={[styles.formButton, loading && { opacity: 0.6 }]}
                  onPress={handleJoin}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={[Colors.income, '#1FA870']}
                    style={styles.formButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Ionicons name="enter-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.formButtonText}>{loading ? '합류 중...' : '가계부 합류하기'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const getStyles = (Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { flexGrow: 1 },
  heroSection: { paddingTop: 80, paddingBottom: 40, paddingHorizontal: 30, alignItems: 'center', borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  heroTitle: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', marginTop: 16 },
  heroSubtitle: { fontSize: 16, color: 'rgba(255,255,255,0.9)', marginTop: 8 },
  heroDesc: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 6, textAlign: 'center' },
  choiceContainer: { paddingHorizontal: 20, paddingTop: 30, gap: 16 },
  choiceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 16, padding: 20, gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  choiceIconBox: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  choiceTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textBlack },
  choiceDesc: { fontSize: 12, color: Colors.textGray, marginTop: 2, flex: 1 },
  formContainer: { paddingHorizontal: 20, paddingTop: 20 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16, paddingVertical: 8 },
  backBtnText: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
  formCard: { backgroundColor: Colors.surface, borderRadius: 20, padding: 30, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  formTitle: { fontSize: 22, fontWeight: 'bold', color: Colors.textBlack, marginTop: 12 },
  formDesc: { fontSize: 14, color: Colors.textGray, marginTop: 6, marginBottom: 24 },
  formInput: { width: '100%', backgroundColor: Colors.background, borderRadius: 12, padding: 16, fontSize: 16, color: Colors.textBlack },
  codeInput: { textAlign: 'center', fontSize: 24, fontWeight: 'bold', letterSpacing: 6 },
  formButton: { width: '100%', borderRadius: 14, overflow: 'hidden', marginTop: 20 },
  formButtonGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  formButtonText: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
});