import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';

export function showAlert(title, message, buttons) {
  if (Platform.OS === 'web') {
    if (buttons) {
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed && buttons[1]) buttons[1].onPress();
    } else {
      window.alert(`${title}\n\n${message}`);
    }
  } else {
    Alert.alert(title, message, buttons);
  }
}

export function useAlert() {
  return useCallback((title, message, buttons) => {
    showAlert(title, message, buttons);
  }, []);
}
