import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../constants/ThemeContext';

function SkeletonBlock({ width, height, borderRadius = 8, style, skeletonColor = '#E0E0E0' }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, opacity },
        style,
      ]}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: skeletonColor, borderRadius }]} />
    </Animated.View>
  );
}

export default function SkeletonLoader() {
  const { colors: Colors, isDark } = useTheme();
  // 다크모드에서는 더 어두운 스켈레톤 색상 사용
  const skelColor = isDark ? '#30363D' : '#E0E0E0';

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* 헤더 스켈레톤 */}
      <LinearGradient
        colors={[Colors.gradientStart, Colors.gradientMiddle, Colors.gradientEnd]}
        style={styles.headerSkeleton}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <SkeletonBlock width={120} height={24} borderRadius={6} style={{ opacity: 0.2 }} skeletonColor="rgba(255,255,255,0.2)" />
        <SkeletonBlock width={80} height={14} borderRadius={4} style={{ marginTop: 8, opacity: 0.15 }} skeletonColor="rgba(255,255,255,0.2)" />
      </LinearGradient>

      <View style={styles.content}>
        {/* 카드 스켈레톤 1 */}
        <View style={[styles.card, { backgroundColor: Colors.surface }]}>
          <View style={styles.cardRow}>
            <SkeletonBlock width={44} height={44} borderRadius={14} skeletonColor={skelColor} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <SkeletonBlock width="60%" height={16} borderRadius={4} skeletonColor={skelColor} />
              <SkeletonBlock width="40%" height={12} borderRadius={4} style={{ marginTop: 6 }} skeletonColor={skelColor} />
            </View>
          </View>
        </View>

        {/* 카드 스켈레톤 2 */}
        <View style={[styles.card, { backgroundColor: Colors.surface }]}>
          <SkeletonBlock width="50%" height={18} borderRadius={4} skeletonColor={skelColor} />
          <View style={styles.twoCol}>
            <SkeletonBlock width="45%" height={60} borderRadius={12} skeletonColor={skelColor} />
            <SkeletonBlock width="45%" height={60} borderRadius={12} skeletonColor={skelColor} />
          </View>
        </View>

        {/* 리스트 스켈레톤 */}
        {[1, 2, 3].map((i) => (
          <View key={i} style={[styles.listItem, { backgroundColor: Colors.surface }]}>
            <SkeletonBlock width={36} height={36} borderRadius={18} skeletonColor={skelColor} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <SkeletonBlock width="70%" height={14} borderRadius={4} skeletonColor={skelColor} />
              <SkeletonBlock width="40%" height={10} borderRadius={4} style={{ marginTop: 4 }} skeletonColor={skelColor} />
            </View>
            <SkeletonBlock width={60} height={16} borderRadius={4} skeletonColor={skelColor} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerSkeleton: {
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  content: { padding: 20 },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  twoCol: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
});
