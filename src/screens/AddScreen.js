import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, StatusBar, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../constants/ThemeContext';
import { useAuth } from '../constants/AuthContext';
import { useWallet } from '../constants/WalletContext';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants/categories';
import { db } from '../firebase/firebaseConfig';
import { collection, addDoc } from 'firebase/firestore';

const showAlert = (title, message) => {
  if (Platform.OS === 'web') { window.alert(`${title}\n\n${message}`); }
  else { Alert.alert(title, message); }
};

export default function AddScreen() {
  const { colors: Colors } = useTheme();
  const { user, userProfile } = useAuth();
  const { currentWalletId, currentWallet } = useWallet();
  const styles = getStyles(Colors);

  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [memo, setMemo] = useState('');
  const [fundType, setFundType] = useState('shared'); // 'shared' = 공금, 'personal' = 용돈

  useEffect(() => { setSelectedCategory(null); }, [type]);

  const currentCategories = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const myWalletName = currentWallet?.members?.[user?.uid]?.name || userProfile?.name || user?.displayName || '미지정';
  const myRole = currentWallet?.members?.[user?.uid]?.role || 'member';
  const myAllowance = currentWallet?.members?.[user?.uid]?.allowance || 0;

  const handleSave = async () => {
    if (!amount || amount === '0') { showAlert('알림', '금액을 입력해 주세요!'); return; }
    if (!selectedCategory) { showAlert('알림', '카테고리를 선택해 주세요!'); return; }
    if (!currentWalletId) { showAlert('알림', '가계부가 선택되지 않았습니다.'); return; }

    try {
      const txData = {
        type,
        amount: parseInt(amount),
        category: selectedCategory,
        memo,
        member: myWalletName,
        userId: user?.uid || '',
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      // 지출일 때만 fundType 추가
      if (type === 'expense') {
        txData.fundType = fundType;
      }

      await addDoc(collection(db, 'wallets', currentWalletId, 'transactions'), txData);

      const fundLabel = type === 'expense' ? (fundType === 'personal' ? ' (용돈)' : ' (공금)') : '';
      showAlert('저장 완료! ✅',
        `${myWalletName}님의 ${type === 'expense' ? '지출' : '수입'}${fundLabel}\n${parseInt(amount).toLocaleString('ko-KR')}원이 기록되었습니다.`
      );

      setAmount(''); setSelectedCategory(null); setMemo('');
    } catch (error) {
      console.error('저장 실패:', error);
      showAlert('오류', '저장에 실패했습니다.');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false}>

          <LinearGradient colors={[Colors.gradientStart, Colors.gradientMiddle, Colors.gradientEnd]} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={styles.headerInner}>
              <Text style={styles.headerTitle}>내역 추가</Text>
              <Text style={styles.headerSubtitle}>📒 {currentWallet?.name || '가계부'}</Text>
            </View>
          </LinearGradient>

          <View style={styles.formContainer}>

            {/* 수입/지출 토글 */}
            <View style={styles.typeCard}>
              <TouchableOpacity
                style={[styles.typeButton, type === 'expense' && styles.typeButtonActiveExpense]}
                onPress={() => setType('expense')}
              >
                <Ionicons name="arrow-up-circle" size={20} color={type === 'expense' ? '#FFFFFF' : Colors.expense} />
                <Text style={[styles.typeButtonText, type === 'expense' && { color: '#FFFFFF' }]}>지출</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeButton, type === 'income' && styles.typeButtonActiveIncome]}
                onPress={() => setType('income')}
              >
                <Ionicons name="arrow-down-circle" size={20} color={type === 'income' ? '#FFFFFF' : Colors.income} />
                <Text style={[styles.typeButtonText, type === 'income' && { color: '#FFFFFF' }]}>수입</Text>
              </TouchableOpacity>
            </View>

            {/* 공금/용돈 선택 (지출일 때만) */}
            {type === 'expense' && (
              <View style={styles.fundTypeCard}>
                <Text style={styles.fundTypeLabel}>💳 지출 출처</Text>
                <View style={styles.fundTypeRow}>
                  <TouchableOpacity
                    style={[styles.fundTypeBtn, fundType === 'shared' && styles.fundTypeBtnActiveShared]}
                    onPress={() => setFundType('shared')}
                  >
                    <View style={[styles.fundTypeIcon, { backgroundColor: fundType === 'shared' ? '#FFFFFF30' : Colors.primary + '15' }]}>
                      <Ionicons name="people" size={18} color={fundType === 'shared' ? '#FFFFFF' : Colors.primary} />
                    </View>
                    <View style={styles.fundTypeTextBox}>
                      <Text style={[styles.fundTypeName, fundType === 'shared' && { color: '#FFFFFF' }]}>공금</Text>
                      <Text style={[styles.fundTypeDesc, fundType === 'shared' && { color: 'rgba(255,255,255,0.7)' }]}>가족 공용 지출</Text>
                    </View>
                    {fundType === 'shared' && <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.fundTypeBtn, fundType === 'personal' && styles.fundTypeBtnActivePersonal]}
                    onPress={() => setFundType('personal')}
                  >
                    <View style={[styles.fundTypeIcon, { backgroundColor: fundType === 'personal' ? '#FFFFFF30' : Colors.income + '15' }]}>
                      <Ionicons name="person" size={18} color={fundType === 'personal' ? '#FFFFFF' : Colors.income} />
                    </View>
                    <View style={styles.fundTypeTextBox}>
                      <Text style={[styles.fundTypeName, fundType === 'personal' && { color: '#FFFFFF' }]}>용돈</Text>
                      <Text style={[styles.fundTypeDesc, fundType === 'personal' && { color: 'rgba(255,255,255,0.7)' }]}>개인 용돈에서 차감</Text>
                    </View>
                    {fundType === 'personal' && <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />}
                  </TouchableOpacity>
                </View>

                {fundType === 'personal' && myAllowance > 0 && (
                  <View style={styles.fundTypeHint}>
                    <Ionicons name="information-circle-outline" size={14} color={Colors.primary} />
                    <Text style={styles.fundTypeHintText}>이 지출은 {myWalletName}님의 용돈({myAllowance.toLocaleString('ko-KR')}원)에서 차감됩니다</Text>
                  </View>
                )}
                {fundType === 'personal' && myAllowance === 0 && (
                  <View style={styles.fundTypeHint}>
                    <Ionicons name="alert-circle-outline" size={14} color={Colors.warning} />
                    <Text style={[styles.fundTypeHintText, { color: Colors.warning }]}>아직 용돈이 설정되지 않았어요. 설정에서 관리자에게 요청하세요!</Text>
                  </View>
                )}
              </View>
            )}

            {/* 기록자 표시 */}
            <View style={styles.memberCard}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>{myWalletName.charAt(0)}</Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{myWalletName}</Text>
                <Text style={styles.memberRole}>{myRole === 'admin' ? '관리자' : '멤버'}</Text>
              </View>
              {myRole === 'admin' && (
                <View style={styles.adminBadge}><Ionicons name="shield-checkmark" size={12} color={Colors.primary} /><Text style={styles.adminBadgeText}>관리자</Text></View>
              )}
            </View>

            {/* 금액 */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>금액</Text>
              <View style={styles.amountRow}>
                <TextInput style={styles.amountInput} placeholder="0" placeholderTextColor={Colors.textLight} keyboardType="numeric" value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))} />
                <Text style={styles.wonText}>원</Text>
              </View>
              {amount ? (
                <View style={styles.amountPreviewRow}>
                  <View style={[styles.amountPreviewDot, { backgroundColor: type === 'expense' ? Colors.expense : Colors.income }]} />
                  <Text style={[styles.amountPreview, { color: type === 'expense' ? Colors.expense : Colors.income }]}>
                    {type === 'expense' ? '- ' : '+ '}{parseInt(amount).toLocaleString('ko-KR')}원
                  </Text>
                </View>
              ) : null}
            </View>

            {/* 카테고리 */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>{type === 'expense' ? '지출 카테고리' : '수입 카테고리'}</Text>
              <View style={styles.categoryGrid}>
                {currentCategories.map((cat) => {
                  const isSelected = selectedCategory === cat.id;
                  const catColor = Colors.category[cat.id] || Colors.primary;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.categoryItem, isSelected && { backgroundColor: catColor + '18', borderColor: catColor }]}
                      onPress={() => setSelectedCategory(cat.id)}
                    >
                      <View style={[styles.categoryIconBox, { backgroundColor: catColor + (isSelected ? '30' : '12') }]}>
                        <Ionicons name={cat.icon} size={22} color={catColor} />
                      </View>
                      <Text style={[styles.categoryName, isSelected && { color: catColor, fontWeight: 'bold' }]}>{cat.name}</Text>
                      {isSelected && <View style={[styles.categoryCheck, { backgroundColor: catColor }]}><Ionicons name="checkmark" size={10} color="#FFF" /></View>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 메모 */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>메모 (선택사항)</Text>
              <TextInput style={styles.memoInput} placeholder={type === 'expense' ? '예: 점심 식사, 택시비 등' : '예: 2월 월급, 세뱃돈 등'} placeholderTextColor={Colors.textLight} value={memo} onChangeText={setMemo} multiline />
            </View>

            {/* 저장 */}
            <TouchableOpacity style={styles.saveButton} onPress={handleSave} activeOpacity={0.85}>
              <LinearGradient
                colors={type === 'expense' ? [Colors.expense, '#D43A38'] : [Colors.income, '#1FA870']}
                style={styles.saveGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
                <Text style={styles.saveText}>
                  {type === 'expense' ? '지출' : '수입'} 저장하기
                  {type === 'expense' && fundType === 'personal' ? ' (용돈)' : ''}
                  {type === 'expense' && fundType === 'shared' ? ' (공금)' : ''}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const getStyles = (Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: 60, paddingBottom: 30, paddingHorizontal: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  headerInner: {},
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  formContainer: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 },
  // 수입/지출 토글
  typeCard: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 16, padding: 5, marginBottom: 14, borderWidth: 1, borderColor: Colors.border },
  typeButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, gap: 6 },
  typeButtonText: { fontSize: 15, fontWeight: '700', color: Colors.textDark },
  typeButtonActiveExpense: { backgroundColor: Colors.expense },
  typeButtonActiveIncome: { backgroundColor: Colors.income },
  // 공금/용돈
  fundTypeCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: Colors.border },
  fundTypeLabel: { fontSize: 14, fontWeight: '700', color: Colors.textBlack, marginBottom: 12 },
  fundTypeRow: { gap: 10 },
  fundTypeBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, gap: 12, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: 'transparent' },
  fundTypeBtnActiveShared: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  fundTypeBtnActivePersonal: { backgroundColor: Colors.income, borderColor: Colors.income },
  fundTypeIcon: { width: 38, height: 38, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  fundTypeTextBox: { flex: 1 },
  fundTypeName: { fontSize: 15, fontWeight: '700', color: Colors.textBlack },
  fundTypeDesc: { fontSize: 12, color: Colors.textGray, marginTop: 1 },
  fundTypeHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider },
  fundTypeHintText: { fontSize: 12, color: Colors.primary, flex: 1, lineHeight: 17 },
  // 기록자
  memberCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: 14, gap: 12, borderWidth: 1, borderColor: Colors.border },
  memberAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  memberAvatarText: { fontSize: 17, fontWeight: 'bold', color: '#FFF' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '700', color: Colors.textBlack },
  memberRole: { fontSize: 12, color: Colors.textGray, marginTop: 1 },
  adminBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primary + '12', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  adminBadgeText: { fontSize: 11, fontWeight: 'bold', color: Colors.primary },
  // 입력 카드
  inputCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: Colors.border },
  inputLabel: { fontSize: 13, fontWeight: '700', color: Colors.textGray, marginBottom: 12, letterSpacing: 0.3 },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  amountInput: { flex: 1, fontSize: 34, fontWeight: '800', color: Colors.textBlack, padding: 0, letterSpacing: -1 },
  wonText: { fontSize: 22, fontWeight: '700', color: Colors.textGray, marginLeft: 4 },
  amountPreviewRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
  amountPreviewDot: { width: 6, height: 6, borderRadius: 3 },
  amountPreview: { fontSize: 14, fontWeight: '600' },
  // 카테고리
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryItem: { width: '22%', alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: 'transparent', position: 'relative' },
  categoryIconBox: { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  categoryName: { fontSize: 12, color: Colors.textDark, textAlign: 'center' },
  categoryCheck: { position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  // 메모
  memoInput: { fontSize: 16, color: Colors.textBlack, minHeight: 50, textAlignVertical: 'top' },
  // 저장
  saveButton: { marginTop: 6, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 4 },
  saveGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 8 },
  saveText: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
});