# Pizzicato

Pizzicato is a hand-tracking music game for browser demonstrations and research studies. It supports bundled legacy levels and imported Pizzicato Level Designer JSON levels. The research version can use Firebase Authentication (username and password), a central administrator database, optional linked study-results databases, and a visual study timeline with optional weekly scheduling and date restrictions.

**This is the only setup and usage guide for this repository.** Follow **Steps 1–10** once to set up the research system, then use **Step 11** whenever you return to it. Steps 12–13 cover GitHub Pages, guest mode, and offline/desktop options.

For a quick guest-only preview (no Firebase account or database): install dependencies with `npm install`, then run `npm run start:guest`. For a Firebase-connected local website, follow the setup steps below instead.

---

## Before starting: what goes where?

| Place | What it holds |
| --- | --- |
| **Central Firebase project** (the *administrator project*) | Firebase Authentication for username/password logins (internal email identifiers); **default Realtime Database** for studies, participant/moderator profiles, schedules, published JSON levels, and progress; deployed Cloud Functions for protected operations. |
| **Study results database** (optional, recommended for this test) | A **second Realtime Database instance** for results from a specific study. You link its URL when creating/editing the study. The main database still holds the study settings, accounts, and shared levels. |
| **Your computer** | A browser website started by `npm start`, plus a local file containing **public** Firebase web settings. It connects to real online Firebase; you do **not** need GitHub Pages to test. |
| **GitHub Pages** (optional) | Hosts the same browser website. It is **not** a database or a Firebase backend. |

**You will need:** a computer with internet access, permission to create a Firebase project and configure its billing (Cloud Functions and a second database generally require **Blaze/pay-as-you-go**), your GitHub repository URL or a ZIP of the code, and a password manager. Get approval for potential charges and set Firebase/Google Cloud billing alerts. **Use test accounts and fictional participant data first.**

---

## FIRST TIME ONLY

### Step 1 — Download Pizzicato and open its folder

1. Install **Node.js 22 LTS or another compatible LTS version** from <https://nodejs.org>. Install **Git** from <https://git-scm.com/downloads> if you will clone the repository. Restart your terminal after installation.
2. On GitHub, open the Pizzicato repository, click **Code**, and copy the **HTTPS** URL.
3. Open a terminal: **Windows:** Start menu → type **Command Prompt** → Enter. **Mac:** Applications → Utilities → **Terminal**.
4. If using Git, enter these commands, replacing the example URL and folder name with yours:

   ```sh
   git clone https://github.com/YOUR-ORG/YOUR-REPO.git
   cd YOUR-REPO
   ```

   **No Git?** On GitHub choose **Code → Download ZIP**, extract it, and open a terminal in the extracted folder: **Windows:** open the folder in File Explorer, type `cmd` in the address bar, Enter. **Mac:** type `cd ` in Terminal, drag the folder into the terminal, press Return.
5. Check that you can see **`package.json`**, **`firebase.json`**, and the **`functions`** folder. You must run the following commands in *this* folder (not inside `src` or `docs`).

### Step 2 — Install dependencies and Firebase tools

Copy each command into the terminal, press Enter, and wait for it to finish before typing the next:

```sh
npm install
npm install --prefix functions
npm install -g firebase-tools
firebase login
```

`firebase login` opens a browser. Sign in using the Google account that will own your Firebase project. If an install command fails, resolve the error before continuing. These installs are usually needed only the first time (and sometimes after updating the code).

### Step 3 — Create the central administrator Firebase project

1. Open <https://console.firebase.google.com/> and click **Create/Add project**. Choose a name such as `pizzicato-research-test`. Keep a note of the **Project ID** (not just its display name).
2. In **Build → Authentication → Sign-in method**, enable **Email/Password** and save. **Pizzicato still shows usernames**, not email addresses: Firebase internally stores each user as `username@pizzicato.com`. No mailbox is needed, and these addresses must not be used for email verification or password recovery.
3. In **Build → Realtime Database**, click **Create database**, choose a location, and select **locked mode**. This is the **default (central/admin) database**. Copy its full HTTPS **database URL**. Use *Realtime Database*, not Firestore.
4. Click the **gear icon → Project settings → General → Your apps → Web (`</>`)** and register a Web app. Under **SDK setup and configuration**, choose **Config**. Keep this screen open. Later you need its public `apiKey`, `authDomain`, `projectId`, and `appId` values.
5. In **Authentication → Settings → Authorized domains**, make sure **`localhost`** is allowed for local testing (add it if necessary). Later, for GitHub Pages, add the Pages **hostname** too.
6. Make sure the project is on the plan required for deploying Cloud Functions; choose **Blaze** if Firebase requests it. Set budget alerts and follow your institution's billing/security rules.

