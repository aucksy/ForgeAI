/**
 * F148: the trainer's YouTube links kept on the phone, so the exercise page can show "Watch your trainer"
 * offline. Two lists: the links in the gym's workout plans (written by gymPlansSync.ts on every good read, so a
 * link the trainer removed goes too) and the links in today's workout of the day (gymWodSync.ts). The rules
 * are shop/trainerVideo.ts (pure). Leaving the gym and "Erase all data" forget both. Never throws.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseVideoList, videoFor, type TrainerVideo } from '@/shop/trainerVideo';

export const TRAINER_VIDEOS_PLANS_KEY = 'forgeai-trainer-videos-plans';
export const TRAINER_VIDEOS_WOD_KEY = 'forgeai-trainer-videos-wod';

/** Replace one source's links. */
export async function saveTrainerVideos(source: 'plans' | 'wod', list: readonly TrainerVideo[]): Promise<void> {
  try {
    const text = JSON.stringify(list.slice(0, 500));
    if (source === 'plans') {
      if (list.length === 0) await AsyncStorage.removeItem(TRAINER_VIDEOS_PLANS_KEY);
      else await AsyncStorage.setItem(TRAINER_VIDEOS_PLANS_KEY, text);
    } else if (list.length === 0) await AsyncStorage.removeItem(TRAINER_VIDEOS_WOD_KEY);
    else await AsyncStorage.setItem(TRAINER_VIDEOS_WOD_KEY, text);
  } catch (e) {
    console.warn('[ForgeErr] trainer videos: saving', source, e);
  }
}

/** The trainer's video for this exercise, or null (today's workout first, then the plans). */
export async function trainerVideoFor(ex: { catalogKey: string | null; name: string }): Promise<TrainerVideo | null> {
  try {
    const [wod, plans] = await Promise.all([AsyncStorage.getItem(TRAINER_VIDEOS_WOD_KEY), AsyncStorage.getItem(TRAINER_VIDEOS_PLANS_KEY)]);
    return videoFor([...parseVideoList(wod), ...parseVideoList(plans)], ex);
  } catch (e) {
    console.warn('[ForgeErr] trainer videos: reading', e);
    return null;
  }
}

/** The member left the gym, or erased the app's data. */
export async function forgetTrainerVideos(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([TRAINER_VIDEOS_PLANS_KEY, TRAINER_VIDEOS_WOD_KEY]);
  } catch (e) {
    console.warn('[ForgeErr] trainer videos: forgetting', e);
  }
}
