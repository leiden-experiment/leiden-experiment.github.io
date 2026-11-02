# Pizzicato Universal v1.3.1 — Username-only Firebase login

## What researchers and participants now type

All roles sign in with **username + password** (for example, `leadresearcher` or `testplayer01`). Do **not** enter an email address. Login names are case-insensitive. Allowed names have 4–40 characters, start with a letter, and use only letters, digits, `_` and `-`.

Firebase Authentication still uses its built-in Email/Password sign-in provider. The browser and server **internally** map `leadresearcher` to `leadresearcher@pizzicato.com`; the fake email is *not displayed or requested from users*. No verification, reset or other email should be sent to that domain. Credentials are authenticated by Firebase, not stored in GitHub or the public app.

**Username uniqueness:** All usernames in the central Firebase Authentication project share one namespace, across study participants, moderators and administrators. Usernames differ only by capitalization are treated as the same.

## New administrator setup

1. After configuring the central Firebase project and obtaining its service-account JSON outside the repository, run:

   `npm run admin:create -- leadresearcher "/FULL/PATH/TO/service-account.json"`

2. The command displays **username** and a randomly generated password. Save both securely. Subsequent runs for an existing administrator will **not** replace the password or elevate a non-administrator account.
3. The optional encrypted vault now also accepts **username** rather than email:

   `npm run admin:prepare -- leadresearcher "/SAFE/FOLDER/admin-vault.json"`

   To activate the vault later: `npm run admin:activate -- "/SAFE/FOLDER/admin-vault.json" "/FULL/PATH/TO/service-account.json"`.

## Existing Firebase user accounts (important)

**Existing accounts created by a previous release do not automatically change their login email.** On a trusted computer, first configure `web-config.local.json` to reference the existing central Firebase project (`npm run setup:web`), then migrate each account:

`npm run account:migrate -- "old-account@example.edu" leadresearcher "/FULL/PATH/TO/service-account.json"`

For an existing participant/moderator, the old Firebase login might be `testplayer01@pizzicato.example`. Replace it with the appropriate existing email and selected username. This migration updates the Firebase Auth email and user profile while **preserving the UID, existing password, role claims and study data**. Revoke/relog sessions. Back up accounts and data before migrating. Never run migration against a different Firebase project. See **Step 11a of `docs/README.md`**.

Existing encrypted vaults created with email-based data cannot be activated by the new command; prepare a new username vault or use the account migration for an account that already exists.

## Firebase deployment

The server-side account creation code changed, so redeploy the backend:

`firebase deploy --only functions,database --project YOUR-PROJECT-ID`

**Cloud Functions now targets Node.js 22** (`functions/package.json`), fixing the previous Node 20 decommissioning error. Rebuild and republish the web frontend after pushing these changes, or restart `npm start` for local testing. Existing web and service-account Firebase configuration is unchanged.

## Exact repository changes (compared with the consolidated-guide ZIP)

**Added:**
- `functions/username.js`: shared server-side username validation, lowercase normalization and fake-email mapping.
- `src/ts/study/username.ts`: client-side equivalent mapping and validation.
- `scripts/migrate-username.js`: trusted local migration tool for existing Firebase accounts.
- `scripts/test-usernames.js`: tests invalid/case-insensitive usernames and both mappings, plus security/configuration checks.
- `USERNAME_LOGIN_CHANGES.md`: this file.

**Modified:**
- `src/ts/study/firebaseClient.ts`: Firebase sign-in derives email from username, no email login input.
- `src/ts/core/game.ts`: explicitly labels the field Username and trims whitespace from login input.
- `src/ts/study/offline.ts`: username login comparisons are now case-insensitive for offline packs.
- `functions/index.js`: account provisioning creates `username@pizzicato.com`; administrator display name prefers stored username rather than email.
- `functions/package.json`: Node.js 20 → Node.js 22.
- `scripts/create-admin.js`: local administrator creation accepts usernames, generates a password, and refuses unsafe promotion of existing non-administrators.
- `scripts/admin-vault.js`: encrypted backup preparation/activation accepts usernames.
- `scripts/grant-admin.js`: expects username and no longer silently elevates non-administrators.
- `scripts/test-research-features.js`: vault round-trip fixture now uses username.
- `package.json`: version 1.3.1, `account:migrate` and `test:usernames` commands, includes tests in `npm test`.
- `README.md`: username account-creation command and migration reference.
- `docs/README.md`: consolidated researcher guide now covers username setup, all-role login, legacy migration and fake-email limitations.

**Removed:** no source files, levels, study data fixtures, or game assets.

## Verification and limitations

- `npm test`: **PASS**, including all legacy and JSON level tests, study and research tests, deployment configuration checks and new username-format tests.
- `node --check`: **PASS** for changed backend and Node command-line scripts.
- Full webpack browser build, live Firebase Auth migration, and cloud deployments are **not tested in this environment** because the project dependencies are not installed and no Firebase project credentials are available. Before research use, test first with a disposable Firebase project and dummy accounts.
- The chosen `@pizzicato.com` suffix is an internal login identifier, not a functioning mailbox. **Do not use Firebase's email-based password reset or verification**, which could send mail to someone who owns that domain. Admin account password management should be handled on a trusted computer; moderator passwords can be changed in the dashboard.
