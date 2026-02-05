import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../constants/ThemeContext';

import HomeScreen from '../screens/HomeScreen';
import AddScreen from '../screens/AddScreen';
import SettingsScreen from '../screens/SettingsScreen';
import InsightsScreen from '../screens/InsightsScreen';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === '홈') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === '추가') iconName = focused ? 'add-circle' : 'add-circle-outline';
          else if (route.name === '분석') iconName = focused ? 'analytics' : 'analytics-outline';
          else if (route.name === '설정') iconName = focused ? 'settings' : 'settings-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textGray,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: 1,
          borderTopColor: colors.tabBarBorder,
          height: 65,
          paddingBottom: 8,
          paddingTop: 5,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          elevation: 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="홈" component={HomeScreen} />
      <Tab.Screen name="추가" component={AddScreen} />
      <Tab.Screen name="분석" component={InsightsScreen} />
      <Tab.Screen name="설정" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
