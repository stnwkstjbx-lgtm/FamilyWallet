import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, StatusBar, Alert, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../constants/ThemeContext';
import { useAuth } from '../constants/AuthContext';
import { useWallet } from '../constants/WalletContext';
import { INCOME_CATEGORIES, FUND_TYPES, FUND_TYPE_MAP, ICON_OPTIONS, ALL_CATEGORY_NAMES, ALL_CATEGORY_ICONS, getFundCategories, registerCustomCategories } from '../constants/categories';
import { db } from '../firebase/firebaseConfig';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { formatAmountInput, parseAmount, validateAmount, validateFundType } from '../utils/format';

const FIXED_EXPENSE_PRESETS = [
  { name: '월세', icon: 'home-outline' },
  { name: '통신비', icon: 'phone-portrait-outline' },
  { name: '보험료', icon: 'shield-checkmark-outline' },
  { name: '구독료', icon: 'tv-outline' },
  { name: '교육비', icon: 'school-outline' },
  { name: '관리비', icon: 'business-outline' },
];

const FIXED_INCOME_PRESETS = [
  { name: '월급', icon: 'cash-outline' },
  { name: '임대수익', icon: 'home-outline' },
  { name: '이자', icon: 'trending-up-outline' },
  { name: '연금', icon: 'shield-checkmark-outline' },
  { name: '부수입', icon: 'wallet-outline' },
];

const showAlert = (title, message) => {
  if (Platform.OS === 'web') { window.alert(`${title}\n\n${message}`); }
  else { Alert.alert(title, message); }
};

