import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Linking, Alert, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider, useTheme } from './src/constants/ThemeContext';
import { AuthProvider, useAuth } from './src/constants/AuthContext';
import { WalletProvider, useWallet } from './src/constants/WalletContext';
import { NetworkProvider } from './src/constants/NetworkContext';
import ErrorBoundary from './src/components/ErrorBoundary';
import SkeletonLoader from './src/components/SkeletonLoader';
import TabNavigator from './src/navigation/TabNavigator';
import LoginScreen from './src/screens/LoginScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import WalletSetupScreen from './src/screens/WalletSetupScreen';
import WalletSelectScreen from './src/screens/WalletSelectScreen';

// 딥링크에서 초대코드 추출
function parseInviteCode(url) {
  if (!url) return null;
  try {
    // familywallet://join?code=XXXXXX
    if (url.includes('join') && url.includes('code=')) {
      const match = url.match(/code=([A-Za-z0-9]+)/);
      return match ? match[1] : null;
    }
  } catch { }
  return null;
}

function AppContent() {
  const { colors: Colors } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const { currentWalletId, userWallets, loading: walletLoading, joinWallet } = useWallet();

  const [appStage, setAppStage] = useState('welcome');
  const [loginMode, setLoginMode] = useState('login');
  const [pendingInviteCode, setPendingInviteCode] = useState(null);

  // 딥링크 수신 처리
  useEffect(() => {
    const handleDeepLink = (event) => {
      const code = parseInviteCode(event.url);
      if (code) {
        setPendingInviteCode(code);
      }
    };

    // 앱이 이미 열려있을 때 딥링크 수신
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // 앱이 딥링크로 처음 열릴 때
    Linking.getInitialURL().then((url) => {
      const code = parseInviteCode(url);
      if (code) setPendingInviteCode(code);
    });

    return () => subscription?.remove();
  }, []);

  // 로그인 후 대기 중인 초대코드 자동 처리
  useEffect(() => {
    if (!user || !pendingInviteCode || walletLoading) return;

    const showAlert = (title, msg) => {
      if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
      else Alert.alert(title, msg);
    };

    const handleJoin = async () => {
      // 닉네임이 필요하므로 간단하게 프로필 이름 사용
      const nickname = user.displayName || '사용자';
      const result = await joinWallet(pendingInviteCode, nickname);
      if (result.success) {
        showAlert('합류 완료!', `"${result.walletName}" 가계부에 합류했습니다.`);
      } else {
        showAlert('합류 실패', result.message || '초대코드가 유효하지 않습니다.');
      }
      setPendingInviteCode(null);
    };

    handleJoin();
  }, [user, pendingInviteCode, walletLoading]);

  // 로딩 → 스켈레톤 UI
  if (authLoading || (user && walletLoading)) {
    return <SkeletonLoader />;
  }

  // 로그인 되어 있으면 가계부 흐름
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

  // 딥링크로 들어왔지만 로그인 안 된 경우 → 로그인으로 안내
  if (pendingInviteCode && appStage === 'welcome') {
    return <LoginScreen initialMode="login" />;
  }

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

  if (appStage === 'onboarding') {
    return (
      <OnboardingScreen
        onFinish={(mode) => {
          setLoginMode(mode);
          setAppStage('login');
        }}
      />
    );
  }

  return <LoginScreen initialMode={loginMode} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <NetworkProvider>
          <AuthProvider>
            <WalletProvider>
              <AppContent />
            </WalletProvider>
          </AuthProvider>
        </NetworkProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
