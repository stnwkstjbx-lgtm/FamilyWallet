import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Platform, TextInput, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../constants/ThemeContext';
import { useAuth } from '../constants/AuthContext';
import { useWallet } from '../constants/WalletContext';

const showAlert = (title, message, buttons) => {
  if (Platform.OS === 'web') {
    if (buttons) {
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed && buttons[1]) buttons[1].onPress();
    } else {
      window.alert(`${title}\n\n${message}`);
    }
  } else {
    Alert.alert(title, message, buttons);
  }
};

export default function WalletSelectScreen() {
  const { colors: Colors } = useTheme();
  const { user, userProfile, logout } = useAuth();
  const { userWallets, switchWallet, createWallet, joinWallet, leaveWallet, maxWallets } = useWallet();
  const styles = getStyles(Colors);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [walletName, setWalletName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  const canAddMore = userWallets.length < maxWallets;

  const handleSelect = (walletId) => {
    switchWallet(walletId);
  };

  const handleCreate = async () => {
    if (!walletName.trim()) return;
    setLoading(true);
    const result = await createWallet(walletName.trim());
    setLoading(false);
    if (result.success) {
      setShowCreateModal(false);
      setWalletName('');
      showAlert('🎉 생성 완료!', `초대 코드: ${result.inviteCode}`);
    } else {
      showAlert('오류', result.message);
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim() || inviteCode.trim().length < 6) return;
    setLoading(true);
    const result = await joinWallet(inviteCode.trim());
    setLoading(false);
    if (result.success) {
      setShowJoinModal(false);
      setInviteCode('');
      showAlert('🎉 합류 완료!', `"${result.walletName}" 가계부에 합류했습니다!`);
    } else {
      showAlert('오류', result.message);
    }
  };

  const handleLeave = (wallet) => {
    const members = wallet.members ? Object.keys(wallet.members) : [];
    const myRole = wallet.members?.[user?.uid]?.role;
    const isLast = members.length <= 1;

    const msg = isLast
      ? `마지막 멤버가 나가면 "${wallet.name}" 가계부와 모든 데이터가 삭제됩니다.`
      : `"${wallet.name}" 가계부에서 나가시겠습니까?`;

    showAlert('가계부 나가기', msg, [
      { text: '취소' },
      { text: isLast ? '나가기 (삭제)' : '나가기', onPress: async () => {
        const result = await leaveWallet(wallet.id);
        if (result.success) showAlert('완료', '가계부에서 나왔습니다.');
      }},
    ]);
  };

  const handleLogout = () => {
    showAlert('로그아웃', '정말 로그아웃 하시겠습니까?', [
      { text: '취소' },
      { text: '로그아웃', onPress: () => logout() },
    ]);
  };

  const userName = userProfile?.name || user?.displayName || '사용자';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        <LinearGradient
          colors={[Colors.gradientStart, Colors.gradientMiddle, Colors.gradientEnd]}
          style={styles.header}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.headerTitle}>내 가계부</Text>
              <Text style={styles.headerSubtitle}>{userName}님, 가계부를 선택하세요</Text>
            </View>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutIconBtn}>
              <Ionicons name="log-out-outline" size={22} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
          {/* 가계부 수 표시 */}
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{userWallets.length} / {maxWallets} 가계부</Text>
          </View>
        </LinearGradient>

        <View style={styles.listContainer}>
          {userWallets.map((wallet) => {
            const memberCount = wallet.members ? Object.keys(wallet.members).length : 0;
            const myRole = wallet.members?.[user?.uid]?.role || 'member';

            return (
              <View key={wallet.id} style={styles.walletCard}>
                <TouchableOpacity
                  style={styles.walletMain}
                  onPress={() => handleSelect(wallet.id)}
                >
                  <View style={[styles.walletIcon, myRole === 'admin' && { backgroundColor: Colors.primary + '20' }]}>
                    <Ionicons
                      name={myRole === 'admin' ? 'wallet' : 'wallet-outline'}
                      size={28}
                      color={Colors.primary}
                    />
                  </View>
                  <View style={styles.walletInfo}>
                    <Text style={styles.walletName}>{wallet.name}</Text>
                    <View style={styles.walletMeta}>
                      <Ionicons name="people-outline" size={14} color={Colors.textGray} />
                      <Text style={styles.walletMetaText}>{memberCount}명</Text>
                      {myRole === 'admin' && (
                        <View style={styles.adminTag}>
                          <Text style={styles.adminTagText}>관리자</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={Colors.textLight} />
                </TouchableOpacity>

                {/* 나가기 버튼 */}
                <TouchableOpacity
                  style={styles.leaveIconBtn}
                  onPress={() => handleLeave(wallet)}
                >
                  <Ionicons name="exit-outline" size={16} color={Colors.expense} />
                  <Text style={styles.leaveIconText}>나가기</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {/* 새로 만들기 / 합류 */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, !canAddMore && styles.actionBtnDisabled]}
              onPress={() => canAddMore ? setShowCreateModal(true) : showAlert('알림', `가계부는 최대 ${maxWallets}개까지 만들 수 있습니다.`)}
            >
              <Ionicons name="add-circle-outline" size={22} color={canAddMore ? Colors.primary : Colors.textLight} />
              <Text style={[styles.actionBtnText, !canAddMore && { color: Colors.textLight }]}>새 가계부</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, !canAddMore && styles.actionBtnDisabled]}
              onPress={() => canAddMore ? setShowJoinModal(true) : showAlert('알림', `가계부는 최대 ${maxWallets}개까지 참여할 수 있습니다.`)}
            >
              <Ionicons name="enter-outline" size={22} color={canAddMore ? Colors.income : Colors.textLight} />
              <Text style={[styles.actionBtnText, { color: canAddMore ? Colors.income : Colors.textLight }]}>코드로 합류</Text>
            </TouchableOpacity>
          </View>

          {!canAddMore && (
            <View style={styles.limitNotice}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.textGray} />
              <Text style={styles.limitNoticeText}>
                가계부는 최대 {maxWallets}개까지 운용/참여할 수 있어요.
                새 가계부를 추가하려면 기존 가계부에서 나가세요.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* 만들기 모달 */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>새 가계부 만들기</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="가계부 이름 (예: 김씨네 가계부)"
              placeholderTextColor={Colors.textLight}
              value={walletName}
              onChangeText={setWalletName}
              maxLength={20}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowCreateModal(false)}>
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, loading && { opacity: 0.6 }]} onPress={handleCreate} disabled={loading}>
                <Text style={styles.modalSaveText}>{loading ? '생성 중...' : '만들기'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 합류 모달 */}
      <Modal visible={showJoinModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>가계부 합류</Text>
            <TextInput
              style={[styles.modalInput, { textAlign: 'center', fontSize: 22, fontWeight: 'bold', letterSpacing: 4 }]}
              placeholder="ABC123"
              placeholderTextColor={Colors.textLight}
              value={inviteCode}
              onChangeText={(t) => setInviteCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              maxLength={6}
              autoCapitalize="characters"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowJoinModal(false)}>
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, loading && { opacity: 0.6 }]} onPress={handleJoin} disabled={loading}>
                <Text style={styles.modalSaveText}>{loading ? '합류 중...' : '합류하기'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { flexGrow: 1 },
  header: { paddingTop: 60, paddingBottom: 30, paddingHorizontal: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  logoutIconBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12 },
  countBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, marginTop: 12 },
  countBadgeText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  listContainer: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },
  walletCard: { backgroundColor: Colors.surface, borderRadius: 16, marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  walletMain: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 14 },
  walletIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  walletInfo: { flex: 1 },
  walletName: { fontSize: 17, fontWeight: 'bold', color: Colors.textBlack },
  walletMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  walletMetaText: { fontSize: 13, color: Colors.textGray },
  adminTag: { backgroundColor: Colors.primary + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 },
  adminTagText: { fontSize: 10, fontWeight: 'bold', color: Colors.primary },
  leaveIconBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.background },
  leaveIconText: { fontSize: 13, fontWeight: '600', color: Colors.expense },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 16, borderWidth: 1.5, borderColor: Colors.primary + '30' },
  actionBtnDisabled: { borderColor: Colors.textLight + '30', opacity: 0.6 },
  actionBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  limitNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16, backgroundColor: Colors.warning + '15', borderRadius: 12, padding: 14 },
  limitNoticeText: { fontSize: 13, color: Colors.textGray, flex: 1, lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: Colors.modalOverlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.textBlack, marginBottom: 16 },
  modalInput: { backgroundColor: Colors.background, borderRadius: 12, padding: 14, fontSize: 16, color: Colors.textBlack, marginBottom: 16 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, backgroundColor: Colors.background, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: Colors.textGray },
  modalSaveBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalSaveText: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF' },
});