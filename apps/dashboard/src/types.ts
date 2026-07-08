export type Role = 'owner' | 'trainer' | 'member';

export interface Profile {
  id: string;
  gym_id: string | null;
  role: Role;
  display_name: string | null;
}

export interface Gym {
  gym_id: string;
  name: string;
  join_code: string;
}

/** The one-row-per-member rollup the phone pushes (member_summary). */
export interface MemberSummary {
  member_id: string;
  gym_id: string;
  display_name: string | null;
  last_active_at: string | null;
  last_workout_at: string | null;
  last_meal_at: string | null;
  workouts_7d: number;
  workouts_30d: number;
  total_workouts: number;
  current_streak: number;
  longest_streak: number;
  weight_kg: number | null;
  calories_today: number | null;
  protein_today_g: number | null;
  updated_at: string;
}
