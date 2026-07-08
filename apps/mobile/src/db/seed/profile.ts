/** Demo member profile — per docs/CONTRACTS.md Seed section. */
import type { UserProfile } from '@/types/models';

export const SEED_PROFILE: Omit<UserProfile, 'id'> = {
  name: 'Arjun Mehra',
  age: 27,
  heightCm: 176,
  goal: 'muscle',
  experience: 'intermediate',
  gymName: 'Iron Temple Fitness',
  memberSinceISO: '2025-11-01',
  calorieTarget: 2600,
  proteinTargetG: 160,
  carbsTargetG: 290,
  fatTargetG: 75,
  unitSystem: 'metric',
  language: 'en',
};
