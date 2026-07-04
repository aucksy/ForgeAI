# ForgeAI

**Your Gym. Your AI Coach. Your Lifetime Progress.**

Premium Android demo for gym owners: an AI Fitness Operating System that makes
members loyal — their coach, complete training history, nutrition intelligence
and progressive-overload coaching live inside the gym's own app.

- One conversation drives everything: "I did bench 80 kg for 8, 7, 6" · "Aaj push
  day hai" · "I ate this" (photo) — the AI updates structured SQLite data.
- Flagship: Progressive Overload Coach — last session → today's target → why.
- Works with a Claude or OpenAI key (Settings) **or fully offline** via the
  built-in local coach + 3 months of realistic demo data.

## Stack
Expo SDK 56 · React Native 0.85 · TypeScript · expo-router · SQLite · Zustand ·
Reanimated · react-native-svg.

## Develop
```bash
npm install
npm run typecheck
npx expo start
```

## Release
Tag-driven GitHub Actions (`v*` → signed APK + AAB GitHub Release). No local
Gradle builds. See `CONTEXT.md` / `docs/` for architecture and contracts.