**Reminder:** Firebase web-app configuration is public browser configuration, *not* an administrator credential. **Never paste a service-account private key into it.**

### Step 4 — Deploy the secure backend into the central project

Still in the Pizzicato terminal, run the following command, replacing `YOUR-PROJECT-ID` with the Firebase **Project ID** from Step 3:

```sh
firebase deploy --only functions,database --project YOUR-PROJECT-ID
```

Wait until it finishes successfully. This deploys the protected Cloud Functions and the central database's access rules. A website alone cannot create administrator accounts or save studies securely. Whenever the backend code or rules change in a future update, rerun this command.

### Step 5 — Create your administrator login

1. In Firebase Console, open **gear icon → Project settings → Service accounts** and click **Generate new private key**. Download the **Admin SDK service-account JSON** and put it **outside** the repository in a secure location (for example, your private Documents folder). **Never put it on GitHub or give it to researchers who only need to log in.**
2. Choose an **administrator username** (4–40 characters, starting with a letter; letters/numbers/underscore/hyphen only). In the Pizzicato terminal, use the username and the full path to the downloaded key:

   ```sh
   npm run admin:create -- leadresearcher "/FULL/PATH/TO/service-account.json"
   ```

   **Windows path example:** `"C:\Users\YourName\Documents\service-account.json"`. **Mac path example:** `"/Users/YourName/Documents/service-account.json"`.
3. The terminal shows an administrator **password once**. Save the **username and password** in a password manager. Firebase Authentication—not a file on GitHub—checks them. If an administrator with that username already exists, the command keeps the original password. If a *non-administrator* already has the username, it refuses to promote that account.
4. To add another trusted lead administrator, repeat the command using a **different username**. Give researchers only their **username/password**, *never* the Admin SDK private key. Usernames are **case-insensitive and unique across all roles and studies** within the central Firebase project.

**Optional — prepare encrypted login credentials before Firebase is ready:** Instead of `admin:create`, you can use `npm run admin:prepare -- leadresearcher "/SAFE/FOLDER/admin-vault.json"`, enter a separate 20+ character encryption passphrase, and save the displayed login password. Later, after downloading the Admin SDK key and installing the `functions` dependencies, activate it with `npm run admin:activate -- "/SAFE/FOLDER/admin-vault.json" "/FULL/PATH/TO/service-account.json"`. **Use either this route OR `admin:create` for the first account, not both for the same username.** The AES-256-GCM vault is only an encrypted backup; keep the passphrase separately, and do **not** rely on a committed encrypted file as your website login system. Prefer keeping even encrypted backups outside public GitHub.

### Step 6 — Connect this computer's web version to the central database

1. In the Pizzicato terminal, run:

   ```sh
   npm run setup:web
   ```

2. Answer **`y`** to **Use Firebase?**.
3. Copy the requested five values **one at a time**: `apiKey`, `authDomain`, `projectId`, `appId` from **Project settings → Your apps → Web app → Config**, and `databaseURL` from **Realtime Database**. The wizard asks for the database URL *before* `appId`.
4. Check the result:

   ```sh
   npm run check:web
   ```

   It should say **`online`** and display your central Firebase Project ID. The wizard creates `web-config.local.json` on this computer, ignored by Git. It must refer to the **central/default** database, not the study results instance.

### Step 7 — Start Pizzicato locally and sign in

1. Run:

   ```sh
   npm start
   ```

2. A browser may open automatically. Otherwise open the address displayed by the terminal, usually <http://localhost:8080/>.
3. Sign in with the **administrator username and password** from Step 5 (e.g. `leadresearcher`, **not** `leadresearcher@pizzicato.com`). You should see the Pizzicato research dashboard, with **+ Create study** in the Studies page and **Back**, **Studies**, **Levels**, and **Sign Out (username)** in the top navigation bar.
4. Leave the terminal running while using the game. To stop the local web server later, press **Ctrl+C**. Firebase information stays saved online.

**This is already the full online website running locally**: no GitHub deployment required. You still need internet to authenticate and save to Firebase.

### Step 8 — Create a separate results database for your test study

This is recommended for testing the study-to-database link. It is **not** a second administrator database or a second login system.

