import React, { createContext, useState, useContext, useEffect } from 'react';
import { Platform } from 'react-native';
import { auth, db } from '../firebase/firebaseConfig';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithCredential,
  sendPasswordResetEmail,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, deleteField } from 'firebase/firestore';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        await loadUserProfile(firebaseUser);
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loadUserProfile = async (firebaseUser) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (userDoc.exists()) {
        setUserProfile(userDoc.data());
      }
    } catch (error) {
      if (__DEV__) console.warn('프로필 로드 실패:', error);
    }
  };

  // Firestore에 사용자 문서 생성 (없을 때만)
  const ensureUserDoc = async (firebaseUser, displayName) => {
    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        const userData = {
          name: displayName || firebaseUser.displayName || '사용자',
          email: firebaseUser.email || '',
          wallets: [],
          isDark: false,
          createdAt: new Date().toISOString(),
        };
        await setDoc(userRef, userData);
        setUserProfile(userData);
      } else {
        setUserProfile(userDoc.data());
      }
    } catch (error) {
      if (__DEV__) console.error('사용자 문서 생성 실패:', error);
    }
  };

  // 이메일 회원가입
  const register = async (email, password, name) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await ensureUserDoc(userCredential.user, name);
      return { success: true };
    } catch (error) {
      let message = '회원가입에 실패했습니다.';
      if (error.code === 'auth/email-already-in-use') message = '이미 사용 중인 이메일입니다.';
      else if (error.code === 'auth/weak-password') message = '비밀번호는 6자 이상이어야 합니다.';
      else if (error.code === 'auth/invalid-email') message = '유효하지 않은 이메일입니다.';
      return { success: false, message };
    }
  };

  // 이메일 로그인
  const login = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      await ensureUserDoc(userCredential.user);
      return { success: true };
    } catch (error) {
      let message = '로그인에 실패했습니다.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') message = '이메일 또는 비밀번호가 올바르지 않습니다.';
      else if (error.code === 'auth/wrong-password') message = '비밀번호가 올바르지 않습니다.';
      return { success: false, message };
    }
  };

  // Google 로그인
  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await ensureUserDoc(result.user, result.user.displayName);
      return { success: true };
    } catch (error) {
      if (__DEV__) console.error('Google 로그인 실패:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        return { success: false, message: '로그인이 취소되었습니다.' };
      }
      return { success: false, message: 'Google 로그인에 실패했습니다.' };
    }
  };

  // Apple 로그인
  const loginWithApple = async () => {
    try {
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');
      const result = await signInWithPopup(auth, provider);
      await ensureUserDoc(result.user, result.user.displayName);
      return { success: true };
    } catch (error) {
      if (__DEV__) console.error('Apple 로그인 실패:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        return { success: false, message: '로그인이 취소되었습니다.' };
      }
      return { success: false, message: 'Apple 로그인에 실패했습니다.' };
    }
  };

  // 비밀번호 재설정 이메일 발송
  const resetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (error) {
      let message = '비밀번호 재설정 이메일 발송에 실패했습니다.';
      if (error.code === 'auth/user-not-found') message = '등록되지 않은 이메일입니다.';
      else if (error.code === 'auth/invalid-email') message = '유효하지 않은 이메일입니다.';
      return { success: false, message };
    }
  };

  // 계정 삭제
  const deleteAccount = async (password) => {
    try {
      if (!user) return { success: false, message: '로그인이 필요합니다.' };

      // 이메일 로그인 사용자인 경우 재인증 필요
      if (password && user.providerData?.[0]?.providerId === 'password') {
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
      }

      // Firestore에서 사용자가 속한 가계부 처리
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const walletIds = userDoc.data()?.wallets || [];

      for (const walletId of walletIds) {
        const walletRef = doc(db, 'wallets', walletId);
        const walletSnap = await getDoc(walletRef);
        if (!walletSnap.exists()) continue;

        const data = walletSnap.data();
        const memberIds = Object.keys(data.members || {});

        if (memberIds.length <= 1) {
          // 마지막 멤버 → 가계부 삭제
          await deleteDoc(walletRef);
        } else {
          // 관리자였으면 다음 멤버에게 위임
          if (data.members[user.uid]?.role === 'admin') {
            const otherAdmins = memberIds.filter(id => id !== user.uid && data.members[id]?.role === 'admin');
            if (otherAdmins.length === 0) {
              const nextAdmin = memberIds.find(id => id !== user.uid);
              if (nextAdmin) {
                await updateDoc(walletRef, { [`members.${nextAdmin}.role`]: 'admin' });
              }
            }
          }
          await updateDoc(walletRef, { [`members.${user.uid}`]: deleteField() });
        }
      }

      // Firestore 사용자 문서 삭제
      await deleteDoc(doc(db, 'users', user.uid));

      // Firebase Auth 계정 삭제
      await deleteUser(user);

      setUser(null);
      setUserProfile(null);
      return { success: true };
    } catch (error) {
      let message = '계정 삭제에 실패했습니다.';
      if (error.code === 'auth/wrong-password') message = '비밀번호가 올바르지 않습니다.';
      else if (error.code === 'auth/requires-recent-login') message = '보안을 위해 다시 로그인 후 시도해 주세요.';
      return { success: false, message };
    }
  };

  // 로그아웃
  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUserProfile(null);
    } catch (error) {
      if (__DEV__) console.error('로그아웃 실패:', error);
    }
  };

  // 프로필 업데이트
  const updateUserProfile = async (updates) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), updates, { merge: true });
      setUserProfile((prev) => ({ ...prev, ...updates }));
    } catch (error) {
      if (__DEV__) console.error('프로필 업데이트 실패:', error);
    }
  };

  return (
    <AuthContext.Provider value={{
      user, userProfile, loading,
      register, login, loginWithGoogle, loginWithApple,
      logout, updateUserProfile, loadUserProfile,
      resetPassword, deleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}