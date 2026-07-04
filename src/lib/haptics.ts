import * as Haptics from 'expo-haptics';

/** Fire-and-forget haptics; never throw (web/emulator safe). */
export const tap = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

export const thud = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};

export const success = () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};

export const warn = () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
};
