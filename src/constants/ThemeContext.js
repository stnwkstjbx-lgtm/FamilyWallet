import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase/firebaseConfig';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const lightColors = {
  gradientStart: '#7C83FF',
  gradientMiddle: '#96BAFF',
  gradientEnd: '#D4E4FF',
  primary: '#5B6BF5',
  primaryDark: '#3A4BD4',
  primaryLight: '#B8C4FF',
  background: '#F5F6FA',
  cardBackground: 'rgba(255, 255, 255, 0.75)',
  white: '#FFFFFF',
  surface: '#FFFFFF',
  textBlack: '#191F28',
  textDark: '#333D4B',
  textGray: '#8B95A1',
  textLight: '#B0B8C1',
  income: '#2BC48A',
  expense: '#F45452',
  warning: '#FFB800',
  tabBar: '#FFFFFF',
  tabBarBorder: 'transparent',
  modalOverlay: 'rgba(0,0,0,0.4)',
  category: {
    food: '#FF6B6B', transport: '#4ECDC4', shopping: '#FFE66D', health: '#2BC48A',
    education: '#5B6BF5', entertainment: '#FF8A5C', housing: '#96BAFF', etc: '#B0B8C1',
    salary: '#2BC48A', bonus: '#4ECDC4', sebaetdon: '#FFD700',
    pocketmoney: '#FF8A5C', interest: '#5B6BF5', sidejob: '#9B59B6', incomeEtc: '#B0B8C1',
  },
};

const darkColors = {
  gradientStart: '#2D1B69',
  gradientMiddle: '#1B2838',
  gradientEnd: '#0D1117',
  primary: '#7C83FF',
  primaryDark: '#5B6BF5',
  primaryLight: '#3D4580',
  background: '#0D1117',
  cardBackground: 'rgba(22, 27, 34, 0.9)',
  white: '#161B22',
  surface: '#1C2128',
  textBlack: '#E6EDF3',
  textDark: '#C9D1D9',
  textGray: '#8B949E',
  textLight: '#484F58',
  income: '#3DDC97',
  expense: '#FF6B6B',
  warning: '#FFD55A',
  tabBar: '#161B22',
  tabBarBorder: '#30363D',
  modalOverlay: 'rgba(0,0,0,0.7)',
  category: {
    food: '#FF6B6B', transport: '#4ECDC4', shopping: '#FFE66D', health: '#3DDC97',
    education: '#7C83FF', entertainment: '#FF8A5C', housing: '#96BAFF', etc: '#8B949E',
    salary: '#3DDC97', bonus: '#4ECDC4', sebaetdon: '#FFD700',
    pocketmoney: '#FF8A5C', interest: '#7C83FF', sidejob: '#B07CFF', incomeEtc: '#8B949E',
  },
};

const ThemeContext = createContext(undefined);

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);
  const [themeLoaded, setThemeLoaded] = useState(false);

  // 사용자별 테마 로드
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const auth = getAuth();
        const currentUser = auth.currentUser;
        if (currentUser) {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists() && userDoc.data().isDark !== undefined) {
            setIsDark(userDoc.data().isDark);
          }
        }
      } catch (error) {
        console.error('테마 로드 실패:', error);
      }
      setThemeLoaded(true);
    };
    loadTheme();

    // 인증 상태 변경 시 다시 로드
    const auth = getAuth();
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) loadTheme();
    });
    return () => unsub();
  }, []);

  const toggleTheme = useCallback(async () => {
    const newValue = !isDark;
    setIsDark(newValue);
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (currentUser) {
        await updateDoc(doc(db, 'users', currentUser.uid), { isDark: newValue });
      }
    } catch (error) {
      console.error('테마 저장 실패:', error);
    }
  }, [isDark]);

  const colors = isDark ? darkColors : lightColors;

  const value = useMemo(() => ({
    colors, isDark, toggleTheme, themeLoaded,
  }), [colors, isDark, toggleTheme, themeLoaded]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
