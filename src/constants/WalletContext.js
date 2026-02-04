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
import NotificationService from '../services/NotificationService';
import { ASSET_FUND_TYPES } from './categories';

const WalletContext = createContext();
export const useWallet = () => useContext(WalletContext);

const MAX_WALLETS = 3;
export const maxWallets = MAX_WALLETS;

export function WalletProvider({ children }) {
  const { user } = useAuth();

  const [wallets, setWallets] = useState([]);
  const [currentWalletId, setCurrentWalletId] = useState(null);
  const [currentWallet, setCurrentWallet] = useState(null);
  const [rawTransactions, setRawTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // ══════════════════════════════════════════
  // ★ 계산된 값들 (기존 화면들이 사용)
  // ══════════════════════════════════════════

  // 현재 유저가 관리자인지
  const isAdmin = useMemo(() => {
    if (!user || !currentWallet) return false;
    return currentWallet.members?.[user.uid]?.role === 'admin';
  }, [user, currentWallet]);

  // ★ 비관리자용: 본인 트랜잭션만 필터링
  const transactions = useMemo(() => {
    if (isAdmin) return rawTransactions;
    if (!user) return [];
    return rawTransactions.filter((tx) =>
      tx.userId === user.uid ||
      tx.memberId === user.uid ||
      (tx.fundType === 'allowance_allocation' && tx.allocatedTo === user.uid)
    );
  }, [rawTransactions, isAdmin, user]);

  // ★ 공금 예산 사용률 (전 멤버 공유, rawTransactions 기반)
  const sharedBudgetInfo = useMemo(() => {
    const budget = currentWallet?.monthlyBudget || 0;
    if (budget <= 0) return null;
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const spent = rawTransactions
      .filter((tx) => {
        if (tx.type !== 'expense') return false;
        if (tx.fundType === 'personal' || tx.fundType === 'allowance_allocation') return false;
        return (tx.date?.slice(0, 7) || '') === ym;
      })
      .reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const pct = Math.min(Math.round((spent / budget) * 100), 999);
    return { budget, spent, remaining: budget - spent, pct };
  }, [currentWallet, rawTransactions]);

  // ★ 누적 자산 통계 (예적금, 투자, 비상금 - 전체 기간)
  const accumulatedFunds = useMemo(() => {
    const result = { savings: 0, investment: 0, emergency: 0 };
    rawTransactions.forEach((tx) => {
      if (tx.type === 'expense' && ASSET_FUND_TYPES.includes(tx.fundType)) {
        result[tx.fundType] += tx.amount || 0;
      }
    });
    result.total = result.savings + result.investment + result.emergency;
    return result;
  }, [rawTransactions]);

  // ★ 이번 달 fundType별 지출 내역 (대시보드용, rawTransactions 기반)
  const monthlyFundBreakdown = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const result = { shared: 0, personal: 0, utility: 0, savings: 0, investment: 0, emergency: 0 };
    rawTransactions.forEach((tx) => {
      if (tx.type !== 'expense') return;
      if (tx.fundType === 'allowance_allocation') return;
      const txYm = tx.date?.slice(0, 7) || '';
      if (txYm !== ym) return;
      const ft = tx.fundType || 'shared';
      if (result[ft] !== undefined) result[ft] += tx.amount || 0;
    });
    result.totalExpense = Object.values(result).reduce((s, v) => s + v, 0);
    result.netExpense = result.shared + result.personal + result.utility; // 순지출 (자산이전 제외)
    return result;
  }, [rawTransactions]);

  // ★ 비관리자용: 다른 멤버의 용돈 정보 숨기기
  const sanitizedWallet = useMemo(() => {
    if (!currentWallet || isAdmin) return currentWallet;
    if (!user) return currentWallet;
    const members = currentWallet.members || {};
    const sanitized = {};
    for (const [uid, data] of Object.entries(members)) {
      if (uid === user.uid) {
        sanitized[uid] = data; // 본인 데이터는 그대로
      } else {
        // 다른 멤버: 이름과 역할만 노출, 용돈 금액 숨김
        sanitized[uid] = { name: data.name, role: data.role };
      }
    }
    return { ...currentWallet, members: sanitized };
  }, [currentWallet, isAdmin, user]);

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
  const createWallet = async (name, nickname) => {
    try {
      if (!user) return { success: false, message: '로그인이 필요합니다' };
      if (wallets.length >= MAX_WALLETS) return { success: false, message: `최대 ${MAX_WALLETS}개의 가계부만 만들 수 있어요` };
      if (!nickname || !nickname.trim()) return { success: false, message: '닉네임을 입력해 주세요' };

      const inviteCode = generateInviteCode();
      const walletRef = doc(collection(db, 'wallets'));
      const walletData = {
        name,
        inviteCode,
        createdBy: user.uid,
        members: {
          [user.uid]: {
            name: nickname.trim(),
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

      return { success: true, walletId: walletRef.id, inviteCode };
    } catch (error) {
      return { success: false, message: error.message || '가계부 생성에 실패했습니다' };
    }
  };

  // 초대코드로 합류
  const joinWallet = async (code, nickname) => {
    try {
      if (!user) return { success: false, message: '로그인이 필요합니다' };
      if (wallets.length >= MAX_WALLETS) return { success: false, message: `최대 ${MAX_WALLETS}개의 가계부만 참여할 수 있어요` };
      if (!nickname || !nickname.trim()) return { success: false, message: '닉네임을 입력해 주세요' };

      const walletsRef = collection(db, 'wallets');
      const q = query(walletsRef, where('inviteCode', '==', code.toUpperCase()));
      const snap = await getDocs(q);

      if (snap.empty) return { success: false, message: '유효하지 않은 초대코드예요' };

      const walletDoc = snap.docs[0];
      const walletData = walletDoc.data();

      if (walletData.members[user.uid]) return { success: false, message: '이미 참여 중인 가계부예요' };

      await updateDoc(doc(db, 'wallets', walletDoc.id), {
        [`members.${user.uid}`]: {
          name: nickname.trim(),
          role: 'member',
          monthlyAllowance: 0,
        },
      });

      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      const currentWallets = userSnap.data()?.wallets || [];
      await updateDoc(userRef, { wallets: [...currentWallets, walletDoc.id] });

      return { success: true, walletId: walletDoc.id, walletName: walletData.name };
    } catch (error) {
      return { success: false, message: error.message || '가계부 합류에 실패했습니다' };
    }
  };

  // 가계부 전환 (유효성 검증 포함)
  const switchWallet = (walletId) => {
    if (!walletId) return;
    const exists = wallets.some((w) => w.id === walletId);
    if (!exists) {
      if (__DEV__) console.warn('switchWallet: 유효하지 않은 가계부 ID:', walletId);
      return;
    }
    setCurrentWalletId(walletId);
  };

  // 가계부 나가기
  const leaveWallet = async (walletId) => {
    try {
      if (!user) return { success: false, message: '로그인이 필요합니다' };
      const walletRef = doc(db, 'wallets', walletId);
      const walletSnap = await getDoc(walletRef);
      if (!walletSnap.exists()) return { success: false, message: '가계부를 찾을 수 없습니다' };

      const data = walletSnap.data();
      const memberIds = Object.keys(data.members);

      if (memberIds.length === 1) {
        await deleteDoc(walletRef);
      } else if (data.members[user.uid]?.role === 'admin') {
        // 다른 관리자가 있는지 확인
        const otherAdmins = memberIds.filter(id => id !== user.uid && data.members[id]?.role === 'admin');
        if (otherAdmins.length > 0) {
          // 다른 관리자가 있으면 그냥 나가기
          await updateDoc(walletRef, {
            [`members.${user.uid}`]: deleteField(),
          });
        } else {
          // 관리자가 나 혼자면 다음 멤버에게 관리자 위임
          const nextAdminId = memberIds.find((id) => id !== user.uid);
          await updateDoc(walletRef, {
            [`members.${nextAdminId}.role`]: 'admin',
            [`members.${user.uid}`]: deleteField(),
          });
        }
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
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message || '나가기에 실패했습니다' };
    }
  };

  // 관리자 지정/해제 (최대 3명)
  const MAX_ADMINS = 3;
  const toggleAdmin = async (targetUid) => {
    try {
      if (!currentWalletId || !isAdmin || !user) return { success: false, message: '권한이 없습니다' };
      if (targetUid === user.uid) return { success: false, message: '본인의 권한은 변경할 수 없습니다' };

      const members = currentWallet?.members || {};
      const targetMember = members[targetUid];
      if (!targetMember) return { success: false, message: '멤버를 찾을 수 없습니다' };

      const isTargetAdmin = targetMember.role === 'admin';

      if (isTargetAdmin) {
        // 관리자 해제
        await updateDoc(doc(db, 'wallets', currentWalletId), {
          [`members.${targetUid}.role`]: 'member',
        });
        return { success: true, newRole: 'member' };
      } else {
        // 관리자 지정 - 최대 인원 확인
        const adminCount = Object.values(members).filter(m => m.role === 'admin').length;
        if (adminCount >= MAX_ADMINS) {
          return { success: false, message: `관리자는 최대 ${MAX_ADMINS}명까지 지정할 수 있습니다` };
        }
        await updateDoc(doc(db, 'wallets', currentWalletId), {
          [`members.${targetUid}.role`]: 'admin',
        });
        return { success: true, newRole: 'admin' };
      }
    } catch (error) {
      return { success: false, message: error.message || '권한 변경에 실패했습니다' };
    }
  };

  // 가계부 목록으로 이동
  const goToWalletList = () => setCurrentWalletId(null);

  // ══════════════════════════════════════════
  // ★ 초대코드 관련 (SettingsScreen에서 사용)
  // ══════════════════════════════════════════

  // 초대코드 재생성
  const regenerateInviteCode = async () => {
    try {
      if (!currentWalletId || !isAdmin) return { success: false, message: '권한이 없습니다' };
      const newCode = generateInviteCode();
      await updateDoc(doc(db, 'wallets', currentWalletId), { inviteCode: newCode });
      return { success: true, inviteCode: newCode };
    } catch (error) {
      return { success: false, message: error.message || '코드 재생성에 실패했습니다' };
    }
  };

  // 초대 딥링크 URL 반환
  const getInviteLink = () => {
    if (!currentWallet?.inviteCode) return '';
    return `familywallet://join?code=${currentWallet.inviteCode}`;
  };

  // 공유용 초대 메시지 반환
  const getInviteMessage = () => {
    if (!currentWallet?.inviteCode || !currentWallet?.name) return '';
    const code = currentWallet.inviteCode;
    const deepLink = `familywallet://join?code=${code}`;
    return `[패밀리월렛] "${currentWallet.name}" 가계부에 초대합니다!\n\n` +
      `아래 초대코드를 앱에서 입력해 주세요.\n\n` +
      `초대코드: ${code}\n\n` +
      `앱 설치 후 → "기존 가계부 합류" → 코드 입력\n` +
      `또는 링크 탭: ${deepLink}`;
  };

  // ══════════════════════════════════════════
  // ★ 공금 월 예산 설정 (관리자 전용)
  // ══════════════════════════════════════════

  const setSharedBudget = async (amount) => {
    if (!currentWalletId || !isAdmin) return { success: false, message: '권한이 없습니다' };
    if (typeof amount !== 'number' || amount < 0) return { success: false, message: '유효하지 않은 금액입니다' };
    try {
      await updateDoc(doc(db, 'wallets', currentWalletId), { monthlyBudget: amount });
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message || '예산 설정에 실패했습니다' };
    }
  };

  // ══════════════════════════════════════════
  // 트랜잭션 추가
  // ══════════════════════════════════════════

  const addTransaction = async (transactionData) => {
    if (!currentWalletId || !user) return;
    if (!transactionData?.amount || typeof transactionData.amount !== 'number' || transactionData.amount <= 0) return;
    const txRef = collection(db, 'wallets', currentWalletId, 'transactions');
    const myNickname = currentWallet?.members?.[user.uid]?.name || user.displayName || user.email;
    await addDoc(txRef, {
      ...transactionData,
      memberId: user.uid,
      memberName: myNickname,
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
    if (!memberId || typeof amount !== 'number' || amount < 0) {
      throw new Error('유효하지 않은 용돈 배분 데이터입니다');
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

    const myNickname = currentWallet?.members?.[user.uid]?.name || user.displayName || user.email;
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
      memberName: myNickname,
      createdAt: new Date().toISOString(),
    });
  };

  const addPersonalExpense = async ({ category, amount, description, date }) => {
    if (!currentWalletId || !user) return;

    const myNickname = currentWallet?.members?.[user.uid]?.name || user.displayName || user.email;
    const txRef = collection(db, 'wallets', currentWalletId, 'transactions');
    await addDoc(txRef, {
      type: 'expense',
      fundType: 'personal',
      category,
      amount,
      description,
      date: date || new Date().toISOString().slice(0, 10),
      memberId: user.uid,
      memberName: myNickname,
      createdAt: new Date().toISOString(),
    });
  };

  // ══════════════════════════════════════════
  // ★ 용돈 요청 시스템
  // ══════════════════════════════════════════

  const requestAllowance = async (amount, message) => {
    if (!currentWalletId || !user) return { success: false, message: '로그인이 필요합니다' };
    try {
      const myNickname = currentWallet?.members?.[user.uid]?.name || user.displayName || '사용자';
      const reqRef = collection(db, 'wallets', currentWalletId, 'allowanceRequests');
      await addDoc(reqRef, {
        userId: user.uid,
        userName: myNickname,
        amount,
        message: message || '',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      // 관리자에게 알림
      NotificationService.notifyAllowanceRequest({ userName: myNickname, amount, message });
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message || '요청에 실패했습니다' };
    }
  };

  const respondToAllowanceRequest = async (requestId, approved, finalAmount) => {
    if (!currentWalletId || !user || !isAdmin) return { success: false, message: '권한이 없습니다' };
    try {
      const reqRef = doc(db, 'wallets', currentWalletId, 'allowanceRequests', requestId);
      const reqSnap = await getDoc(reqRef);
      if (!reqSnap.exists()) return { success: false, message: '요청을 찾을 수 없습니다' };

      const reqData = reqSnap.data();

      if (approved) {
        // 용돈 설정
        await updateDoc(doc(db, 'wallets', currentWalletId), {
          [`members.${reqData.userId}.allowance`]: finalAmount,
          [`members.${reqData.userId}.monthlyAllowance`]: finalAmount,
        });
      }

      // 요청 상태 업데이트
      await updateDoc(reqRef, {
        status: approved ? 'approved' : 'rejected',
        respondedAmount: approved ? finalAmount : null,
        respondedAt: new Date().toISOString(),
        respondedBy: user.uid,
      });

      // 요청자에게 알림
      NotificationService.notifyAllowanceResponse({ approved, amount: finalAmount });

      return { success: true };
    } catch (error) {
      return { success: false, message: error.message || '처리에 실패했습니다' };
    }
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

  // ★ 관리자 전용: 가족 전체 지출/수입 조회
  const getFamilyTotalExpense = useCallback(
    (yearMonth) => {
      if (!isAdmin) return 0;
      return rawTransactions
        .filter((tx) => {
          if (tx.type !== 'expense') return false;
          if (tx.fundType === 'personal') return false;
          const txMonth = tx.date?.slice(0, 7);
          return txMonth === yearMonth;
        })
        .reduce((sum, tx) => sum + (tx.amount || 0), 0);
    },
    [rawTransactions, isAdmin]
  );

  const getFamilyTotalIncome = useCallback(
    (yearMonth) => {
      if (!isAdmin) return 0;
      return rawTransactions
        .filter((tx) => {
          if (tx.type !== 'income') return false;
          const txMonth = tx.date?.slice(0, 7);
          return txMonth === yearMonth;
        })
        .reduce((sum, tx) => sum + (tx.amount || 0), 0);
    },
    [rawTransactions, isAdmin]
  );

  // ══════════════════════════════════════════
  // Firestore 리스너
  // ══════════════════════════════════════════

  // 푸시 알림 초기화
  useEffect(() => {
    if (user) {
      NotificationService.registerForPushNotifications().then((token) => {
        if (token) {
          // 토큰을 사용자 문서에 저장 (추후 서버 푸시용)
          setDoc(doc(db, 'users', user.uid), { pushToken: token }, { merge: true }).catch(() => {});
        }
      });
    }
  }, [user]);

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
      setRawTransactions([]);
      return;
    }

    const txRef = collection(db, 'wallets', currentWalletId, 'transactions');
    const q = query(txRef, orderBy('date', 'desc'));

    const unsub = onSnapshot(q, (snap) => {
      const txList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRawTransactions(txList);
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
    currentWallet: sanitizedWallet,  // ★ 비관리자는 다른 멤버 용돈 정보 숨김
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
    toggleAdmin,
    
    // 초대코드 관련
    regenerateInviteCode,
    getInviteLink,
    getInviteMessage,

    // 공금 예산
    setSharedBudget,
    sharedBudgetInfo,

    // ★ 자산 누적 & 월별 분류
    accumulatedFunds,
    monthlyFundBreakdown,

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

    // ★ 용돈 요청 시스템
    requestAllowance,
    respondToAllowanceRequest,

    // ★ 알림 서비스
    notificationService: NotificationService,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}