import React, { createContext, useState, useContext, useEffect } from 'react';
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
  background: '#F0F1F5',
  cardBackground: 'rgba(255, 255, 255, 0.75)',
  white: '#FFFFFF',
  surface: '#FFFFFF',
  border: '#D8DCE4',
  divider: '#E5E8ED',
  textBlack: '#191F28',
  textDark: '#333D4B',
  textGray: '#6B7684',
  textLight: '#A0A8B4',
  income: '#059669',
  expense: '#DC2626',
  warning: '#D97706',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E5E8ED',
  modalOverlay: 'rgba(0,0,0,0.4)',
  shadow: { color: '#000', opacity: 0.1 },
  category: {
    food: '#DC2626', transport: '#0D9488', shopping: '#CA8A04', health: '#059669',
    education: '#4F46E5', entertainment: '#EA580C', housing: '#2563EB', etc: '#6B7280',
    salary: '#059669', bonus: '#0D9488', sebaetdon: '#CA8A04',
    pocketmoney: '#EA580C', interest: '#4F46E5', sidejob: '#7C3AED', incomeEtc: '#6B7280',
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
  border: '#30363D',
  divider: '#21262D',
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
  shadow: { color: '#000', opacity: 0.3 },
  category: {
    food: '#FF6B6B', transport: '#4ECDC4', shopping: '#FFE66D', health: '#3DDC97',
    education: '#7C83FF', entertainment: '#FF8A5C', housing: '#96BAFF', etc: '#8B949E',
    salary: '#3DDC97', bonus: '#4ECDC4', sebaetdon: '#FFD700',
    pocketmoney: '#FF8A5C', interest: '#7C83FF', sidejob: '#B07CFF', incomeEtc: '#8B949E',
  },
};

const ThemeContext = createContext();

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
      } catch (error) {}
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

  const toggleTheme = async () => {
    const newValue = !isDark;
    setIsDark(newValue);
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (currentUser) {
        await updateDoc(doc(db, 'users', currentUser.uid), { isDark: newValue });
      }
    } catch (error) {}
  };

  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ colors, isDark, toggleTheme, themeLoaded }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}