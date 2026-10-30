#!/usr/bin/env node
/**
 * Runs after every `npm install` / `npm ci` (root "postinstall"), so the cloud build compiles the
 * patched library code. Each patch swaps one exact block of a library's source for a fixed one.
 * Already patched: nothing to do. Neither the old block nor the fixed one found (the library was
 * upgraded): the install FAILS on purpose, so someone checks whether the new version still needs it.
 *
 * 1. expo-task-manager 56 TaskService (Android): a race that crashed the app when a gym message
 *    push arrived (qa-journeys run 41012405375, J3: NullPointerException in TaskService.executeTask
 *    from FirebaseMessagingDelegate). executeTask runs on Firebase's thread and reads sEvents twice
 *    (get() == null, then get() again); notifyTaskFinished runs on the main thread and can remove
 *    the same key in between, so the second get() is null and .add() crashes. Both sides now hold
 *    one lock on sEvents and read the list once; the two other places that touch sEvents (the 2 s
 *    delayed check, the app-load failure) take the same lock.
 */
const fs = require('fs');
const path = require('path');

const PATCHES = [
  {
    pkg: 'expo-task-manager',
    file: 'node_modules/expo-task-manager/android/src/main/java/expo/modules/taskManager/TaskService.java',
    swaps: [
      {
        old: `    boolean isFirstEvent = sEvents.get(appScopeKey) == null;
    final List<String> appEvents;
    if (isFirstEvent) {
      appEvents = new ArrayList<>();
      appEvents.add(eventId);
      sEvents.put(appScopeKey, appEvents);
    } else {
      appEvents = sEvents.get(appScopeKey);
      appEvents.add(eventId);
    }
`,
        new: `    // MettleUp patch (scripts/patch-native.js): one read under one lock, see there.
    final boolean isFirstEvent;
    synchronized (sEvents) {
      List<String> appEvents = sEvents.get(appScopeKey);
      isFirstEvent = appEvents == null;
      if (isFirstEvent) {
        appEvents = new ArrayList<>();
        sEvents.put(appScopeKey, appEvents);
      }
      appEvents.add(eventId);
    }
`,
      },
      {
        old: `    List<String> appEvents = sEvents.get(appScopeKey);

    Log.i(TAG, "Finished task '" + taskName + "' with eventId '" + eventId + "'.");

    if (appEvents != null) {
      appEvents.remove(eventId);

      if (appEvents.isEmpty()) {
        sEvents.remove(appScopeKey);
`,
        new: `    // MettleUp patch (scripts/patch-native.js): the same lock as executeTask.
    boolean lastEvent = false;
    synchronized (sEvents) {
      List<String> appEvents = sEvents.get(appScopeKey);
      if (appEvents != null) {
        appEvents.remove(eventId);
        if (appEvents.isEmpty()) {
          sEvents.remove(appScopeKey);
          lastEvent = true;
        }
      }
    }

    Log.i(TAG, "Finished task '" + taskName + "' with eventId '" + eventId + "'.");

    {
      if (lastEvent) {
`,
      },
      {
        old: `          if (!sEvents.containsKey(appScopeKey)) {
            invalidateAppRecord(appScopeKey);
`,
        new: `          final boolean gone;
          synchronized (sEvents) {
            gone = !sEvents.containsKey(appScopeKey);
          }
          if (gone) {
            invalidateAppRecord(appScopeKey);
`,
      },
      {
        old: `        if (!success) {
          sEvents.remove(appScopeKey);
`,
        new: `        if (!success) {
          synchronized (sEvents) {
            sEvents.remove(appScopeKey);
          }
`,
      },
    ],
  },
];

const root = path.resolve(__dirname, '..');
let failed = false;
for (const p of PATCHES) {
  const file = path.join(root, p.file);
  if (!fs.existsSync(path.join(root, 'node_modules', p.pkg, 'package.json'))) {
    console.log(`[patch-native] skip, not installed: ${p.pkg}`);
    continue;
  }
  if (!fs.existsSync(file)) {
    console.error(`[patch-native] FAILED: ${p.pkg} is installed but ${p.file} is gone (library upgraded?).`);
    failed = true;
    continue;
  }
  let fileFailed = false;
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = crlf ? raw.replace(/\r\n/g, '\n') : raw;
  let changed = false;
  for (const s of p.swaps) {
    if (text.includes(s.new)) continue;
    if (text.split(s.old).length !== 2) {
      console.error(`[patch-native] FAILED: ${p.file} changed (library upgraded?). Check whether the patch is still needed.`);
      failed = true;
      fileFailed = true;
      continue;
    }
    text = text.replace(s.old, s.new);
    changed = true;
  }
  if (fileFailed) continue; // never write a half-patched file
  if (changed) {
    fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
    console.log(`[patch-native] patched ${p.file}`);
  } else {
    console.log(`[patch-native] already patched ${p.file}`);
  }
}
process.exit(failed ? 1 : 0);
