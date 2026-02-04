import React, { useState, useCallback } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider, useTheme } from './src/constants/ThemeContext';
import { AuthProvider, useAuth } from './src/constants/AuthContext';
import { WalletProvider, useWallet } from './src/constants/WalletContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
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
  const [appStage, setAppStage] = useState('welcome');
  const [loginMode, setLoginMode] = useState('login');

  const handleNewUser = useCallback(() => setAppStage('onboarding'), []);
  const handleExistingUser = useCallback(() => {
    setLoginMode('login');
    setAppStage('login');
  }, []);
  const handleOnboardingFinish = useCallback((mode) => {
    setLoginMode(mode);
    setAppStage('login');
  }, []);

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
    if (userWallets.length === 0) return <WalletSetupScreen />;
    if (!currentWalletId) return <WalletSelectScreen />;
    return (
      <NavigationContainer>
        <TabNavigator />
      </NavigationContainer>
    );
  }

  // === 로그인 안 된 상태 ===
  if (appStage === 'welcome') {
    return (
      <WelcomeScreen
        onNewUser={handleNewUser}
        onExistingUser={handleExistingUser}
      />
    );
  }

  if (appStage === 'onboarding') {
    return <OnboardingScreen onFinish={handleOnboardingFinish} />;
  }

  return <LoginScreen initialMode={loginMode} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <WalletProvider>
            <AppContent />
          </WalletProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
});
