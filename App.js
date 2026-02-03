import React, { useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider, useTheme } from './src/constants/ThemeContext';
import { AuthProvider, useAuth } from './src/constants/AuthContext';
import { WalletProvider, useWallet } from './src/constants/WalletContext';
import TabNavigator from './src/navigation/TabNavigator';
import LoginScreen from './src/screens/LoginScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import WalletSetupScreen from './src/screens/WalletSetupScreen';
import WalletSelectScreen from './src/screens/WalletSelectScreen';

function AppContent() {
  const { colors: Colors } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const { currentWalletId, userWallets, walletLoading } = useWallet();

  // 앱 진입 상태
  // 'welcome' → 'onboarding' → 'login' or 'signup'
  const [appStage, setAppStage] = useState('welcome');
  // 로그인 화면의 초기 모드 ('login' | 'signup')
  const [loginMode, setLoginMode] = useState('login');

  // 로딩
  if (authLoading || (user && walletLoading)) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={[styles.loadingText, { color: Colors.textGray }]}>로딩 중...</Text>
      </View>
    );
  }

  // 로그인 되어 있으면 가계부 흐름으로
  if (user) {
    // 가계부 없음 → 만들기/합류
    if (userWallets.length === 0) return <WalletSetupScreen />;
    // 가계부 미선택 (goToWalletList로 돌아온 경우 or 2개 이상일 때)
    if (!currentWalletId) return <WalletSelectScreen />;
    // 메인 앱
    return (
      <NavigationContainer>
        <TabNavigator />
      </NavigationContainer>
    );
  }

  // === 로그인 안 된 상태 ===

  // Welcome 화면
  if (appStage === 'welcome') {
    return (
      <WelcomeScreen
        onNewUser={() => setAppStage('onboarding')}
        onExistingUser={() => {
          setLoginMode('login');
          setAppStage('login');
        }}
      />
    );
  }

  // 온보딩 화면
  if (appStage === 'onboarding') {
    return (
      <OnboardingScreen
  onFinish={(mode) => {
    setLoginMode(mode);  // 'signup' 또는 'login'
    setAppStage('login');
  }}
/>
    );
  }

  // 로그인/회원가입 화면
  return <LoginScreen initialMode={loginMode} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WalletProvider>
          <AppContent />
        </WalletProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
});