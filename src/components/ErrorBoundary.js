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
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.iconWrap}>
            <Ionicons name="bug-outline" size={48} color="#E74C3C" />
          </View>
          <Text style={styles.title}>문제가 발생했습니다</Text>
          <Text style={styles.subtitle}>
            예기치 않은 오류가 발생했어요.{'\n'}앱을 다시 시작해 주세요.
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={this.handleReset}>
            <Ionicons name="refresh-outline" size={18} color="#FFF" />
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
          {__DEV__ && this.state.error && (
            <View style={styles.errorDetail}>
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
    backgroundColor: '#F8F9FA',
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E74C3C15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A1A2E',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#6C63FF',
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
    backgroundColor: '#FFF',
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
