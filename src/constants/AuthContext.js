import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
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
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUserProfile = useCallback(async (firebaseUser) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (userDoc.exists()) {
        setUserProfile(userDoc.data());
      }
    } catch (error) {
      console.error('프로필 로드 실패:', error);
    }
  }, []);

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
  }, [loadUserProfile]);

  // Firestore에 사용자 문서 생성 (없을 때만)
  const ensureUserDoc = useCallback(async (firebaseUser, displayName) => {
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
      console.error('사용자 문서 생성 실패:', error);
    }
  }, []);

  // 이메일 회원가입
  const register = useCallback(async (email, password, name) => {
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
  }, [ensureUserDoc]);

  // 이메일 로그인
  const login = useCallback(async (email, password) => {
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
  }, [ensureUserDoc]);

  // Google 로그인
  const loginWithGoogle = useCallback(async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await ensureUserDoc(result.user, result.user.displayName);
      return { success: true };
    } catch (error) {
      console.error('Google 로그인 실패:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        return { success: false, message: '로그인이 취소되었습니다.' };
      }
      return { success: false, message: 'Google 로그인에 실패했습니다.' };
    }
  }, [ensureUserDoc]);

  // Apple 로그인
  const loginWithApple = useCallback(async () => {
    try {
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');
      const result = await signInWithPopup(auth, provider);
      await ensureUserDoc(result.user, result.user.displayName);
      return { success: true };
    } catch (error) {
      console.error('Apple 로그인 실패:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        return { success: false, message: '로그인이 취소되었습니다.' };
      }
      return { success: false, message: 'Apple 로그인에 실패했습니다.' };
    }
  }, [ensureUserDoc]);

  // 로그아웃
  const logout = useCallback(async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUserProfile(null);
    } catch (error) {
      console.error('로그아웃 실패:', error);
    }
  }, []);

  // 프로필 업데이트
  const updateUserProfile = useCallback(async (updates) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), updates, { merge: true });
      setUserProfile((prev) => ({ ...prev, ...updates }));
    } catch (error) {
      console.error('프로필 업데이트 실패:', error);
    }
  }, [user]);

  const value = useMemo(() => ({
    user, userProfile, loading,
    register, login, loginWithGoogle, loginWithApple,
    logout, updateUserProfile, loadUserProfile,
  }), [user, userProfile, loading, register, login, loginWithGoogle, loginWithApple, logout, updateUserProfile, loadUserProfile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
