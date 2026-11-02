# Pizzicato v1.3.2 — `npm start` compilation fixes

This is a focused patch on top of **v1.3.1 (username login)**. No gameplay, study data, credentials, game assets, or Firebase backend behavior was deliberately changed.

## Fixes by file

1. `src/ts/level/streak.ts`: Phaser's `tween.getValue()` has a `number | null` return type; now handles `null` with `?? 0` and clamps the color-wheel index (TS2345).
2. `src/ts/study/dashboard.ts`: Replaced the dynamic `import('./firebaseClient')` with a regular import, compatible with `tsconfig.json`'s `module: ES2015` (TS1323). Added input/textarea-specific overloads for `field()` so password input `.type` assignments target `HTMLInputElement`, not the readonly `HTMLTextAreaElement.type` union (both TS2540 errors).
3. `src/ts/study/runtime.ts`: Uses the existing `isLevelStep()` predicate to distinguish playable levels from screen steps instead of comparing a narrowed screen-only union with `'level'` (TS2367).
4. `webpack/webpack.common.js`: Narrowly ignores the known **MediaPipe `vision_bundle.mjs`** dynamic-require warning, which comes from its prebuilt browser library. It does **not** suppress any other warnings or errors. MediaPipe files and hand-tracking functionality are unchanged; hand-tracking still needs an actual browser test.
5. `scripts/test-build-regressions.js` (new): Runs an isolated TypeScript semantic check for the real study dashboard/runtime files with lightweight external-dependency stand-ins (using TypeScript), checks nullable tween handling, and verifies that the MediaPipe suppression is scoped to that package.
6. `package.json`: Bumped patch version from 1.3.1 to 1.3.2 and wired the new check into `npm test`.
7. `docs/README.md`: Added an `npm start` troubleshooting entry for these build failures.

**Removed files:** none. **Firebase redeployment:** not required by these changes; this patch affects browser/frontend source and webpack configuration only.

## Update and run (Windows PowerShell)

1. Replace your working repository files with the files from this ZIP **without overwriting personal `web-config.local.json` or private Firebase credentials**. If you used Git to preserve local changes, back up any edits before switching to the updated source.
2. In PowerShell, open the repository folder (the one containing `package.json`).
3. Run `npm install` (if dependencies are not already installed), then `npm start`.
4. Open the local URL printed by webpack (typically `http://localhost:8080/`).

The original Firebase setup remains valid; you should not have to create a new administrator account or database. If build problems remain, please provide the **new, complete** terminal output after using v1.3.2.

## Verification notes

- Regression tests: `npm test` (includes targeted TypeScript semantic compilation for the affected study files).
- Full webpack dev/prod build with real packages: **not run in this environment**, because npm registry requests fail with `EAI_AGAIN`. Run `npm start` and `npm run build` on a development machine after installing dependencies.
- No connected Firebase project or real browser/camera was used for verification.