export default function AddScreen() {
  const { colors: Colors } = useTheme();
  const { user, userProfile } = useAuth();
  const { currentWalletId, currentWallet, isAdmin } = useWallet();
  const styles = getStyles(Colors);

  const [type, setType] = useState('expense'); // 'expense', 'income', 'fixed'
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [memo, setMemo] = useState('');
  const [fundType, setFundType] = useState('shared');

  // 고정 지출/수입용
  const [fixedName, setFixedName] = useState('');
  const [fixedDay, setFixedDay] = useState('');
  const [fixedType, setFixedType] = useState('expense'); // 'expense' or 'income'
  const [fixedFundType, setFixedFundType] = useState('utility'); // 고정지출 출처
  const [fixedCategory, setFixedCategory] = useState(null);
  const [fixedMemo, setFixedMemo] = useState('');

  // 카테고리 인라인 관리 (관리자)
  const [showCatActionModal, setShowCatActionModal] = useState(false);
  const [actionCat, setActionCat] = useState(null); // 롱프레스 대상 카테고리
  const [actionFundType, setActionFundType] = useState(null); // 어느 출처 컨텍스트에서 실행됐는지
  const [showCatAddModal, setShowCatAddModal] = useState(false);
  const [showCatEditModal, setShowCatEditModal] = useState(false);
  const [catEditName, setCatEditName] = useState('');
  const [catEditIcon, setCatEditIcon] = useState('pricetag-outline');

  useEffect(() => { setSelectedCategory(null); }, [type]);
  useEffect(() => { setSelectedCategory(null); }, [fundType]);

  const customFundCats = currentWallet?.customFundCategories || {};
  registerCustomCategories(customFundCats);

  const fixedCatOptions = useMemo(() => {
    if (fixedType === 'income') return INCOME_CATEGORIES;
    return getFundCategories(fixedFundType, customFundCats);
  }, [fixedType, fixedFundType, customFundCats]);
  // 구 customCategories도 공금(shared)에 합산
  const legacyCustom = (currentWallet?.customCategories || []).map(c => ({ id: c.id, name: c.name, icon: c.icon }));
  const currentCategories = type === 'income'
    ? INCOME_CATEGORIES
    : [...getFundCategories(fundType, customFundCats), ...(fundType === 'shared' ? legacyCustom : [])];
  const myWalletName = currentWallet?.members?.[user?.uid]?.name || userProfile?.name || user?.displayName || '미지정';
  const myAllowance = currentWallet?.members?.[user?.uid]?.allowance || 0;

  // 카테고리 롱프레스 → 수정/삭제 (커스텀만)
  const handleCatLongPress = (cat, ctxFundType) => {
    if (!isAdmin) return;
    setActionCat({ ...cat, isCustom: cat.id.startsWith('custom_') });
    setActionFundType(ctxFundType);
    setShowCatActionModal(true);
  };

  const handleDeleteCat = async () => {
    if (!actionCat?.isCustom || !actionFundType) return;
    setShowCatActionModal(false);
    const existing = customFundCats[actionFundType] || [];
    await updateDoc(doc(db, 'wallets', currentWalletId), {
      [`customFundCategories.${actionFundType}`]: existing.filter(c => c.id !== actionCat.id),
    });
    if (selectedCategory === actionCat.id) setSelectedCategory(null);
    if (fixedCategory === actionCat.id) setFixedCategory(null);
  };

  const handleStartEditCat = () => {
    if (!actionCat) return;
    setCatEditName(actionCat.name);
    setCatEditIcon(actionCat.icon);
    setShowCatActionModal(false);
    setShowCatEditModal(true);
  };

  const handleSaveEditCat = async () => {
    if (!catEditName.trim() || !actionCat || !actionFundType) return;
    const existing = customFundCats[actionFundType] || [];
    const updated = existing.map(c => c.id === actionCat.id ? { ...c, name: catEditName.trim(), icon: catEditIcon } : c);
    await updateDoc(doc(db, 'wallets', currentWalletId), {
      [`customFundCategories.${actionFundType}`]: updated,
    });
    setShowCatEditModal(false); setCatEditName(''); setActionCat(null);
  };

  const handleAddNewCat = async () => {
    if (!catEditName.trim()) { showAlert('알림', '이름을 입력해 주세요.'); return; }
    if (!actionFundType) return;
    const id = `custom_${Date.now()}`;
    const newCat = { id, name: catEditName.trim(), icon: catEditIcon };
    const existing = customFundCats[actionFundType] || [];
    await updateDoc(doc(db, 'wallets', currentWalletId), {
      [`customFundCategories.${actionFundType}`]: [...existing, newCat],
    });
    setShowCatAddModal(false); setCatEditName(''); setCatEditIcon('pricetag-outline');
    // 해당 컨텍스트의 선택 카테고리 업데이트
    if (type === 'fixed') setFixedCategory(id);
    else setSelectedCategory(id);
  };

  const handleSave = async () => {
    const numAmount = parseAmount(amount);
    const amtCheck = validateAmount(numAmount);
    if (!amtCheck.valid) { showAlert('알림', amtCheck.message); return; }
    if (!selectedCategory) { showAlert('알림', '카테고리를 선택해 주세요!'); return; }
    if (!currentWalletId) { showAlert('알림', '가계부가 선택되지 않았습니다.'); return; }
    if (!user?.uid) { showAlert('오류', '로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.'); return; }

    try {
      const txData = {
        type,
        amount: numAmount,
        category: selectedCategory,
        memo,
        member: myWalletName,
        userId: user.uid,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      // 지출일 때만 fundType 추가 (유효성 검증)
      if (type === 'expense') {
        txData.fundType = validateFundType(fundType);
      }

      await addDoc(collection(db, 'wallets', currentWalletId, 'transactions'), txData);

      const fundLabel = type === 'expense' ? ` (${FUND_TYPE_MAP[fundType]?.name || '공금'})` : '';
      showAlert('저장 완료! ✅',
        `${myWalletName}님의 ${type === 'expense' ? '지출' : '수입'}${fundLabel}\n${parseAmount(amount).toLocaleString('ko-KR')}원이 기록되었습니다.`
      );

      setAmount(''); setSelectedCategory(null); setMemo('');
    } catch (error) {
      if (__DEV__) console.error('저장 실패:', error);
      showAlert('오류', '저장에 실패했습니다.');
    }
  };

  const handleSaveFixed = async () => {
    const numAmount = parseAmount(amount);
    const amtCheck = validateAmount(numAmount);
    if (!fixedName.trim()) { showAlert('알림', '항목명을 입력해 주세요!'); return; }
    if (!amtCheck.valid) { showAlert('알림', amtCheck.message); return; }
    if (!fixedCategory) { showAlert('알림', '카테고리를 선택해 주세요!'); return; }
    if (!fixedDay) { showAlert('알림', '날짜를 입력해 주세요!'); return; }
    const day = parseInt(fixedDay);
    if (day < 1 || day > 31) { showAlert('알림', '1~31 사이 날짜를 입력해 주세요!'); return; }
    if (!currentWalletId) { showAlert('알림', '가계부가 선택되지 않았습니다.'); return; }
    const label = fixedType === 'income' ? '수입' : '지출';
    try {
      const docData = {
        name: fixedName.trim(), amount: numAmount, day, type: fixedType, category: fixedCategory, memo: fixedMemo,
        active: true, lastRecordedMonth: '', createdAt: new Date().toISOString(),
      };
      if (fixedType === 'expense') docData.fundType = fixedFundType;
      await addDoc(collection(db, 'wallets', currentWalletId, 'fixedExpenses'), docData);
      showAlert('등록 완료! ✅', `고정 ${label} "${fixedName.trim()}"이 등록되었습니다.\n매월 ${day}일에 자동 기록됩니다.`);
      setAmount(''); setFixedName(''); setFixedDay(''); setFixedType('expense'); setFixedFundType('utility'); setFixedCategory(null); setFixedMemo('');
    } catch (error) {
      if (__DEV__) console.error('저장 실패:', error);
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

            {/* 수입/지출/고정지출 토글 */}
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
              {isAdmin && (
                <TouchableOpacity
                  style={[styles.typeButton, type === 'fixed' && styles.typeButtonActiveFixed]}
                  onPress={() => setType('fixed')}
                >
                  <Ionicons name="calendar" size={20} color={type === 'fixed' ? '#FFFFFF' : Colors.primary} />
                  <Text style={[styles.typeButtonText, type === 'fixed' && { color: '#FFFFFF' }]}>고정</Text>
                </TouchableOpacity>
              )}
            </View>

            {type === 'fixed' ? (
              /* ===== 고정 지출/수입 등록 폼 ===== */
              <>
                {/* 지출/수입 서브 토글 */}
                <View style={styles.fixedSubToggle}>
                  <TouchableOpacity
                    style={[styles.fixedSubBtn, fixedType === 'expense' && styles.fixedSubBtnActiveExpense]}
                    onPress={() => { setFixedType('expense'); setFixedName(''); }}
                  >
                    <Ionicons name="arrow-up-circle" size={18} color={fixedType === 'expense' ? Colors.expense : Colors.textGray} />
                    <Text style={[styles.fixedSubBtnText, fixedType === 'expense' && { color: Colors.expense }]}>고정 지출</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.fixedSubBtn, fixedType === 'income' && styles.fixedSubBtnActiveIncome]}
                    onPress={() => { setFixedType('income'); setFixedName(''); }}
                  >
                    <Ionicons name="arrow-down-circle" size={18} color={fixedType === 'income' ? Colors.income : Colors.textGray} />
                    <Text style={[styles.fixedSubBtnText, fixedType === 'income' && { color: Colors.income }]}>고정 수입</Text>
                  </TouchableOpacity>
                </View>

                {/* 1. 지출 출처 선택 (고정 지출일 때만) */}
                {fixedType === 'expense' && (
                  <View style={styles.fundTypeCard}>
                    <Text style={styles.fundTypeLabel}>💳 지출 출처</Text>
                    <View style={styles.fundTypeGrid}>
                      {FUND_TYPES.filter(ft => ft.id !== 'personal').map((ft) => {
                        const isActive = fixedFundType === ft.id;
                        return (
                          <TouchableOpacity
                            key={ft.id}
                            style={[styles.fundTypeChip, isActive && { backgroundColor: ft.color, borderColor: ft.color }]}
                            onPress={() => setFixedFundType(ft.id)}
                          >
                            <Ionicons name={ft.icon} size={16} color={isActive ? '#FFF' : ft.color} />
                            <Text style={[styles.fundTypeChipText, isActive && { color: '#FFF' }]}>{ft.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={styles.fundTypeDescText}>
                      {FUND_TYPE_MAP[fixedFundType]?.desc || ''}
                    </Text>
                  </View>
                )}

                {/* 2. 금액 */}
                <View style={styles.inputCard}>
                  <Text style={styles.inputLabel}>금액</Text>
                  <View style={styles.amountRow}>
                    <TextInput style={styles.amountInput} placeholder="0" placeholderTextColor={Colors.textLight} keyboardType="numeric" value={amount} onChangeText={(t) => setAmount(formatAmountInput(t))} />
                    <Text style={styles.wonText}>원</Text>
                  </View>
                  {amount ? (
                    <View style={styles.amountPreviewRow}>
                      <View style={[styles.amountPreviewDot, { backgroundColor: fixedType === 'income' ? Colors.income : Colors.expense }]} />
                      <Text style={[styles.amountPreview, { color: fixedType === 'income' ? Colors.income : Colors.expense }]}>
                        매월 {fixedType === 'income' ? '+' : '-'}{parseAmount(amount).toLocaleString('ko-KR')}원
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* 3. 항목명 */}
                <View style={styles.inputCard}>
                  <Text style={styles.inputLabel}>항목명</Text>
                  <TextInput
                    style={styles.fixedNameInput}
                    placeholder={fixedType === 'expense' ? '예: 월세, 통신비, 보험료' : '예: 월급, 임대수익, 이자'}
                    placeholderTextColor={Colors.textLight}
                    value={fixedName}
                    onChangeText={setFixedName}
                  />
                </View>

                {/* 4. 카테고리 선택 */}
                <View style={styles.inputCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.inputLabel}>카테고리</Text>
                    {isAdmin && fixedType === 'expense' && <Text style={{ fontSize: 10, color: Colors.textLight, marginBottom: 8 }}>길게 눌러 수정/삭제</Text>}
                  </View>
                  <View style={styles.categoryGrid}>
                    {fixedCatOptions.map((cat) => {
                      const isSelected = fixedCategory === cat.id;
                      const catColor = Colors.category[cat.id] || (fixedType === 'income' ? Colors.income : (FUND_TYPE_MAP[fixedFundType]?.color || Colors.primary));
                      return (
                        <TouchableOpacity
                          key={cat.id}
                          style={[styles.categoryItem, isSelected && { backgroundColor: catColor + '18', borderColor: catColor }]}
                          onPress={() => setFixedCategory(cat.id)}
                          onLongPress={() => fixedType === 'expense' && handleCatLongPress(cat, fixedFundType)}
                          delayLongPress={500}
                        >
                          <View style={[styles.categoryIconBox, { backgroundColor: catColor + (isSelected ? '30' : '12') }]}>
                            <Ionicons name={cat.icon} size={22} color={catColor} />
                          </View>
                          <Text style={[styles.categoryName, isSelected && { color: catColor, fontWeight: 'bold' }]}>{cat.name}</Text>
                          {isSelected && <View style={[styles.categoryCheck, { backgroundColor: catColor }]}><Ionicons name="checkmark" size={10} color="#FFF" /></View>}
                        </TouchableOpacity>
                      );
                    })}
                    {isAdmin && fixedType === 'expense' && (
                      <TouchableOpacity
                        style={[styles.categoryItem, { borderStyle: 'dashed' }]}
                        onPress={() => { setActionFundType(fixedFundType); setCatEditName(''); setCatEditIcon('pricetag-outline'); setShowCatAddModal(true); }}
                      >
                        <View style={[styles.categoryIconBox, { backgroundColor: Colors.primary + '12' }]}>
                          <Ionicons name="add" size={22} color={Colors.primary} />
                        </View>
                        <Text style={[styles.categoryName, { color: Colors.primary }]}>추가</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* 5. 메모 */}
                <View style={styles.inputCard}>
                  <Text style={styles.inputLabel}>메모 (선택사항)</Text>
                  <TextInput style={styles.memoInput} placeholder="예: 신한은행 자동이체" placeholderTextColor={Colors.textLight} value={fixedMemo} onChangeText={setFixedMemo} multiline />
                </View>

                {/* 6. 자동 기록일 */}
                <View style={styles.inputCard}>
                  <Text style={styles.inputLabel}>자동 기록일</Text>
                  <View style={styles.fixedDayRow}>
                    <Text style={styles.fixedDayText}>매월</Text>
                    <TextInput
                      style={styles.fixedDayInput}
                      placeholder="1"
                      placeholderTextColor={Colors.textLight}
                      keyboardType="number-pad"
                      maxLength={2}
                      value={fixedDay}
                      onChangeText={(t) => setFixedDay(t.replace(/[^0-9]/g, ''))}
                    />
                    <Text style={styles.fixedDayText}>일에 자동 기록</Text>
                  </View>
                  <View style={styles.fixedDayHint}>
                    <Ionicons name="information-circle-outline" size={14} color={Colors.textGray} />
                    <Text style={styles.fixedDayHintText}>
                      해당 날짜에 {fixedCategory ? (ALL_CATEGORY_NAMES[fixedCategory] || fixedCategory) : '선택한 카테고리'}로 자동 기록됩니다
                    </Text>
                  </View>
                </View>

                {/* 저장 */}
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveFixed} activeOpacity={0.85}>
                  <LinearGradient
                    colors={fixedType === 'income' ? [Colors.income, '#1FA870'] : [Colors.primary, Colors.gradientEnd]}
                    style={styles.saveGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  >
                    <Ionicons name="calendar" size={22} color="#FFFFFF" />
                    <Text style={styles.saveText}>고정 {fixedType === 'income' ? '수입' : '지출'} 등록하기</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            ) : (
              /* ===== 일반 지출/수입 폼 ===== */
              <>
                {/* 지출 출처 선택 (지출일 때만) */}
                {type === 'expense' && (
                  <View style={styles.fundTypeCard}>
                    <Text style={styles.fundTypeLabel}>💳 지출 출처</Text>
                    <View style={styles.fundTypeGrid}>
                      {FUND_TYPES.map((ft) => {
                        const isActive = fundType === ft.id;
                        const ftColor = ft.color;
                        return (
                          <TouchableOpacity
                            key={ft.id}
                            style={[styles.fundTypeChip, isActive && { backgroundColor: ftColor, borderColor: ftColor }]}
                            onPress={() => setFundType(ft.id)}
                          >
                            <Ionicons name={ft.icon} size={16} color={isActive ? '#FFF' : ftColor} />
                            <Text style={[styles.fundTypeChipText, isActive && { color: '#FFF' }]}>{ft.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={styles.fundTypeDescText}>
                      {FUND_TYPE_MAP[fundType]?.desc || ''}
                    </Text>

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

                {/* 금액 */}
                <View style={styles.inputCard}>
                  <Text style={styles.inputLabel}>금액</Text>
                  <View style={styles.amountRow}>
                    <TextInput style={styles.amountInput} placeholder="0" placeholderTextColor={Colors.textLight} keyboardType="numeric" value={amount} onChangeText={(t) => setAmount(formatAmountInput(t))} />
                    <Text style={styles.wonText}>원</Text>
                  </View>
                  {amount ? (
                    <View style={styles.amountPreviewRow}>
                      <View style={[styles.amountPreviewDot, { backgroundColor: type === 'expense' ? Colors.expense : Colors.income }]} />
                      <Text style={[styles.amountPreview, { color: type === 'expense' ? Colors.expense : Colors.income }]}>
                        {type === 'expense' ? '- ' : '+ '}{parseAmount(amount).toLocaleString('ko-KR')}원
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* 카테고리 */}
                <View style={styles.inputCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.inputLabel}>{type === 'expense' ? '지출 카테고리' : '수입 카테고리'}</Text>
                    {isAdmin && type === 'expense' && <Text style={{ fontSize: 10, color: Colors.textLight, marginBottom: 8 }}>길게 눌러 수정/삭제</Text>}
                  </View>
                  <View style={styles.categoryGrid}>
                    {currentCategories.map((cat) => {
                      const isSelected = selectedCategory === cat.id;
                      const catColor = Colors.category[cat.id] || Colors.primary;
                      return (
                        <TouchableOpacity
                          key={cat.id}
                          style={[styles.categoryItem, isSelected && { backgroundColor: catColor + '18', borderColor: catColor }]}
                          onPress={() => setSelectedCategory(cat.id)}
                          onLongPress={() => handleCatLongPress(cat, fundType)}
                          delayLongPress={500}
                        >
                          <View style={[styles.categoryIconBox, { backgroundColor: catColor + (isSelected ? '30' : '12') }]}>
                            <Ionicons name={cat.icon} size={22} color={catColor} />
                          </View>
                          <Text style={[styles.categoryName, isSelected && { color: catColor, fontWeight: 'bold' }]}>{cat.name}</Text>
                          {isSelected && <View style={[styles.categoryCheck, { backgroundColor: catColor }]}><Ionicons name="checkmark" size={10} color="#FFF" /></View>}
                        </TouchableOpacity>
                      );
                    })}
                    {isAdmin && type === 'expense' && (
                      <TouchableOpacity
                        style={[styles.categoryItem, { borderStyle: 'dashed' }]}
                        onPress={() => { setActionFundType(fundType); setCatEditName(''); setCatEditIcon('pricetag-outline'); setShowCatAddModal(true); }}
                      >
                        <View style={[styles.categoryIconBox, { backgroundColor: Colors.primary + '12' }]}>
                          <Ionicons name="add" size={22} color={Colors.primary} />
                        </View>
                        <Text style={[styles.categoryName, { color: Colors.primary }]}>추가</Text>
                      </TouchableOpacity>
                    )}
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
                      {type === 'expense' ? ` (${FUND_TYPE_MAP[fundType]?.name || '공금'})` : ''}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 카테고리 액션 시트 (롱프레스) */}
      <Modal visible={showCatActionModal} transparent animationType="fade">
        <TouchableOpacity style={styles.actionOverlay} activeOpacity={1} onPress={() => setShowCatActionModal(false)}>
          <View style={styles.actionSheet}>
            <View style={styles.actionHeader}>
              {actionCat && <Ionicons name={actionCat.icon} size={20} color={Colors.primary} />}
              <Text style={styles.actionTitle}>{actionCat?.name}</Text>
              {!actionCat?.isCustom && <View style={styles.actionBasicBadge}><Text style={styles.actionBasicText}>기본</Text></View>}
            </View>
            {actionCat?.isCustom ? (
              <>
                <TouchableOpacity style={styles.actionBtn} onPress={handleStartEditCat}>
                  <Ionicons name="create-outline" size={18} color={Colors.primary} />
                  <Text style={[styles.actionBtnText, { color: Colors.primary }]}>이름/아이콘 수정</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={handleDeleteCat}>
                  <Ionicons name="trash-outline" size={18} color={Colors.expense} />
                  <Text style={[styles.actionBtnText, { color: Colors.expense }]}>삭제</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={{ fontSize: 13, color: Colors.textGray, textAlign: 'center', paddingVertical: 12 }}>기본 카테고리는 수정/삭제할 수 없어요</Text>
            )}
            <TouchableOpacity style={[styles.actionBtn, { borderTopWidth: 1, borderTopColor: Colors.divider }]} onPress={() => setShowCatActionModal(false)}>
              <Text style={[styles.actionBtnText, { color: Colors.textGray }]}>닫기</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 카테고리 추가 모달 */}
      <Modal visible={showCatAddModal} transparent animationType="slide">
        <View style={styles.actionOverlay}><View style={styles.catEditModal}>
          <Text style={styles.catEditTitle}>카테고리 추가</Text>
          <Text style={{ fontSize: 12, color: Colors.textGray, marginBottom: 10 }}>{FUND_TYPE_MAP[actionFundType]?.name || '공금'} 출처에 추가됩니다</Text>
          <TextInput style={styles.catEditInput} placeholder="카테고리 이름" placeholderTextColor={Colors.textLight} value={catEditName} onChangeText={setCatEditName} maxLength={10} />
          <Text style={{ fontSize: 12, color: Colors.textGray, marginBottom: 6 }}>아이콘</Text>
          <View style={styles.catIconGrid}>
            {ICON_OPTIONS.map((icon) => (
              <TouchableOpacity key={icon} style={[styles.catIconOpt, catEditIcon === icon && { backgroundColor: Colors.primary + '20', borderColor: Colors.primary }]} onPress={() => setCatEditIcon(icon)}>
                <Ionicons name={icon} size={18} color={catEditIcon === icon ? Colors.primary : Colors.textGray} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.catEditBtns}>
            <TouchableOpacity style={styles.catEditCancelBtn} onPress={() => setShowCatAddModal(false)}><Text style={{ color: Colors.textGray, fontWeight: '600' }}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.catEditSaveBtn, { backgroundColor: Colors.primary }]} onPress={handleAddNewCat}><Text style={{ color: '#FFF', fontWeight: '700' }}>추가</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* 카테고리 수정 모달 */}
      <Modal visible={showCatEditModal} transparent animationType="slide">
        <View style={styles.actionOverlay}><View style={styles.catEditModal}>
          <Text style={styles.catEditTitle}>카테고리 수정</Text>
          <TextInput style={styles.catEditInput} placeholder="카테고리 이름" placeholderTextColor={Colors.textLight} value={catEditName} onChangeText={setCatEditName} maxLength={10} />
          <Text style={{ fontSize: 12, color: Colors.textGray, marginBottom: 6 }}>아이콘</Text>
          <View style={styles.catIconGrid}>
            {ICON_OPTIONS.map((icon) => (
              <TouchableOpacity key={icon} style={[styles.catIconOpt, catEditIcon === icon && { backgroundColor: Colors.primary + '20', borderColor: Colors.primary }]} onPress={() => setCatEditIcon(icon)}>
                <Ionicons name={icon} size={18} color={catEditIcon === icon ? Colors.primary : Colors.textGray} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.catEditBtns}>
            <TouchableOpacity style={styles.catEditCancelBtn} onPress={() => setShowCatEditModal(false)}><Text style={{ color: Colors.textGray, fontWeight: '600' }}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.catEditSaveBtn, { backgroundColor: Colors.primary }]} onPress={handleSaveEditCat}><Text style={{ color: '#FFF', fontWeight: '700' }}>저장</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
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
  typeButtonActiveFixed: { backgroundColor: Colors.primary },
  // 지출 출처 (6분류)
  fundTypeCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: Colors.border },
  fundTypeLabel: { fontSize: 14, fontWeight: '700', color: Colors.textBlack, marginBottom: 12 },
  fundTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fundTypeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  fundTypeChipText: { fontSize: 13, fontWeight: '700', color: Colors.textDark },
  fundTypeDescText: { fontSize: 12, color: Colors.textGray, marginTop: 10 },
  fundTypeHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider },
  fundTypeHintText: { fontSize: 12, color: Colors.primary, flex: 1, lineHeight: 17 },
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
  // 고정 지출/수입 폼
  fixedSubToggle: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  fixedSubBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: 'transparent' },
  fixedSubBtnText: { fontSize: 14, fontWeight: '700', color: Colors.textGray },
  fixedSubBtnActiveExpense: { backgroundColor: Colors.expense + '12', borderColor: Colors.expense + '40' },
  fixedSubBtnActiveIncome: { backgroundColor: Colors.income + '12', borderColor: Colors.income + '40' },
  fixedNameInput: { fontSize: 18, fontWeight: '700', color: Colors.textBlack, padding: 0, marginBottom: 14 },
  fixedPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fixedPresetChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  fixedPresetText: { fontSize: 13, fontWeight: '600', color: Colors.textGray },
  fixedDayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  fixedDayText: { fontSize: 16, fontWeight: '600', color: Colors.textBlack },
  fixedDayInput: { width: 64, backgroundColor: Colors.background, borderRadius: 12, padding: 12, fontSize: 22, fontWeight: '800', color: Colors.textBlack, textAlign: 'center', borderWidth: 1.5, borderColor: Colors.border },
  fixedDayHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.divider },
  fixedDayHintText: { fontSize: 12, color: Colors.textGray, flex: 1, lineHeight: 17 },
  // 카테고리 액션시트
  actionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 30 },
  actionSheet: { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, width: '100%', maxWidth: 320 },
  actionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  actionTitle: { fontSize: 17, fontWeight: '700', color: Colors.textBlack, flex: 1 },
  actionBasicBadge: { backgroundColor: Colors.background, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  actionBasicText: { fontSize: 10, fontWeight: '600', color: Colors.textGray },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  actionBtnText: { fontSize: 15, fontWeight: '600' },
  // 카테고리 편집 모달
  catEditModal: { backgroundColor: Colors.surface, borderRadius: 20, padding: 24, width: '100%', maxWidth: 340 },
  catEditTitle: { fontSize: 18, fontWeight: '700', color: Colors.textBlack, marginBottom: 12 },
  catEditInput: { backgroundColor: Colors.background, borderRadius: 12, padding: 14, fontSize: 16, color: Colors.textBlack, marginBottom: 12 },
  catIconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  catIconOpt: { width: 38, height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  catEditBtns: { flexDirection: 'row', gap: 10 },
  catEditCancelBtn: { flex: 1, backgroundColor: Colors.background, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  catEditSaveBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
});