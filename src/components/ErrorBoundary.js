import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (__DEV__) console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // props로 전달된 테마 색상 사용 (없으면 라이트 모드 기본값)
      const colors = this.props.colors || {};
      const bg = colors.background || '#F8F9FA';
      const textColor = colors.textBlack || '#1A1A2E';
      const subtitleColor = colors.textGray || '#8E8E93';
      const primary = colors.primary || '#6C63FF';
      const surface = colors.surface || '#FFF';

      return (
        <View style={[styles.container, { backgroundColor: bg }]}>
          <View style={[styles.iconWrap, { backgroundColor: '#E74C3C15' }]}>
            <Ionicons name="bug-outline" size={48} color="#E74C3C" />
          </View>
          <Text style={[styles.title, { color: textColor }]}>문제가 발생했습니다</Text>
          <Text style={[styles.subtitle, { color: subtitleColor }]}>
            예기치 않은 오류가 발생했어요.{'\n'}앱을 다시 시작해 주세요.
          </Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: primary }]} onPress={this.handleReset}>
            <Ionicons name="refresh-outline" size={18} color="#FFF" />
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
          {__DEV__ && this.state.error && (
            <View style={[styles.errorDetail, { backgroundColor: surface }]}>
              <Text style={styles.errorDetailText}>
                {this.state.error.toString()}
              </Text>
            </View>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  retryText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  errorDetail: {
    marginTop: 24,
    borderRadius: 8,
    padding: 12,
    maxWidth: '100%',
  },
  errorDetailText: {
    fontSize: 11,
    color: '#E74C3C',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