1. Return to **the same Firebase project** from Step 3. In **Realtime Database → Data**, use the database selector and choose **Create new database**. Give it a name such as `pizzicato-test-results`, choose a region, and create it with **locked/restricted Security Rules**. Creating a second database in the same project requires the **Blaze** plan. Firebase documentation: <https://firebase.google.com/docs/database/usage/sharding>.
2. Make a note of the **entire HTTPS URL** of this *second* database (it must end at the database hostname, e.g. `https://pizzicato-test-results....firebasedatabase.app/`). **Do not replace** the central `databaseURL` in the web setup wizard with this URL.
3. Keep access restricted: the Pizzicato **Cloud Functions server**, not participants' browsers, writes study results. If you chose locked rules, leave them locked for this test. Each database instance has its own rules; rules deployed in Step 4 govern the **default** database only.
4. Return to the Pizzicato administrator dashboard. You will paste this second database URL into the study form in Step 9. Saving the study performs a **server-side write test**. If it fails, check you created the instance in the **same Firebase project** and that the Functions service account can access it. Connecting a database from a *different Firebase project* needs additional service-account/IAM permissions and is an advanced setup; do not use that route for your first test.

**Alternative — one database only:** If you cannot create a second instance, you can leave the study's **Optional linked Firebase Realtime Database URL** blank in Step 9. Results will then use the central default database, but that does **not** test a separate linked database.

### Step 9 — Create and connect your first test study

1. In the administrator dashboard, select **Studies → + Create study**. Type a **Study title** such as `First test`. The study's unique ID is **generated automatically**, so you do not need to enter one.
2. Paste the second database URL from Step 8 into **Study results database URL**. Or leave it empty to store results in the administrator database.
3. In **Schedule options**, check **Weekly study** if you want separate timelines and a session limit for each week. For this test, turn it **on** and set the maximum completed sessions per week to **1**. With Weekly study off, Week 1 repeats without a weekly session cap.
4. Check **Restrict study to a start/end date** if you want to block play before the start date or after the end date. For this test, turn it **on**, set **Start date** to today, and leave **End date** empty. When the date restriction is off but the weekly option is on, **Week 1 reference date** sets the calendar week numbering without blocking participants before that date.
5. In the **Study timeline**, drag the slide rectangles to arrange **Start → Play level → Break → Play level → End**. The blue **Drop here** marker shows exactly where the slide will be inserted. Click a slide to edit its contents. Use **×** on a slide to delete it. Use a bundled level initially and choose **1** loop for faster testing.
6. Optional: check **Override default gameplay settings** to edit the settings as labeled switches and number fields. Check **Use group-specific gameplay settings** to add groups with their own settings. Hover over or focus the **ⓘ** beside any setting to see a short explanation.
7. Click **Create study**. Participant access is enabled automatically, and the system generates the study ID. Saving performs a write test if you provided a separate results database URL. Resolve any connection error before proceeding.

**Multiple weeks:** When **Weekly study** is checked, use **+ Add week** to create another horizontal row. Week 2 begins seven days after the Week 1 reference/start date. Pretest and posttest rows are also available. Each populated row must include a playable level. If Weekly study is unchecked, only the Week 1 row is used, but other rows are preserved if you re-enable weekly scheduling later.

### Step 10 — Make a test participant, play, and check results

1. From **Studies**, choose **Manage study** beside your test study, then **Participants**.
2. Enter a test participant username such as `testplayer01`, a strong password (short passwords are accepted for testing but unsafe), and optionally a group name. Leave the individual start date blank to use the study's settings. Click **+ Add participant**.
3. Open a **private/incognito browser window** at the same local web address. Sign in with the test participant username/password, not the administrator credentials.
4. Complete the Start → Play → Break → Play → End timeline. Return to the administrator window.
5. From **Manage study → Participants**, select **Download participant results (↓)** for that participant. Select **Download all participant data** at the top of **Participants** for one combined export.
6. Check Firebase Console → your **study results database → Data** for records under **`results/YOUR_GENERATED_STUDY_ID/`**. The administrator database still contains the study configuration, user accounts, uploaded levels, and progression records.
7. Test the weekly limit: after completing the single allowed weekly session, the participant should be unable to start another full session until their next week. If you disabled Weekly study, there is no weekly cap.

**If you upgraded from an earlier Pizzicato version with email-based admin accounts or `@pizzicato.example` participant/moderator accounts:** use the migration command in Step 11a **before trying to sign in with their new usernames**. New installations do not need migration.

**First-time setup is finished.** Return to Step 11 next time.

