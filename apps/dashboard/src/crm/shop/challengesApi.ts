/**
 * The gym's calls for challenges and the leaderboard (R-133): thin wrappers over the RPCs in
 * supabase/migrations/0037_leaderboard.sql. Every call carries the owner or desk key; the server
 * checks it, keeps each gym (each branch) to its own members and lets only the owner change things.
 * A server without 0037 answers PGRST202 (`isNoSuchFunction`): the screen then says it is not
 * switched on yet.
 */

import {
  boardFromAnswer,
  challengesFromAnswer,
  type BoardAnswer,
  type ChallengePayload,
  type ChallengesAnswer,
} from '../logic/challenges';
import { call } from './api';

export async function getChallenges(key: string): Promise<ChallengesAnswer> {
  return challengesFromAnswer(await call<unknown>('owner_challenges', { p_key: key }));
}

/** Add a challenge, or change one that has not started (`id` given). Throws OWNER_ONLY / INVALID / OVERLAP / SUSPENDED. */
export async function saveChallenge(key: string, challenge: ChallengePayload): Promise<void> {
  await call<unknown>('owner_save_challenge', { p_key: key, p_challenge: challenge });
}

/** Cancel a challenge that has not finished. Throws OWNER_ONLY / INVALID / SUSPENDED. */
export async function cancelChallenge(key: string, id: string): Promise<void> {
  await call<unknown>('owner_cancel_challenge', { p_key: key, p_id: id });
}

export async function getBoard(key: string): Promise<BoardAnswer> {
  return boardFromAnswer(await call<unknown>('owner_board', { p_key: key }));
}

/** Hide a member from (or show them again on) the members' leaderboard. Owner only. */
export async function hideOnBoard(key: string, memberId: string, hidden: boolean): Promise<void> {
  await call<unknown>('owner_hide_on_board', { p_key: key, p_member: memberId, p_hidden: hidden });
}
