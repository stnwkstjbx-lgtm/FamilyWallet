import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, StatusBar, TextInput,
  TouchableOpacity, Alert, Modal, Switch, Platform, ActivityIndicator, Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../constants/ThemeContext';
import { useAuth } from '../constants/AuthContext';
import { useWallet } from '../constants/WalletContext';
import { FUND_TYPES, FUND_TYPE_MAP } from '../constants/categories';
import { db } from '../firebase/firebaseConfig';
import {
  collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query,
} from 'firebase/firestore';

const showAlert = (title, message, buttons) => {
  if (Platform.OS === 'web') {
    if (buttons) {
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed && buttons[1]) buttons[1].onPress();
    } else { window.alert(`${title}\n\n${message}`); }
  } else { Alert.alert(title, message, buttons); }
};

export default function SettingsScreen() {
  const { colors: Colors, isDark, toggleTheme } = useTheme();
  const { user, userProfile, logout, updateUserProfile, resetPassword, deleteAccount } = useAuth();
  const {
    currentWalletId, currentWallet, isAdmin, userWallets, maxWallets,
    switchWallet, leaveWallet, regenerateInviteCode, getInviteLink, getInviteMessage, goToWalletList, toggleAdmin,
    setSharedBudget,
  } = useWallet();
  const styles = getStyles(Colors);

  const [fixedExpenses, setFixedExpenses] = useState([]);
  const [showFixedModal, setShowFixedModal] = useState(false);
  const [fixedName, setFixedName] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [fixedDay, setFixedDay] = useState('');
  const [fixedType, setFixedType] = useState('expense'); // 'expense' or 'income'
  const [fixedFundType, setFixedFundType] = useState('utility'); // 고정지출 출처
  const [showNameModal, setShowNameModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [showAllowanceModal, setShowAllowanceModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [allowanceAmount, setAllowanceAmount] = useState('');
  const [userExpenses, setUserExpenses] = useState({});
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState('');

  useEffect(() => {
    if (!currentWalletId) return;
    const unsubs = [];

    // ★ 관리자만 전체 트랜잭션 통계 조회 (비관리자는 예산 현황을 보지 않으므로 불필요)
    if (isAdmin) {
      const unsub1 = onSnapshot(query(collection(db, 'wallets', currentWalletId, 'transactions')), (snapshot) => {
        const now = new Date();
        let inc = 0, exp = 0;
        const byUser = {};
        snapshot.docs.forEach((d) => {
          const data = d.data();
          const date = new Date(data.date);
          if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
            if (data.type === 'income') inc += data.amount;
            if (data.type === 'expense') {
              exp += data.amount;
              const uid = data.userId || 'unknown';
              byUser[uid] = (byUser[uid] || 0) + data.amount;
            }
          }
        });
        setTotalIncome(inc); setTotalExpense(exp); setUserExpenses(byUser);
      });
      unsubs.push(unsub1);
    }

    const unsub2 = onSnapshot(query(collection(db, 'wallets', currentWalletId, 'fixedExpenses')), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.day || 1) - (b.day || 1));
      setFixedExpenses(list);
    });
    unsubs.push(unsub2);

    return () => unsubs.forEach((u) => u());
  }, [currentWalletId, isAdmin]);

  const members = currentWallet?.members ? Object.entries(currentWallet.members).map(([uid, data]) => ({ uid, ...data })) : [];
  const totalAllowance = members.reduce((s, m) => s + (m.allowance || 0), 0);
  const fixedTotal = fixedExpenses.reduce((s, i) => s + i.amount, 0);
  const monthlyBudget = currentWallet?.monthlyBudget || 0;
  const sharedBudgetUsedPct = monthlyBudget > 0 ? Math.min(Math.round((totalExpense / monthlyBudget) * 100), 999) : 0;

  const handleSaveName = async () => {
    if (!newName.trim()) return;
    await updateUserProfile({ name: newName.trim() });
    if (currentWalletId && user) {
      await updateDoc(doc(db, 'wallets', currentWalletId), {
        [`members.${user.uid}.name`]: newName.trim(),
      });
    }
    showAlert('수정 완료! ✅', `이름이 "${newName.trim()}"(으)로 변경되었습니다.`);
    setShowNameModal(false);
  };

  const handleSetAllowance = async () => {
    if (!selectedMember) return;
    const amt = parseInt(allowanceAmount) || 0;
    await updateDoc(doc(db, 'wallets', currentWalletId), {
      [`members.${selectedMember.uid}.allowance`]: amt,
    });
    showAlert('설정 완료! ✅', `${selectedMember.name}님의 월 용돈: ${amt.toLocaleString('ko-KR')}원`);
    setShowAllowanceModal(false);
  };

  const handleAddFixed = async () => {
    if (!fixedName || !fixedAmount || !fixedDay) { showAlert('알림', '모든 항목을 입력해 주세요!'); return; }
    const day = parseInt(fixedDay);
    if (day < 1 || day > 31) { showAlert('알림', '1~31 사이 입력!'); return; }
    const docData = {
      name: fixedName, amount: parseInt(fixedAmount), day, type: fixedType,
      lastRecordedMonth: '', createdAt: new Date().toISOString(),
    };
    if (fixedType === 'expense') docData.fundType = fixedFundType;
    await addDoc(collection(db, 'wallets', currentWalletId, 'fixedExpenses'), docData);
    setFixedName(''); setFixedAmount(''); setFixedDay(''); setFixedType('expense'); setFixedFundType('utility'); setShowFixedModal(false);
  };

  const handleDeleteFixed = (id, name) => {
    showAlert('삭제', `"${name}" 삭제?`, [
      { text: '취소' },
      { text: '삭제', onPress: () => deleteDoc(doc(db, 'wallets', currentWalletId, 'fixedExpenses', id)) },
    ]);
  };

  const handleCopyInvite = () => {
    const link = getInviteLink();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(link);
      showAlert('복사 완료!', `초대 링크가 복사되었습니다.\n\n${link}`);
    } else {
      showAlert('초대 링크', link);
    }
  };

  const handleShareInvite = async () => {
    const message = getInviteMessage();
    if (!message) return;
    try {
      await Share.share({
        message,
        title: '패밀리월렛 초대',
      });
    } catch (error) {
      if (error.message !== 'User did not share') {
        showAlert('공유 실패', '공유하기를 사용할 수 없습니다.');
      }
    }
  };

  const handleRegenCode = async () => {
    const result = await regenerateInviteCode();
    if (result.success) showAlert('재생성 완료!', `새 초대 코드: ${result.inviteCode}`);
  };

  const handleSaveBudget = async () => {
    const amt = parseInt(budgetAmount) || 0;
    const result = await setSharedBudget(amt);
    if (result.success) {
      showAlert('설정 완료', amt > 0 ? `공금 월 예산: ${amt.toLocaleString('ko-KR')}원` : '공금 예산이 해제되었습니다.');
      setShowBudgetModal(false);
      setBudgetAmount('');
    } else {
      showAlert('오류', result.message);
    }
  };

  // 관리자 지정/해제
  const handleToggleAdmin = (member) => {
    const isTargetAdmin = member.role === 'admin';
    const action = isTargetAdmin ? '해제' : '지정';
    showAlert(
      `관리자 ${action}`,
      `"${member.name}"님을 관리자에서 ${action}하시겠습니까?`,
      [
        { text: '취소' },
        { text: action, onPress: async () => {
          const result = await toggleAdmin(member.uid);
          if (result.success) {
            showAlert('완료', `"${member.name}"님이 ${result.newRole === 'admin' ? '관리자로 지정' : '일반 멤버로 변경'}되었습니다.`);
          } else {
            showAlert('오류', result.message);
          }
        }},
      ]
    );
  };

  // 가계부 나가기 — 모든 사용자 가능
  const handleLeaveWallet = () => {
    const memberCount = members.length;
    const otherAdmins = members.filter(m => m.uid !== user.uid && m.role === 'admin');

    if (isAdmin && memberCount > 1) {
      const msg = otherAdmins.length > 0
        ? `다른 관리자가 있으므로 안전하게 나갈 수 있습니다.\n\n정말 "${currentWallet?.name}" 가계부에서 나가시겠습니까?`
        : `관리자가 나가면 다른 멤버에게 관리자 역할이 자동으로 넘어갑니다.\n\n정말 "${currentWallet?.name}" 가계부에서 나가시겠습니까?`;
      showAlert(
        '가계부 나가기',
        msg,
        [
          { text: '취소' },
          { text: '나가기', onPress: async () => {
            const result = await leaveWallet(currentWalletId);
            if (result.success) showAlert('완료', '가계부에서 나왔습니다.');
            else showAlert('오류', result.message || '나가기에 실패했습니다.');
          }},
        ]
      );
    } else if (memberCount <= 1) {
      // 혼자 남은 경우 → 가계부 삭제 안내
      showAlert(
        '가계부 삭제',
        `마지막 멤버가 나가면 "${currentWallet?.name}" 가계부와 모든 데이터가 삭제됩니다.\n\n정말 나가시겠습니까?`,
        [
          { text: '취소' },
          { text: '나가기 (삭제)', onPress: async () => {
            const result = await leaveWallet(currentWalletId);
            if (result.success) showAlert('완료', '가계부가 삭제되었습니다.');
          }},
        ]
      );
    } else {
      // 일반 멤버
      showAlert(
        '가계부 나가기',
        `"${currentWallet?.name}" 가계부에서 나가시겠습니까?\n\n나가면 더 이상 이 가계부의 내역을 볼 수 없습니다.`,
        [
          { text: '취소' },
          { text: '나가기', onPress: async () => {
            const result = await leaveWallet(currentWalletId);
            if (result.success) showAlert('완료', '가계부에서 나왔습니다.');
          }},
        ]
      );
    }
  };

  const handleLogout = () => {
    showAlert('로그아웃', '정말 로그아웃 하시겠습니까?', [
      { text: '취소' },
      { text: '로그아웃', onPress: () => logout() },
    ]);
  };

  const handleResetPassword = async () => {
    if (!user?.email) return;
    const result = await resetPassword(user.email);
    if (result.success) {
      showAlert('이메일 발송 완료', '비밀번호 재설정 링크가 이메일로 발송되었습니다.');
    } else {
      showAlert('오류', result.message);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    const isEmailUser = user?.providerData?.[0]?.providerId === 'password';
    const result = await deleteAccount(isEmailUser ? deletePassword : null);
    setDeleteLoading(false);
    if (result.success) {
      setShowDeleteModal(false);
    } else {
      showAlert('오류', result.message);
    }
  };

  const formatMoney = (n) => n.toLocaleString('ko-KR') + '원';
  const userName = userProfile?.name || user?.displayName || '사용자';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false}>

        <LinearGradient colors={[Colors.gradientStart, Colors.gradientMiddle, Colors.gradientEnd]} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.headerTitle}>설정</Text>
          <Text style={styles.headerSubtitle}>📒 {currentWallet?.name || ''} · {isAdmin ? '관리자' : '멤버'}</Text>
        </LinearGradient>

        <View style={styles.ct}>

          {/* 프로필 */}
          <View style={styles.card}>
            <View style={styles.profileRow}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{userName.charAt(0)}</Text></View>
              <View style={styles.profileInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.profileName}>{userName}님</Text>
                  {isAdmin && <View style={styles.badge}><Ionicons name="shield-checkmark" size={12} color={Colors.primary} /><Text style={styles.badgeText}>관리자</Text></View>}
                </View>
                <Text style={styles.profileEmail}>{user?.email}</Text>
              </View>
              <TouchableOpacity onPress={() => { setNewName(userName); setShowNameModal(true); }}>
                <Ionicons name="pencil-outline" size={18} color={Colors.primary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={18} color={Colors.expense} />
              <Text style={styles.logoutText}>로그아웃</Text>
            </TouchableOpacity>
            {user?.providerData?.[0]?.providerId === 'password' && (
              <TouchableOpacity style={styles.resetPwBtn} onPress={handleResetPassword}>
                <Ionicons name="key-outline" size={16} color={Colors.primary} />
                <Text style={styles.resetPwText}>비밀번호 재설정</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 다크모드 */}
          <View style={styles.card}>
            <View style={styles.darkRow}>
              <Ionicons name={isDark ? 'moon' : 'sunny'} size={22} color={isDark ? '#FFD55A' : '#FFB800'} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.darkTitle}>{isDark ? '다크 모드' : '라이트 모드'}</Text>
              </View>
              <Switch value={isDark} onValueChange={toggleTheme} trackColor={{ false: '#D1D5DB', true: Colors.primary }} thumbColor={Colors.surface} />
            </View>
          </View>

          {/* ===== 가계부 관리 섹션 ===== */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Ionicons name="wallet" size={22} color={Colors.primary} />
              <Text style={styles.sectionTitle}>내 가계부</Text>
              <View style={styles.walletCountBadge}>
                <Text style={styles.walletCountText}>{userWallets.length}/{maxWallets}</Text>
              </View>
            </View>

            {/* 현재 가계부 */}
            <View style={styles.currentWalletBox}>
              <View style={styles.currentWalletIcon}>
                <Ionicons name="wallet" size={24} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.currentWalletName}>{currentWallet?.name}</Text>
                <Text style={styles.currentWalletMeta}>
                  {members.length}명 · {isAdmin ? '관리자' : '멤버'} · 코드: {currentWallet?.inviteCode}
                </Text>
              </View>
            </View>

            {/* 다른 가계부 목록 */}
            {userWallets.filter((w) => w.id !== currentWalletId).map((w) => {
              const wMembers = w.members ? Object.keys(w.members).length : 0;
              const wRole = w.members?.[user?.uid]?.role || 'member';
              return (
                <TouchableOpacity key={w.id} style={styles.otherWalletRow} onPress={() => switchWallet(w.id)}>
                  <Ionicons name="wallet-outline" size={20} color={Colors.textGray} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.otherWalletName}>{w.name}</Text>
                    <Text style={styles.otherWalletMeta}>{wMembers}명 · {wRole === 'admin' ? '관리자' : '멤버'}</Text>
                  </View>
                  <View style={styles.switchBadge}>
                    <Text style={styles.switchBadgeText}>전환</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* 가계부 목록 보기 버튼 */}
            <TouchableOpacity style={styles.walletListBtn} onPress={goToWalletList}>
              <Ionicons name="list-outline" size={18} color={Colors.primary} />
              <Text style={styles.walletListBtnText}>가계부 목록 / 새로 만들기</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
            </TouchableOpacity>
          </View>

          {/* 초대 링크 */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Ionicons name="link" size={22} color={Colors.primary} />
              <Text style={styles.sectionTitle}>초대 링크</Text>
            </View>
            <View style={styles.inviteBox}>
              <Text style={styles.inviteCode}>{currentWallet?.inviteCode || ''}</Text>
            </View>
            <View style={styles.inviteBtnRow}>
              <TouchableOpacity style={styles.copyBtn} onPress={handleCopyInvite}>
                <Ionicons name="copy-outline" size={16} color="#FFF" />
                <Text style={styles.copyBtnText}>링크 복사</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareBtn} onPress={handleShareInvite}>
                <Ionicons name="share-social-outline" size={16} color="#FFF" />
                <Text style={styles.shareBtnText}>공유하기</Text>
              </TouchableOpacity>
            </View>
            {isAdmin && (
              <TouchableOpacity style={styles.regenBtn} onPress={handleRegenCode}>
                <Ionicons name="refresh-outline" size={16} color={Colors.primary} />
                <Text style={styles.regenBtnText}>코드 재생성</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 예산 현황 (관리자) */}
          {isAdmin && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Ionicons name="pie-chart" size={22} color={Colors.primary} />
                <Text style={styles.sectionTitle}>예산 배분 현황</Text>
              </View>

              {/* 공금 월 예산 카드 */}
              <View style={styles.sharedBudgetCard}>
                <View style={styles.sharedBudgetHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sharedBudgetLabel}>공금 월 예산</Text>
                    <Text style={styles.sharedBudgetAmount}>
                      {monthlyBudget > 0 ? formatMoney(monthlyBudget) : '미설정'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.sharedBudgetBtn}
                    onPress={() => { setBudgetAmount(monthlyBudget > 0 ? String(monthlyBudget) : ''); setShowBudgetModal(true); }}
                  >
                    <Ionicons name="create-outline" size={16} color={Colors.primary} />
                    <Text style={styles.sharedBudgetBtnText}>{monthlyBudget > 0 ? '수정' : '설정'}</Text>
                  </TouchableOpacity>
                </View>
                {monthlyBudget > 0 && (
                  <>
                    <View style={styles.sharedBudgetBar}>
                      <View style={[styles.sharedBudgetBarFill, {
                        width: `${Math.min(sharedBudgetUsedPct, 100)}%`,
                        backgroundColor: sharedBudgetUsedPct >= 90 ? Colors.expense : sharedBudgetUsedPct >= 70 ? Colors.warning : Colors.income,
                      }]} />
                    </View>
                    <View style={styles.sharedBudgetFooter}>
                      <Text style={styles.sharedBudgetFooterText}>
                        {formatMoney(totalExpense)} 사용 ({sharedBudgetUsedPct}%)
                      </Text>
                      <Text style={[styles.sharedBudgetFooterRemain, {
                        color: (monthlyBudget - totalExpense) >= 0 ? Colors.income : Colors.expense,
                      }]}>
                        {formatMoney(monthlyBudget - totalExpense)} {(monthlyBudget - totalExpense) >= 0 ? '남음' : '초과'}
                      </Text>
                    </View>
                  </>
                )}
              </View>

              <View style={styles.budgetBox}>
                <View style={styles.bRow}><Text style={styles.bLabel}>총 수입</Text><Text style={[styles.bValue, { color: Colors.income }]}>{formatMoney(totalIncome)}</Text></View>
                <View style={styles.bRow}><Text style={styles.bLabel}>총 지출</Text><Text style={[styles.bValue, { color: Colors.expense }]}>{formatMoney(totalExpense + totalAllowance)}</Text></View>
                <View style={styles.bDivider} />
                <View style={styles.bRow}><Text style={styles.bLabel}>배분 용돈</Text><Text style={styles.bValue}>{formatMoney(totalAllowance)}</Text></View>
                <View style={styles.bRow}><Text style={styles.bLabel}>고정 지출</Text><Text style={styles.bValue}>{formatMoney(fixedTotal)}</Text></View>
                <View style={styles.bDivider} />
                <View style={styles.bRow}>
                  <Text style={[styles.bLabel, { fontWeight: 'bold' }]}>잔액</Text>
                  <Text style={[styles.bValue, { fontWeight: 'bold', fontSize: 17, color: (totalIncome - totalExpense - totalAllowance) >= 0 ? Colors.income : Colors.expense }]}>{formatMoney(totalIncome - totalExpense - totalAllowance)}</Text>
                </View>
              </View>
            </View>
          )}

          {/* 가족 용돈 (관리자) */}
          {isAdmin && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Ionicons name="people" size={22} color={Colors.primary} />
                <Text style={styles.sectionTitle}>가족 용돈 관리</Text>
              </View>
              {members.map((m) => {
                const spent = userExpenses[m.uid] || 0;
                const allow = m.allowance || 0;
                const pct = allow > 0 ? Math.min(Math.round((spent / allow) * 100), 100) : 0;
                return (
                  <View key={m.uid} style={styles.memberCard}>
                    <View style={styles.memberTop}>
                      <View style={[styles.mAvatar, m.role === 'admin' && { backgroundColor: Colors.primary }]}><Text style={styles.mAvatarText}>{(m.name || '?').charAt(0)}</Text></View>
                      <View style={styles.mInfo}>
                        <Text style={styles.mName}>{m.name}{m.role === 'admin' ? ' 👑' : ''}</Text>
                        <Text style={styles.mEmail}>{m.email}</Text>
                      </View>
                      {m.uid !== user?.uid && (
                        <TouchableOpacity
                          style={[styles.adminToggleBtn, m.role === 'admin' && styles.adminToggleBtnActive]}
                          onPress={() => handleToggleAdmin(m)}
                        >
                          <Ionicons name="shield-checkmark" size={14} color={m.role === 'admin' ? '#fff' : Colors.primary} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={styles.allowBtn} onPress={() => { setSelectedMember(m); setAllowanceAmount(String(allow)); setShowAllowanceModal(true); }}>
                        <Text style={styles.allowBtnText}>용돈</Text>
                      </TouchableOpacity>
                    </View>
                    {allow > 0 && (
                      <View style={styles.mAllowInfo}>
                        <Text style={styles.mAllowText}>{formatMoney(allow)} 중 {formatMoney(spent)} 사용 ({pct}%)</Text>
                        <View style={styles.mBarBg}><View style={[styles.mBarFill, { width: `${pct}%`, backgroundColor: pct >= 90 ? Colors.expense : Colors.income }]} /></View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* 고정 지출/수입 (관리자) */}
          {isAdmin && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Ionicons name="repeat-outline" size={22} color={Colors.primary} />
                <Text style={styles.sectionTitle}>고정 지출/수입</Text>
                <TouchableOpacity style={styles.addBtn} onPress={() => setShowFixedModal(true)}><Ionicons name="add" size={20} color="#FFF" /></TouchableOpacity>
              </View>
              {fixedExpenses.length === 0 ? <Text style={styles.emptyText}>등록된 고정 내역이 없어요</Text> : (
                fixedExpenses.map((item) => {
                  const isIncome = item.type === 'income';
                  const ftInfo = !isIncome ? (FUND_TYPE_MAP[item.fundType] || FUND_TYPE_MAP['utility']) : null;
                  return (
                    <View key={item.id} style={styles.fixedRow}>
                      <View style={[styles.fixedDayBadge, isIncome && { backgroundColor: Colors.income + '15' }]}>
                        <Text style={[styles.fixedDayText, isIncome && { color: Colors.income }]}>{item.day}일</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fixedName}>{item.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          {isIncome ? (
                            <Text style={{ fontSize: 10, color: Colors.income }}>수입</Text>
                          ) : ftInfo ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: ftInfo.color + '12', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                              <Ionicons name={ftInfo.icon} size={9} color={ftInfo.color} />
                              <Text style={{ fontSize: 10, fontWeight: '600', color: ftInfo.color }}>{ftInfo.name}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <Text style={[styles.fixedAmt, { color: isIncome ? Colors.income : Colors.textBlack }]}>
                        {isIncome ? '+' : ''}{formatMoney(item.amount)}
                      </Text>
                      <TouchableOpacity onPress={() => handleDeleteFixed(item.id, item.name)}><Ionicons name="trash-outline" size={18} color={Colors.expense} /></TouchableOpacity>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* ===== 가계부 나가기 ===== */}
          <TouchableOpacity style={styles.leaveBtn} onPress={handleLeaveWallet}>
            <Ionicons name="exit-outline" size={18} color={Colors.expense} />
            <Text style={styles.leaveBtnText}>
              {members.length <= 1 ? '가계부 삭제하고 나가기' : '이 가계부 나가기'}
            </Text>
          </TouchableOpacity>

          {/* 계정 삭제 */}
          <TouchableOpacity style={styles.deleteAccountBtn} onPress={() => { setDeletePassword(''); setShowDeleteModal(true); }}>
            <Ionicons name="warning-outline" size={16} color={Colors.textLight} />
            <Text style={styles.deleteAccountText}>계정 삭제</Text>
          </TouchableOpacity>

          <View style={styles.appInfo}>
            <Text style={styles.appInfoText}>패밀리 월렛 v2.1.0</Text>
          </View>
        </View>
      </ScrollView>

      {/* 이름 수정 모달 */}
      <Modal visible={showNameModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>이름 수정</Text>
          <TextInput style={styles.modalInput} placeholder="새 이름" placeholderTextColor={Colors.textLight} value={newName} onChangeText={setNewName} />
          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowNameModal(false)}><Text style={styles.modalCancelText}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveName}><Text style={styles.modalSaveText}>저장</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* 용돈 모달 */}
      <Modal visible={showAllowanceModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>💰 {selectedMember?.name} 용돈</Text>
          <TextInput style={styles.modalInput} placeholder="금액" placeholderTextColor={Colors.textLight} keyboardType="numeric" value={allowanceAmount} onChangeText={(t) => setAllowanceAmount(t.replace(/[^0-9]/g, ''))} />
          {allowanceAmount && allowanceAmount !== '0' ? <Text style={styles.preview}>{parseInt(allowanceAmount).toLocaleString('ko-KR')}원</Text> : null}
          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowAllowanceModal(false)}><Text style={styles.modalCancelText}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSetAllowance}><Text style={styles.modalSaveText}>설정</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* 고정 지출/수입 모달 */}
      <Modal visible={showFixedModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>고정 내역 추가</Text>
          <View style={styles.fixedToggleRow}>
            <TouchableOpacity
              style={[styles.fixedToggleBtn, fixedType === 'expense' && { backgroundColor: Colors.expense + '15', borderColor: Colors.expense }]}
              onPress={() => setFixedType('expense')}
            >
              <Ionicons name="arrow-up-circle" size={16} color={fixedType === 'expense' ? Colors.expense : Colors.textGray} />
              <Text style={[styles.fixedToggleText, fixedType === 'expense' && { color: Colors.expense }]}>지출</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.fixedToggleBtn, fixedType === 'income' && { backgroundColor: Colors.income + '15', borderColor: Colors.income }]}
              onPress={() => setFixedType('income')}
            >
              <Ionicons name="arrow-down-circle" size={16} color={fixedType === 'income' ? Colors.income : Colors.textGray} />
              <Text style={[styles.fixedToggleText, fixedType === 'income' && { color: Colors.income }]}>수입</Text>
            </TouchableOpacity>
          </View>
          <TextInput style={styles.modalInput} placeholder="항목명" placeholderTextColor={Colors.textLight} value={fixedName} onChangeText={setFixedName} />
          <TextInput style={styles.modalInput} placeholder="금액" placeholderTextColor={Colors.textLight} keyboardType="numeric" value={fixedAmount} onChangeText={(t) => setFixedAmount(t.replace(/[^0-9]/g, ''))} />
          {fixedType === 'expense' && (
            <View style={styles.fixedFundTypeRow}>
              {FUND_TYPES.filter(ft => ft.id !== 'personal').map((ft) => (
                <TouchableOpacity
                  key={ft.id}
                  style={[styles.fixedFundChip, fixedFundType === ft.id && { backgroundColor: ft.color + '18', borderColor: ft.color }]}
                  onPress={() => setFixedFundType(ft.id)}
                >
                  <Ionicons name={ft.icon} size={12} color={fixedFundType === ft.id ? ft.color : Colors.textGray} />
                  <Text style={[styles.fixedFundChipText, fixedFundType === ft.id && { color: ft.color }]}>{ft.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={styles.dayRow}><Text style={styles.dayLabel}>매월</Text><TextInput style={styles.dayInput} placeholder="5" placeholderTextColor={Colors.textLight} keyboardType="numeric" maxLength={2} value={fixedDay} onChangeText={(t) => setFixedDay(t.replace(/[^0-9]/g, ''))} /><Text style={styles.dayLabel}>일</Text></View>
          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setShowFixedModal(false); setFixedName(''); setFixedAmount(''); setFixedDay(''); setFixedType('expense'); setFixedFundType('utility'); }}><Text style={styles.modalCancelText}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleAddFixed}><Text style={styles.modalSaveText}>추가</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* 계정 삭제 모달 */}
      <Modal visible={showDeleteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <View style={styles.deleteModalHeader}>
            <Ionicons name="warning" size={28} color={Colors.expense} />
            <Text style={[styles.modalTitle, { color: Colors.expense, marginBottom: 0, marginLeft: 8 }]}>계정 삭제</Text>
          </View>
          <Text style={styles.deleteWarning}>
            계정을 삭제하면 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다. 참여 중인 가계부에서도 자동으로 탈퇴됩니다.
          </Text>
          {user?.providerData?.[0]?.providerId === 'password' && (
            <TextInput
              style={styles.modalInput}
              placeholder="비밀번호 확인"
              placeholderTextColor={Colors.textLight}
              secureTextEntry
              value={deletePassword}
              onChangeText={setDeletePassword}
            />
          )}
          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowDeleteModal(false)}>
              <Text style={styles.modalCancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSaveBtn, { backgroundColor: Colors.expense }]}
              onPress={handleDeleteAccount}
              disabled={deleteLoading}
            >
              {deleteLoading
                ? <ActivityIndicator color="#FFF" size="small" />
                : <Text style={styles.modalSaveText}>삭제</Text>
              }
            </TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* 공금 예산 설정 모달 */}
      <Modal visible={showBudgetModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>공금 월 예산 설정</Text>
          <Text style={{ fontSize: 13, color: Colors.textGray, marginBottom: 16 }}>
            모든 구성원이 공유하는 월 공금 예산을 설정합니다.
          </Text>
          <TextInput
            style={styles.modalInput}
            placeholder="예산 금액 (0 입력시 해제)"
            placeholderTextColor={Colors.textLight}
            keyboardType="numeric"
            value={budgetAmount}
            onChangeText={(t) => setBudgetAmount(t.replace(/[^0-9]/g, ''))}
          />
          {budgetAmount && budgetAmount !== '0' ? (
            <Text style={[styles.preview, { color: Colors.primary }]}>
              월 {parseInt(budgetAmount).toLocaleString('ko-KR')}원
            </Text>
          ) : null}
          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.modalBtnCancel} onPress={() => { setShowBudgetModal(false); setBudgetAmount(''); }}>
              <Text style={[styles.modalBtnText, { color: Colors.textGray }]}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.primary }]} onPress={handleSaveBudget}>
              <Text style={[styles.modalBtnText, { color: '#fff' }]}>설정</Text>
            </TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}

const getStyles = (Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: 60, paddingBottom: 30, paddingHorizontal: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  ct: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 },
  card: { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 22, fontWeight: 'bold', color: '#FFF' },
  profileInfo: { marginLeft: 14, flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileName: { fontSize: 18, fontWeight: 'bold', color: Colors.textBlack },
  profileEmail: { fontSize: 13, color: Colors.textGray, marginTop: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primary + '15', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: 'bold', color: Colors.primary },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.expense + '12', borderWidth: 1, borderColor: Colors.expense + '30' },
  logoutText: { fontSize: 14, fontWeight: '600', color: Colors.expense },
  darkRow: { flexDirection: 'row', alignItems: 'center' },
  darkTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textBlack },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.textBlack, flex: 1 },
  // 가계부 관리
  walletCountBadge: { backgroundColor: Colors.primary + '20', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  walletCountText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  currentWalletBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary + '10', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: Colors.primary + '30' },
  currentWalletIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primary + '20', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  currentWalletName: { fontSize: 16, fontWeight: 'bold', color: Colors.textBlack },
  currentWalletMeta: { fontSize: 12, color: Colors.textGray, marginTop: 2 },
  otherWalletRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  otherWalletName: { fontSize: 15, fontWeight: '600', color: Colors.textBlack },
  otherWalletMeta: { fontSize: 12, color: Colors.textGray, marginTop: 1 },
  switchBadge: { backgroundColor: Colors.primary + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  switchBadgeText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  walletListBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.background },
  walletListBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  // 초대
  inviteBox: { alignItems: 'center', backgroundColor: Colors.background, borderRadius: 12, padding: 14, marginBottom: 10 },
  inviteCode: { fontSize: 22, fontWeight: 'bold', color: Colors.primary, letterSpacing: 4 },
  inviteBtnRow: { flexDirection: 'row', gap: 10 },
  copyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 11 },
  copyBtnText: { fontSize: 13, fontWeight: 'bold', color: '#FFF' },
  shareBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FEE500', borderRadius: 10, paddingVertical: 11 },
  shareBtnText: { fontSize: 13, fontWeight: 'bold', color: '#3C1E1E' },
  regenBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center', marginTop: 10, paddingVertical: 8 },
  regenBtnText: { fontSize: 13, color: Colors.primary },
  // 공금 예산
  sharedBudgetCard: { backgroundColor: Colors.background, borderRadius: 14, padding: 16, marginBottom: 14 },
  sharedBudgetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sharedBudgetLabel: { fontSize: 12, fontWeight: '600', color: Colors.textGray, marginBottom: 2 },
  sharedBudgetAmount: { fontSize: 22, fontWeight: '800', color: Colors.textBlack },
  sharedBudgetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.primary + '12' },
  sharedBudgetBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  sharedBudgetBar: { height: 8, backgroundColor: Colors.surface, borderRadius: 4, overflow: 'hidden' },
  sharedBudgetBarFill: { height: 8, borderRadius: 4 },
  sharedBudgetFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  sharedBudgetFooterText: { fontSize: 12, fontWeight: '600', color: Colors.textGray },
  sharedBudgetFooterRemain: { fontSize: 13, fontWeight: '700' },
  // 예산
  budgetBox: { backgroundColor: Colors.background, borderRadius: 12, padding: 16 },
  bRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  bLabel: { fontSize: 14, color: Colors.textGray },
  bValue: { fontSize: 14, fontWeight: '600', color: Colors.textBlack },
  bDivider: { height: 1, backgroundColor: Colors.surface, marginBottom: 10 },
  // 멤버
  memberCard: { backgroundColor: Colors.background, borderRadius: 12, padding: 14, marginBottom: 10 },
  memberTop: { flexDirection: 'row', alignItems: 'center' },
  mAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.textGray, justifyContent: 'center', alignItems: 'center' },
  mAvatarText: { fontSize: 16, fontWeight: 'bold', color: '#FFF' },
  mInfo: { flex: 1, marginLeft: 10 },
  mName: { fontSize: 15, fontWeight: 'bold', color: Colors.textBlack },
  mEmail: { fontSize: 11, color: Colors.textGray },
  adminToggleBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 6 },
  adminToggleBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  allowBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  allowBtnText: { fontSize: 12, fontWeight: 'bold', color: '#FFF' },
  mAllowInfo: { marginTop: 8 },
  mAllowText: { fontSize: 12, color: Colors.textGray, marginBottom: 4 },
  mBarBg: { height: 5, backgroundColor: Colors.surface, borderRadius: 3 },
  mBarFill: { height: 5, borderRadius: 3 },
  // 고정지출
  addBtn: { backgroundColor: Colors.primary, borderRadius: 8, width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  fixedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 10 },
  fixedDayBadge: { backgroundColor: Colors.primary + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  fixedDayText: { fontSize: 13, fontWeight: 'bold', color: Colors.primary },
  fixedName: { fontSize: 15, fontWeight: '600', color: Colors.textBlack },
  fixedAmt: { fontSize: 15, fontWeight: '600', color: Colors.expense, marginRight: 8 },
  emptyText: { fontSize: 14, color: Colors.textLight, textAlign: 'center', paddingVertical: 10 },
  // 나가기
  leaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 14, backgroundColor: Colors.expense + '10', borderWidth: 1.5, borderColor: Colors.expense + '25', marginBottom: 16 },
  leaveBtnText: { fontSize: 15, fontWeight: '700', color: Colors.expense },
  appInfo: { alignItems: 'center', paddingVertical: 16 },
  appInfoText: { fontSize: 13, color: Colors.textLight },
  // 모달
  modalOverlay: { flex: 1, backgroundColor: Colors.modalOverlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.textBlack, marginBottom: 16 },
  modalInput: { backgroundColor: Colors.background, borderRadius: 12, padding: 14, fontSize: 16, color: Colors.textBlack, marginBottom: 12 },
  preview: { fontSize: 13, color: Colors.primary, marginTop: -6, marginBottom: 10 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  dayLabel: { fontSize: 16, fontWeight: '600', color: Colors.textDark },
  dayInput: { backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 18, fontWeight: 'bold', color: Colors.primary, width: 60, textAlign: 'center' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 10 },
  modalCancelBtn: { flex: 1, backgroundColor: Colors.background, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: Colors.textGray },
  modalSaveBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalSaveText: { fontSize: 15, fontWeight: 'bold', color: '#FFF' },
  // 고정 지출/수입 토글
  fixedToggleRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  fixedToggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  fixedToggleText: { fontSize: 14, fontWeight: '600', color: Colors.textGray },
  fixedFundTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  fixedFundChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  fixedFundChipText: { fontSize: 11, fontWeight: '600', color: Colors.textGray },
  // 비밀번호 재설정
  resetPwBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: 8, borderRadius: 10, backgroundColor: Colors.primary + '10' },
  resetPwText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  // 계정 삭제
  deleteAccountBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginBottom: 8 },
  deleteAccountText: { fontSize: 13, color: Colors.textLight },
  deleteModalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  deleteWarning: { fontSize: 13, color: Colors.textGray, lineHeight: 20, marginBottom: 16, backgroundColor: Colors.expense + '08', padding: 12, borderRadius: 10 },
});