import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

// 알림 핸들러 설정
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

class NotificationService {
  // 푸시 알림 권한 요청 및 토큰 발급
  async registerForPushNotifications() {
    if (Platform.OS === 'web') return null;
    if (!Device.isDevice) {
      console.log('푸시 알림은 실제 기기에서만 동작합니다.');
      return null;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('푸시 알림 권한이 거부되었습니다.');
        return null;
      }

      // Android 채널 설정
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: '기본 알림',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#6C63FF',
        });

        await Notifications.setNotificationChannelAsync('budget', {
          name: '예산 알림',
          importance: Notifications.AndroidImportance.HIGH,
          description: '예산 초과 및 용돈 관련 알림',
        });

        await Notifications.setNotificationChannelAsync('fixed', {
          name: '고정 내역 알림',
          importance: Notifications.AndroidImportance.DEFAULT,
          description: '고정 지출/수입 자동 기록 알림',
        });
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const token = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      return token.data;
    } catch (error) {
      console.error('푸시 토큰 발급 실패:', error);
      return null;
    }
  }

  // 로컬 알림 발송
  async sendLocalNotification({ title, body, data, channelId = 'default' }) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: data || {},
          ...(Platform.OS === 'android' ? { channelId } : {}),
        },
        trigger: null, // 즉시 발송
      });
    } catch (error) {
      console.error('로컬 알림 발송 실패:', error);
    }
  }

  // ══════════════════════════════════════
  // 예산 초과 알림
  // ══════════════════════════════════════
  async notifyBudgetExceeded({ memberName, spentAmount, allowance }) {
    const pct = Math.round((spentAmount / allowance) * 100);
    await this.sendLocalNotification({
      title: '예산 초과 경고',
      body: `${memberName}님의 용돈 사용량이 ${pct}%에 도달했습니다. (${spentAmount.toLocaleString()}원 / ${allowance.toLocaleString()}원)`,
      data: { type: 'budget_warning' },
      channelId: 'budget',
    });
  }

  // 예산 90% 도달 알림
  async notifyBudgetWarning({ memberName, spentAmount, allowance }) {
    await this.sendLocalNotification({
      title: '용돈 사용 알림',
      body: `${memberName}님의 용돈이 90%를 넘었어요. 남은 금액: ${(allowance - spentAmount).toLocaleString()}원`,
      data: { type: 'budget_warning_90' },
      channelId: 'budget',
    });
  }

  // ══════════════════════════════════════
  // 고정 기록 알림
  // ══════════════════════════════════════
  async notifyFixedRecorded({ name, amount, type }) {
    const typeLabel = type === 'income' ? '수입' : '지출';
    await this.sendLocalNotification({
      title: `고정 ${typeLabel} 자동 기록`,
      body: `"${name}" ${amount.toLocaleString()}원이 자동으로 기록되었습니다.`,
      data: { type: 'fixed_recorded' },
      channelId: 'fixed',
    });
  }

  // ══════════════════════════════════════
  // 용돈 요청 알림
  // ══════════════════════════════════════
  async notifyAllowanceRequest({ userName, amount, message }) {
    await this.sendLocalNotification({
      title: '새 용돈 요청',
      body: `${userName}님이 ${amount.toLocaleString()}원을 요청했습니다.${message ? ` "${message}"` : ''}`,
      data: { type: 'allowance_request' },
      channelId: 'budget',
    });
  }

  async notifyAllowanceResponse({ approved, amount }) {
    await this.sendLocalNotification({
      title: approved ? '용돈 요청 승인' : '용돈 요청 거절',
      body: approved
        ? `용돈 요청이 승인되었습니다. (${amount.toLocaleString()}원)`
        : '용돈 요청이 거절되었습니다.',
      data: { type: 'allowance_response' },
      channelId: 'budget',
    });
  }

  // ══════════════════════════════════════
  // 알림 리스너
  // ══════════════════════════════════════
  addNotificationReceivedListener(callback) {
    return Notifications.addNotificationReceivedListener(callback);
  }

  addNotificationResponseListener(callback) {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }
}

export default new NotificationService();
