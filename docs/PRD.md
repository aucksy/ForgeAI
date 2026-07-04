# ForgeAI — Product Requirements

**Tagline:** Your Gym. Your AI Coach. Your Lifetime Progress.

Premium Android **demo app for gym owners**. Not a workout tracker competitor — a
retention service: every member gets a personal AI coach that remembers everything,
and years of workout + nutrition history live inside the gym's app. Switching gyms
means leaving your coach and history behind.

**The demo must leave a gym owner thinking:** "If I offered this to my members,
they would never want to switch to another gym."

## Business goals (reflect throughout the app)
- Member retention & engagement; AI personal trainer for every member without staff.
- Effortless logging through natural conversation; long-term loyalty via history.

## Core experience
One AI conversation drives everything. No forms. Users talk naturally:
- "I did bench press 80 kg for 8, 7 and 6 reps." / "Log today's workout."
- "Kal shoulders kiye the." / "Aaj push day hai." (Hindi/Hinglish must work)
- "How much protein have I eaten today?" / "I had butter chicken and two rotis."
- "I ate this." (+ photo) / "How much should I lift today?"

AI updates the structured database automatically. **This is not a chatbot — it is an
AI Fitness Operating System.** The AI is only the interface; behind every message it
decides whether to read history, update data, calculate overload, estimate nutrition,
retrieve analytics, or coach.

## Voice first
Tap mic → speak → speech-to-text → AI understands → DB updates → coach responds.

## Languages
English, Hindi, Hinglish — mixed-language understanding.

## Flagship: Progressive Overload Coach
"What is my workout today?" → per-exercise card: **Last Session** (60 kg × 10) →
**Today's Target** (62.5 kg × 8–10) → **Reason** ("Completed all target reps last
week."). Sensible progressive-overload principles; the coach always explains WHY.

## Nutrition
Meal photos / text descriptions → estimate calories, protein, carbs, fat. Store all.

## Must-answer questions
Calories/protein today, calories remaining, weekly/monthly summary, improvement,
PRs, today's lift targets, muscles trained today.

## Dashboard
Today's Workout, Streak, Calories, Protein, Recovery Score, Strength Score, Weekly
Volume, Body Weight, AI Coach Insight, Next Workout.

## Analytics (beautiful graphs)
Weight progress, workout volume, exercise progress, PRs, calories, protein,
frequency, consistency, muscle-group volume, monthly trends, strength progress.

## Exercise pages
History, previous sessions, best set, PR, avg weight/reps, volume + progress graphs.

## AI personality
Experienced personal trainer; explains reasons; e.g. "You've plateaued for three
weeks. Let's deload this week." / "You're only 18 g away from your protein goal."

## Settings
OpenAI + Claude API keys (SecureStore), model selector, voice settings, units,
dark mode.

## Demo data
One member, 3 months of workouts, body weight history, meals, PRs, streak,
progressive-overload history. Must feel used daily for months on first launch.

## Suggested prompts
Today's Workout · Log Workout · Log Meal · Upload Food Photo · Show My Progress ·
Weekly Summary · Monthly Summary · Show My PRs · Nutrition Today · Calories
Remaining · Protein Remaining · What Should I Lift Today?

## UI/UX
Premium enough to impress in 30 seconds: smooth transitions, large cards, beautiful
typography, glassmorphism, dark mode by default, subtle gradients,
micro-interactions, modern charts, delightful loading states. No generic templates.

## Stack
React Native (Expo SDK 56) · TypeScript · SQLite · Zustand · expo-router ·
Reanimated · react-native-svg charts. Prototype quality, architecture ready for a
later Firebase/Supabase migration.