---

## EVERYDAY USE (after first-time setup)

### Step 11 — Start, manage studies, then stop

1. Open the repository folder in a terminal and run **`npm start`**. Open the address displayed in the terminal (often <http://localhost:8080/>) and sign in with your administrator or moderator username/password.
2. **Create and edit studies:** use **Studies → + Create study** or **Manage study → Edit Study**. Study IDs are generated automatically. Toggle weekly scheduling or start/end date restrictions as needed; edit slides in the horizontal timeline and click **Save changes**. Only administrators can edit studies.
3. **Upload shared levels:** use **Levels** in the top navigation, select a `.json` exported by Pizzicato Level Designer, enter a display name, and click **Upload level**. Its unique ID is generated automatically. Choose this level in any study's Play Level slide. An edited level must be published as a new entry (existing IDs are immutable).
4. **Manage participants and results:** use **Studies → Manage study → Participants** to create participants, edit group assignments and start dates inline, change usernames/passwords, activate/deactivate accounts, and download JSON results. Use **Download all participant data** at the top of the participant page for all participants.
5. **Manage moderators:** use **Studies → Manage study → Moderator accounts** (administrator only). Create a username/password, disable or re-enable a login, reset its password, or permanently remove it. Each moderator belongs to the study where you created the account; moderators may view and export its results but cannot edit study settings or manage accounts.
6. **Gameplay overrides:** in **Edit Study**, check **Override default gameplay settings** to edit the main settings. Check **Use group-specific gameplay settings** to create groups with separate settings, initially copied from the current defaults. Give participants the exact group name to apply these settings. Use **ⓘ** for short tooltips.
7. Use **Back**, **Studies**, **Levels**, and **Sign Out (username)** in the persistent top navigation. To stop the local server, press **Ctrl+C** in its terminal; data remains in Firebase.

**After pulling new code:** run `git pull` (if using Git), then `npm install`. If the update changes Cloud Functions or database rules (this dashboard update does), run `npm install --prefix functions` and redeploy with `firebase deploy --only functions,database --project YOUR-PROJECT-ID`. Restart `npm start` and test with sample accounts before a live study.


### Participant sessions and per-person schedules

In **Edit Study**, turn on **Limit each participant to a number of weeks** when appropriate. Set the number of weeks and choose either a researcher-assigned start date or the participant’s first login. The latter is written automatically to Firebase on first participant login. A separate global start/end-date restriction can also be enabled.

Under **Participants**, choose a study group (or **None**) from the dropdown. To update an existing participant, open **Edit group / condition and personal settings**, change the group and, if applicable, use the calendar field to adjust the start date, then **Save participant settings**. **Change username** and **Change password** update Firebase Authentication; the participant UID stays the same, preserving prior results. **Download participant results (↓)** downloads one person's results; **Download all participant data** downloads the entire study.

The Leiden-style login screen accepts only username and password, with **Show password**. During a study, results are sent once between levels rather than during loops. A participant sees an explicit **Retry Save** button if sending fails. After completing a scheduled session, a thank-you screen appears instead of the guest scoreboard.

**Upgrading from earlier versions:** The online dashboard, participant scheduling, and duplicate-completion handling require redeploying the latest Cloud Functions (`firebase deploy --only functions,database --project pizzicato-admin`) as well as updating the website. Use dummy participants to check database writes and completion before resuming an active study.

### Step 11a — Existing accounts only: migrate old email-based logins

**Skip this section for a brand-new Firebase project.** If a Firebase account was created with an actual email address (older admin accounts), or internally with `@pizzicato.example` (older participants/moderators), **updating the website alone will not convert it**. A trusted administrator must migrate it once. This keeps the **same Firebase UID, password, roles, group assignments, and study data**.

1. Make sure `npm run setup:web` was completed for the **existing central Firebase project** and you still have its private service-account JSON from Step 5. Back up the Firebase Authentication user list and Realtime Database first.
2. Find the account's existing email **in Firebase Console → Authentication → Users**. For example, it might be `researcher@university.edu` or `testplayer01@pizzicato.example`. This is the **only time** you need that old email: for the administrator's one-time migration command.
3. From the repository folder, type (replace all three example values):

   ```sh
   npm run account:migrate -- "researcher@university.edu" leadresearcher "/FULL/PATH/TO/service-account.json"
   ```

4. Repeat for every older account. Each username must be unique (ignoring upper/lowercase); a collision stops the change. Ask the user to **sign out** of older sessions and sign back in using **only** the new username and their **existing password**.
5. Password-reset emails will **not** reach these internal identifiers. For moderator passwords, use **Manage study → Moderator accounts → Reset password**. For an administrator password change, use a trusted Firebase Admin SDK operation or your organization's secure account-management process. **Do not email passwords or use Firebase email recovery with `@pizzicato.com`**.

### Step 12 — Optional: publish the same game on GitHub Pages (`main` or `dev`)

For the technical maintainer; **not necessary** for local browser testing.

1. Push the repository to GitHub and ensure **`.github/workflows/deploy-pages.yml`** exists on the default **`main`** branch and, if needed, on **`dev`**.
2. In GitHub, open **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**. Allow GitHub Actions if your organization restricts them.
3. For an **online/login-required** deployment, open your local **`web-config.local.json`** (created in Step 6). Copy its **entire JSON** into a GitHub repository Actions secret named **`PIZZICATO_WEB_CONFIG`** under **Settings → Secrets and variables → Actions**. This file contains *public Firebase web app settings only*. **Never** put a service-account file, password, or encrypted-vault passphrase in Actions secrets for building the site.
4. In Firebase **Authentication → Settings → Authorized domains**, add the GitHub Pages **hostname** (e.g. `yourname.github.io`, with no `https://` or repository path).
5. In GitHub open **Actions → Deploy GitHub Pages → Run workflow**. Select **Use workflow from: `main` or `dev`** and **site_mode: `online`** to require Firebase login, or **`guest`** for a public demo. Run the workflow and check for success.
6. Open the URL shown under **Settings → Pages**, usually `https://YOUR-USER.github.io/YOUR-REPO/` (including the repository path). Test the administrator login and one dummy participant session.

**Important:** Deploying `main` and `dev` does **not** make two live sites: **the latest deployment replaces the previous one** at the same Pages URL. To host a stable demo and a research site simultaneously, use separate repositories/forks, each with its own Actions settings and (if desired) Firebase project. GitHub Pages hosts only static website files; **Cloud Functions and database rules must still be deployed separately** using Step 4.

### Step 13 — Optional: other ways to run the game

- **Guest demo without Firebase:** run `npm run start:guest` in the repository folder. This does **not** sign in to a study or save results to the online database. Stop with **Ctrl+C**.
- **Local production-build preview:** run `npm run serve:build`, then visit <http://localhost:8080/>. It uses the current local web configuration and requires a working internet connection for online mode. Stop with **Ctrl+C**.
- **Offline participant packs and desktop applications (advanced):** offline participant packs remain a code-level capability but the button has been removed from the research dashboard. Provisioning offline packs now requires the advanced developer workflow; do not assume researchers can generate them in the browser. An offline app must be built with `mode: offline` and `allowGuest: false`, with no Firebase web config. Packaging scripts include `npm run build:win`, `npm run build:mac` and `npm run build:linux`. These builds and the offline security model require separate validation: locally exported results are not automatically uploaded, and offline packs cannot be remotely revoked. This is **not the same** as `npm start`, which connects live to Firebase.

---

## Help if a step fails

| Problem | What to check |
| --- | --- |
| `git`, `node` or `npm` is not recognized | Install Git/Node.js from Step 1, then restart the terminal. |
| `npm start` reports TypeScript TS2345, TS1323, TS2540, or TS2367, or a MediaPipe `vision_bundle.mjs` critical dependency warning | Stop the server with **Ctrl+C**, confirm you are using the latest repository source, then run `npm install` and `npm start` again. If the errors remain, send their exact text to the technical maintainer. |
| Website starts as a guest instead of asking for login | Run `npm run check:web`. If it says `guest`, rerun `npm run setup:web` with Firebase (`y`) and **restart** `npm start`. |
| Firebase login fails | Check administrator username/password, enabled **Email/Password** provider, central project ID, and (if relevant) authorized domain. All roles log in using their chosen username, not an email address. |
| You can sign in, but the dashboard says `functions/not-found` or permissions error | Check `firebase deploy --only functions,database --project YOUR-PROJECT-ID`, that web setup uses the **same** central project, and that the administrator account was created there. |
| Saving a study says it cannot write to its linked database | Check the **second Realtime Database URL**, instance/project permissions, and that Blaze is active. For a first test, leave the optional study URL blank and use the default database until linking is fixed. |
| Custom level will not upload/play | Upload a supported **Level Designer `.json`**, not an MP4. Try the bundled levels first. Use a new library ID for each revision. |
| Camera/microphone does not work | Use a compatible browser, allow camera permission, and use **localhost** or HTTPS (GitHub Pages). Check another application is not using the camera. |
| GitHub Pages build fails in `online` mode | Verify the Actions secret is exactly `PIZZICATO_WEB_CONFIG` and contains a valid **public web** JSON config. The workflow intentionally refuses invalid online configuration. |
| Need to change the central Firebase project | Repeat backend setup and admin creation for the new project, rerun `npm run setup:web`, then restart the website. Switching the web config alone does not migrate studies or accounts. |


### Level Selection slides and participant-specific settings

When editing a study, open its visual timeline and choose **+ Level selection**. Click the new slide to select up to **9 levels**, their BPM options, and the number of loops per play. Choose an unlock rule: **All unlocked** immediately, **Sequential** (each next choice unlocks after the previous one has been played), or **Weekly** (one additional choice unlocks per study week). **Number of plays** sets how many completed levels are required before the timeline continues; set it to **0** for free play, where the participant can pick levels repeatedly and presses **Finish session** when ready (after completing at least one play). Each completed play records a separate result in Firebase. For a study with multiple weeks, put a Level Selection slide into each relevant week's row. The existing weekly session limits and study date restrictions still apply.

On the **Participants** page, use the search field to find an account. The compact action buttons have hover descriptions: **↓** export, **✎** edit group/condition, date and custom gameplay settings, **U** change username, **P** change password, **○/●** deactivate/reactivate, **×** remove. Enable **Use custom gameplay settings** when adding or editing a participant to override study/group gameplay values. Unchecking it removes that participant's individual override. For participants created without custom settings, the individual-settings editor remains hidden; change their group instead, or create a new account with custom settings if needed. Participant results download as **one JSON file per request**, named with the *study display name*, participant username (or all-participants), and local date/time.

**Password safety:** The interface permits passwords from **1 to 128 characters** for participants and moderators. Firebase Authentication requires at least 6 characters internally, so Pizzicato converts passwords shorter than 6 characters to a deterministic 64-character value before Firebase handles them. This makes them technically compatible, **not secure**: a one-character password is extremely easy to guess. Use long, randomly generated passwords for real studies; treat short passwords as disposable test-only credentials. Existing passwords of 6 or more characters work unchanged. Passwords are never stored in the study database.

## Research-data and security reminders

- The **admin/service-account JSON, password, and optional vault passphrase must stay private**. Firebase Authentication holds the username-derived internal identifiers and login credentials; neither plain nor encrypted login credentials belong in the public browser code. A protected encrypted vault is only a backup, not a sign-in database.
- A linked study results database stores **results only**; shared custom levels, study definitions, accounts and progress remain in the central database. Study settings are created through the administrator dashboard, not by manually pasting user credentials into Firebase.
- **Use pseudonymous participant IDs.** Check consent, access control, backup, retention/deletion policy, and ethical approval before enrolling real participants. For critical research data, export and back up regularly.
- Online results may be retained in a **central recovery queue** if a linked results database is unreachable. A download that says **partial** is *not a complete dataset*. Automatic recovery/re-delivery is not fully implemented; verify both exports and database data before relying on them.
- This codebase has source-level regression tests (`npm test`), but **a real Firebase deployment, browser gameplay, role permissions and multi-week study have not been fully end-to-end verified**. Always pilot with test accounts and a separate test dataset.

**Useful links:** [Firebase Console](https://console.firebase.google.com/) · [Firebase Realtime Database — multiple instances](https://firebase.google.com/docs/database/usage/sharding) · [GitHub Actions](https://docs.github.com/en/actions) · [Node.js](https://nodejs.org/)

## Additional developer commands

- `npm test`: Run the repository's source-level regression tests.
- `npm run build`: Create a production browser build in `dist/`.
- `npm run electron`: Run the Electron desktop version (requires a build).
- `npm run build:win`, `npm run build:mac`, `npm run build:linux`: Package a desktop release on an appropriate build machine; test each platform before distribution.

### Original project and attribution

Pizzicato originated as a serious game developed for TU Delft's *Building Serious Games* course (IN4302). The accompanying [publication](https://ieeexplore.ieee.org/document/10645594) describes the original project. Contributors: Ravi Snellenberg, Joris Rijsdijk, Scott Jochems, Martin Starkov, and Luca Stoffels. The original game builds on [natonato's Phaser/TypeScript/Electron template](https://github.com/natonato/phaser3-typescript-vite-electron-template).
