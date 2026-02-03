/**
 * WalletContext.js
 * ─────────────────────────────────────────────
 * 완전한 버전 (기존 기능 + 용돈 시스템)
 * ─────────────────────────────────────────────
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { useAuth } from './AuthContext';

const WalletContext = createContext();
export const useWallet = () => useContext(WalletContext);

const MAX_WALLETS = 3;
export const maxWallets = MAX_WALLETS;

export function WalletProvider({ children }) {
  const { user } = useAuth();

  const [wallets, setWallets] = useState([]);
  const [currentWalletId, setCurrentWalletId] = useState(null);
  const [currentWallet, setCurrentWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // ══════════════════════════════════════════
  // ★ 계산된 값들 (기존 화면들이 사용)
  // ══════════════════════════════════════════

  // 현재 유저가 관리자인지
  const isAdmin = useMemo(() => {
    if (!user || !currentWallet) return false;
    return currentWallet.members?.[user.uid]?.role === 'admin';
  }, [user, currentWallet]);

  // 유저의 가계부 목록 (wallets와 동일, 호환성 위해)
  const userWallets = wallets;

  // ══════════════════════════════════════════
  // 6자리 초대코드 생성
  // ══════════════════════════════════════════

  const generateInviteCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  };

  // ══════════════════════════════════════════
  // 가계부 CRUD
  // ══════════════════════════════════════════

  // 가계부 생성
  const createWallet = async (name) => {
    if (!user) throw new Error('로그인이 필요합니다');
    if (wallets.length >= MAX_WALLETS) throw new Error(`최대 ${MAX_WALLETS}개의 가계부만 만들 수 있어요`);

    const inviteCode = generateInviteCode();
    const walletRef = doc(collection(db, 'wallets'));
    const walletData = {
      name,
      inviteCode,
      createdBy: user.uid,
      members: {
        [user.uid]: {
          name: user.displayName || user.email,
          role: 'admin',
          monthlyAllowance: 0,
        },
      },
      fixedExpenses: [],
      createdAt: new Date().toISOString(),
    };

    await setDoc(walletRef, walletData);

    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    const currentWallets = userSnap.data()?.wallets || [];
    await updateDoc(userRef, { wallets: [...currentWallets, walletRef.id] });

    return walletRef.id;
  };

  // 초대코드로 합류
  const joinWallet = async (inviteCode) => {
    if (!user) throw new Error('로그인이 필요합니다');
    if (wallets.length >= MAX_WALLETS) throw new Error(`최대 ${MAX_WALLETS}개의 가계부만 참여할 수 있어요`);

    const walletsRef = collection(db, 'wallets');
    const q = query(walletsRef, where('inviteCode', '==', inviteCode.toUpperCase()));
    const snap = await getDocs(q);

    if (snap.empty) throw new Error('유효하지 않은 초대코드예요');

    const walletDoc = snap.docs[0];
    const walletData = walletDoc.data();

    if (walletData.members[user.uid]) throw new Error('이미 참여 중인 가계부예요');

    await updateDoc(doc(db, 'wallets', walletDoc.id), {
      [`members.${user.uid}`]: {
        name: user.displayName || user.email,
        role: 'member',
        monthlyAllowance: 0,
      },
    });

    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    const currentWallets = userSnap.data()?.wallets || [];
    await updateDoc(userRef, { wallets: [...currentWallets, walletDoc.id] });

    return walletDoc.id;
  };

  // 가계부 전환
  const switchWallet = (walletId) => {
    setCurrentWalletId(walletId);
  };

  // 가계부 나가기
  const leaveWallet = async (walletId) => {
    if (!user) return;
    const walletRef = doc(db, 'wallets', walletId);
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) return;

    const data = walletSnap.data();
    const memberIds = Object.keys(data.members);

    if (memberIds.length === 1) {
      await deleteDoc(walletRef);
    } else if (data.members[user.uid]?.role === 'admin') {
      const nextAdminId = memberIds.find((id) => id !== user.uid);
      await updateDoc(walletRef, {
        [`members.${nextAdminId}.role`]: 'admin',
        [`members.${user.uid}`]: deleteField(),
      });
    } else {
      await updateDoc(walletRef, {
        [`members.${user.uid}`]: deleteField(),
      });
    }

    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    const currentWallets = (userSnap.data()?.wallets || []).filter((id) => id !== walletId);
    await updateDoc(userRef, { wallets: currentWallets });

    if (currentWalletId === walletId) setCurrentWalletId(null);
  };

  // 가계부 목록으로 이동
  const goToWalletList = () => setCurrentWalletId(null);

  // ══════════════════════════════════════════
  // ★ 초대코드 관련 (SettingsScreen에서 사용)
  // ══════════════════════════════════════════

  // 초대코드 재생성
  const regenerateInviteCode = async () => {
    if (!currentWalletId || !isAdmin) return null;
    const newCode = generateInviteCode();
    await updateDoc(doc(db, 'wallets', currentWalletId), { inviteCode: newCode });
    return newCode;
  };

  // 초대 링크 가져오기
  const getInviteLink = () => {
    if (!currentWallet?.inviteCode) return '';
    return `패밀리월렛 초대코드: ${currentWallet.inviteCode}`;
  };

  // ══════════════════════════════════════════
  // 트랜잭션 추가
  // ══════════════════════════════════════════

  const addTransaction = async (transactionData) => {
    if (!currentWalletId || !user) return;
    const txRef = collection(db, 'wallets', currentWalletId, 'transactions');
    await addDoc(txRef, {
      ...transactionData,
      memberId: user.uid,
      memberName: user.displayName || user.email,
      createdAt: new Date().toISOString(),
    });
  };

  // ══════════════════════════════════════════
  // ★ 용돈 배분 시스템
  // ══════════════════════════════════════════

  const allocateAllowance = async (memberId, amount, yearMonth) => {
    if (!currentWalletId || !user) return;
    if (!isAdmin) {
      throw new Error('관리자만 용돈을 배분할 수 있어요');
    }

    const now = new Date();
    const ym = yearMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const memberName = currentWallet?.members?.[memberId]?.name || '멤버';

    await updateDoc(doc(db, 'wallets', currentWalletId), {
      [`members.${memberId}.monthlyAllowance`]: amount,
    });

    const txRef = collection(db, 'wallets', currentWalletId, 'transactions');
    const existingQ = query(
      txRef,
      where('fundType', '==', 'allowance_allocation'),
      where('allocatedTo', '==', memberId),
      where('allocMonth', '==', ym)
    );
    const existingSnap = await getDocs(existingQ);
    for (const d of existingSnap.docs) {
      await deleteDoc(d.ref);
    }

    await addDoc(txRef, {
      type: 'expense',
      fundType: 'allowance_allocation',
      category: '용돈',
      amount,
      description: `${memberName} 용돈 (${ym})`,
      date: `${ym}-01`,
      allocMonth: ym,
      allocatedTo: memberId,
      allocatedToName: memberName,
      memberId: user.uid,
      memberName: user.displayName || user.email,
      createdAt: new Date().toISOString(),
    });
  };

  const addPersonalExpense = async ({ category, amount, description, date }) => {
    if (!currentWalletId || !user) return;

    const txRef = collection(db, 'wallets', currentWalletId, 'transactions');
    await addDoc(txRef, {
      type: 'expense',
      fundType: 'personal',
      category,
      amount,
      description,
      date: date || new Date().toISOString().slice(0, 10),
      memberId: user.uid,
      memberName: user.displayName || user.email,
      createdAt: new Date().toISOString(),
    });
  };

  // ══════════════════════════════════════════
  // ★ 용돈 조회 함수들
  // ══════════════════════════════════════════

  const getMyAllowanceForMonth = useCallback(
    (yearMonth) => {
      if (!user) return 0;
      const allocation = transactions.find(
        (tx) =>
          tx.fundType === 'allowance_allocation' &&
          tx.allocatedTo === user.uid &&
          tx.allocMonth === yearMonth
      );
      return allocation?.amount || 0;
    },
    [transactions, user]
  );

  const getMyPersonalSpendingForMonth = useCallback(
    (yearMonth) => {
      if (!user) return 0;
      return transactions
        .filter((tx) => {
          if (tx.fundType !== 'personal' || tx.memberId !== user.uid) return false;
          const txMonth = tx.date?.slice(0, 7);
          return txMonth === yearMonth;
        })
        .reduce((sum, tx) => sum + (tx.amount || 0), 0);
    },
    [transactions, user]
  );

  const getMyAllowanceRemaining = useCallback(
    (yearMonth) => {
      const allocated = getMyAllowanceForMonth(yearMonth);
      const spent = getMyPersonalSpendingForMonth(yearMonth);
      return allocated - spent;
    },
    [getMyAllowanceForMonth, getMyPersonalSpendingForMonth]
  );

  const getAllowanceReport = useCallback(() => {
    if (!user) return null;

    const now = new Date();
    const months = [];

    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const currentMonth = months[0];
    const lastMonth = months[1];

    const currentAllocation = getMyAllowanceForMonth(currentMonth);
    const currentSpending = getMyPersonalSpendingForMonth(currentMonth);
    const currentRemaining = currentAllocation - currentSpending;

    const lastAllocation = getMyAllowanceForMonth(lastMonth);
    const lastSpending = getMyPersonalSpendingForMonth(lastMonth);
    const lastRemaining = lastAllocation - lastSpending;

    const recentMonths = months.slice(1, 4);
    let totalRemaining = 0;
    let validMonthCount = 0;

    recentMonths.forEach((ym) => {
      const alloc = getMyAllowanceForMonth(ym);
      if (alloc > 0) {
        const spent = getMyPersonalSpendingForMonth(ym);
        totalRemaining += alloc - spent;
        validMonthCount++;
      }
    });

    const avg3MonthRemaining = validMonthCount > 0 ? Math.round(totalRemaining / validMonthCount) : 0;
    const projectedYearlySavings = avg3MonthRemaining * 12;

    const currentMonthPersonalTxs = transactions.filter(
      (tx) =>
        tx.fundType === 'personal' &&
        tx.memberId === user.uid &&
        tx.date?.slice(0, 7) === currentMonth
    );

    return {
      currentMonth,
      lastMonth,
      current: {
        allocation: currentAllocation,
        spending: currentSpending,
        remaining: currentRemaining,
      },
      last: {
        allocation: lastAllocation,
        spending: lastSpending,
        remaining: lastRemaining,
      },
      avg3MonthRemaining,
      projectedYearlySavings,
      currentMonthPersonalTxs,
    };
  }, [user, transactions, getMyAllowanceForMonth, getMyPersonalSpendingForMonth]);

  const getFamilyTotalExpense = useCallback(
    (yearMonth) => {
      return transactions
        .filter((tx) => {
          if (tx.type !== 'expense') return false;
          if (tx.fundType === 'personal') return false;
          const txMonth = tx.date?.slice(0, 7);
          return txMonth === yearMonth;
        })
        .reduce((sum, tx) => sum + (tx.amount || 0), 0);
    },
    [transactions]
  );

  const getFamilyTotalIncome = useCallback(
    (yearMonth) => {
      return transactions
        .filter((tx) => {
          if (tx.type !== 'income') return false;
          const txMonth = tx.date?.slice(0, 7);
          return txMonth === yearMonth;
        })
        .reduce((sum, tx) => sum + (tx.amount || 0), 0);
    },
    [transactions]
  );

  // ══════════════════════════════════════════
  // Firestore 리스너
  // ══════════════════════════════════════════

  useEffect(() => {
    if (!user) {
      setWallets([]);
      setCurrentWalletId(null);
      setLoading(false);
      return;
    }

    const userRef = doc(db, 'users', user.uid);
    const unsub = onSnapshot(userRef, async (snap) => {
      const walletIds = snap.data()?.wallets || [];
      const walletList = [];

      for (const wid of walletIds) {
        const wSnap = await getDoc(doc(db, 'wallets', wid));
        if (wSnap.exists()) {
          walletList.push({ id: wSnap.id, ...wSnap.data() });
        }
      }

      setWallets(walletList);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!currentWalletId) {
      setCurrentWallet(null);
      return;
    }

    const unsub = onSnapshot(doc(db, 'wallets', currentWalletId), (snap) => {
      if (snap.exists()) {
        setCurrentWallet({ id: snap.id, ...snap.data() });
      }
    });

    return () => unsub();
  }, [currentWalletId]);

  useEffect(() => {
    if (!currentWalletId) {
      setTransactions([]);
      return;
    }

    const txRef = collection(db, 'wallets', currentWalletId, 'transactions');
    const q = query(txRef, orderBy('date', 'desc'));

    const unsub = onSnapshot(q, (snap) => {
      const txList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTransactions(txList);
    });

    return () => unsub();
  }, [currentWalletId]);

  // ══════════════════════════════════════════
  // Context Value
  // ══════════════════════════════════════════

  const value = {
    // 기존 (다른 화면에서 사용)
    wallets,
    userWallets,  // SettingsScreen 호환
    currentWalletId,
    currentWallet,
    transactions,
    loading,
    isAdmin,      // ★ HomeScreen, SettingsScreen에서 사용
    maxWallets,   // SettingsScreen에서 사용
    
    // 가계부 CRUD
    createWallet,
    joinWallet,
    switchWallet,
    leaveWallet,
    goToWalletList,
    
    // 초대코드 관련
    regenerateInviteCode,
    getInviteLink,
    
    // 트랜잭션
    addTransaction,

    // ★ 용돈 시스템
    allocateAllowance,
    addPersonalExpense,
    getMyAllowanceForMonth,
    getMyPersonalSpendingForMonth,
    getMyAllowanceRemaining,
    getAllowanceReport,
    getFamilyTotalExpense,
    getFamilyTotalIncome,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}