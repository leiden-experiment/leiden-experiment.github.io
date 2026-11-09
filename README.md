# Pizzicato

Pizzicato is a hand-tracking music game for browser demonstrations and research studies. It supports bundled legacy levels and imported Pizzicato Level Designer JSON levels. The research version can use Firebase Authentication (username and password), a central administrator database, one central administrator Realtime Database for every study and all results, and a visual study timeline with optional weekly scheduling and date restrictions.

**This is the only setup and usage guide for this repository.** Follow **Steps 1–10** once to set up the research system, then use **Step 11** whenever you return to it. Steps 12–13 cover GitHub Pages, guest mode, and offline/desktop options.

For a quick guest-only preview (no Firebase account or database): install dependencies with `npm install`, then run `npm run start:guest`. For a Firebase-connected local website, follow the setup steps below instead.

---

## Before starting: what goes where?

| Place | What it holds |
| --- | --- |
| **Central Firebase project** (the *administrator project*) | Firebase Authentication for username/password logins (internal email identifiers); **default Realtime Database** for studies, participant/moderator profiles, schedules, published JSON levels, and progress; deployed Cloud Functions for protected operations. |
| **Your computer** | A browser website started by `npm start`, plus a local file containing **public** Firebase web settings. It connects to real online Firebase; you do **not** need GitHub Pages to test. |
| **GitHub Pages** (optional) | Hosts the same browser website. It is **not** a database or a Firebase backend. |

**You will need:** a computer with internet access, permission to create a Firebase project and configure its billing (Cloud Functions generally require **Blaze/pay-as-you-go**), your GitHub repository URL or a ZIP of the code, and a password manager. Get approval for potential charges and set Firebase/Google Cloud billing alerts. **Use test accounts and fictional participant data first.**

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
4. To add another trusted lead administrator, repeat the command using a **different username**. Give researchers only their **username/password**, *never* the Admin SDK private key. Usernames are **case-insensitive and unique among administrators and active study accounts**. When a study is archived, its participant and moderator usernames can be reused for new accounts; their old results remain associated with their original Firebase user IDs.

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

   It should say **`online`** and display your central Firebase Project ID. The wizard creates `web-config.local.json` on this computer, ignored by Git. All studies and results use this one central database.

### Step 7 — Start Pizzicato locally and sign in

1. Run:

   ```sh
   npm start
   ```

2. A browser may open automatically. Otherwise open the address displayed by the terminal, usually <http://localhost:8080/>.
3. Sign in with the **administrator username and password** from Step 5 (e.g. `leadresearcher`, **not** `leadresearcher@pizzicato.com`). You should see the Pizzicato research dashboard, with **+ Create study** in the Studies page and **Back**, **Studies**, **Levels**, and **Sign Out (username)** in the top navigation bar.
4. Leave the terminal running while using the game. To stop the local web server later, press **Ctrl+C**. Firebase information stays saved online.

**This is already the full online website running locally**: no GitHub deployment required. You still need internet to authenticate and save to Firebase.

### Step 8 — How study storage works (no extra database needed)

All studies use the **same administrator Firebase Realtime Database** you connected in Step 3. You do not create or enter a separate database URL for a study. The database stores study timelines, groups, participant profiles, progress, the shared level library, and participant results. Firebase Authentication (in the same Firebase project) verifies usernames and passwords.

If you used an older Pizzicato version with a *different results database*, new results now go to the administrator database. **Existing data in the old database is not automatically copied.** Before retiring the old database, export your historical results using the old version or migrate them separately; keep a read-only backup until you have verified the exports.

### Step 9 — Create your first test study

1. In the administrator dashboard, select **Studies → + Create study**. Type a **Study title** such as `First test`. The study's unique ID is **generated automatically**, so you do not need to enter one.
2. No database URL is needed: this study automatically uses the administrator database.
3. In **Schedule options**, choose a mode from **Weekly scheduling**. **Single session** is the default: the same timeline repeats each login with no weekly cap. Choose **Fixed schedule** or **Individual schedule** for a weekly programme, then set **Maximum completed sessions per week** to **1** for this test.
4. For a weekly programme, choose one of these schedules:
   - **Fixed schedule:** Everyone follows the same dates. Set the **Study start date (Week 1)** to today and enter **Number of study weeks** (at least 1). The calculated inclusive end date is displayed for reference. Automatic participants follow the shared week boundaries and stop weekly training when the configured weeks expire; a manually assigned personal calendar can continue after that shared end date.
   - **Individual schedule:** Set **Weeks per participant** (for example, 3). Week 1 starts on each participant's first regular login, **after their Pre-test if you added one**. No shared Week 1 reference date is required. Researchers can assign a particular week in **Participants** to start a separate rolling calendar at the participant’s next login, without altering the original first-login date. For this first test, select **Fixed schedule**.
5. In the **Study timeline**, drag the slide rectangles to arrange **Start → Play level → Break → Play level → End**. The blue **Drop here** marker shows exactly where the slide will be inserted and follows the drag between weeks, disappearing after drop or cancellation. Click a slide to edit it directly beneath its own week. Use the red **×** in its upper-right corner to delete it. Use a bundled level initially and choose **1** loop for faster testing.
6. Optional: check **Override default gameplay settings** or **Use group-specific gameplay settings**. Under **Research data**, turn on **Collect normalized positions and radii** only if consent and your protocol require it; it is off by default. Hover over **ⓘ** for help.
7. Click **Create study**. Participant access is enabled automatically, and the system generates the study ID. The study is saved to the central database.

**Single-session timeline safety:** The **Single session** option uses one repeatable timeline, without displaying a numbered week. Existing slides should reappear each time you open **Edit Study**; changing schedule options must not erase them. The app now asks for explicit confirmation before replacing a populated timeline with an empty one. **If an earlier version already saved a blank timeline**, it cannot reconstruct the deleted slides automatically; restore them from a Firebase database backup or re-create them in the editor. Test this with a sample study before editing active research schedules.

**Multiple weeks:** With **Fixed schedule** or **Individual schedule** selected, the equal-width **+ Add week**, **+ Pre-test**, and **+ Post-test** buttons appear together above the timeline. Week 2 starts seven days after the applicable date (the shared fixed start, or each participant's personal start). Pre-test is before Week 1; it can be completed before the study start date and does not start an individual participant's weekly clock. After the final week, weekly training locks. If there is a Post-test, a researcher must unlock it using **Participants → Edit settings → Next session stage → Post-test**. After the Post-test, the study is fully completed. Every populated row needs a playable level. Switching to Single session uses only the first timeline; review your study before saving because rows outside the chosen duration are removed from the editor.

### Step 10 — Make a test participant, play, and check results

1. From **Studies**, choose **Manage study** beside your test study, then **Participants**.
2. Enter a test participant username such as `testplayer01`, a strong password (short passwords are accepted for testing but unsafe), and optionally a group. For both weekly modes, Pizzicato records the participant’s first regular login automatically (after Pre-test, if configured). In a **fixed** schedule, participants normally follow the study dates. The start date is information-only and is not manually editable. Click **+ Add participant**.
3. Open a **private/incognito browser window** at the same local web address. Sign in with the test participant username/password, not the administrator credentials.
4. Complete the Start → Play → Break → Play → End timeline. Return to the administrator window.
5. From **Manage study → Participants**, select **Download** for that participant. Select **Download all participant data** at the top of **Participants** for one combined export.
6. Check Firebase Console → **Realtime Database → Data** in your **administrator database** for records under **`results/YOUR_GENERATED_STUDY_ID/`**. Study configurations, accounts, levels and progress are in this same database.
7. Test the weekly limit: after completing the single allowed weekly session, the participant should be unable to start another full session until their next week. Single-session studies have no weekly cap.

**If you upgraded from an earlier Pizzicato version with email-based admin accounts or `@pizzicato.example` participant/moderator accounts:** use the migration command in Step 11a **before trying to sign in with their new usernames**. New installations do not need migration.

**First-time setup is finished.** Return to Step 11 next time.

---

## EVERYDAY USE (after first-time setup)

### Step 11 — Start, manage studies, then stop

1. Open the repository folder in a terminal and run **`npm start`**. Open the address displayed in the terminal (often <http://localhost:8080/>) and sign in with your administrator or moderator username/password.
2. **Create and edit studies:** use **Studies → + Create study** or **Manage study → Edit Study**. Study IDs are generated automatically. Choose a single-session study, a **fixed weekly schedule**, or an **individual weekly schedule**. Edit the horizontal timeline and click **Save changes**. Only administrators can edit studies.
3. **Upload shared levels:** use **Levels** in the top navigation, select a `.json` exported by Pizzicato Level Designer, enter a display name, and click **Upload level**. Its unique ID is generated automatically. Choose this level in any study's Play Level slide. An edited level must be published as a new entry (existing IDs are immutable).
4. **Manage participants and results:** use **Studies → Manage study → Participants** to create participants, edit group assignments and personal weekly schedules, change usernames/passwords, activate/deactivate accounts, and download JSON results. Use **Download all participant data** at the top of the participant page for all participants.
5. **Manage moderators:** use **Studies → Manage study → Moderators** (administrator only). Create a username/password, disable or re-enable a login, reset its password, or permanently remove it. Each moderator belongs to the study where you created the account; moderators may view and export its results but cannot edit study settings or manage accounts.
6. **Gameplay overrides:** in **Edit Study**, check **Override default gameplay settings** to edit the main settings. Check **Use group-specific gameplay settings** to create groups with separate settings, initially copied from the current defaults. Give participants the exact group name to apply these settings. Use **ⓘ** for short tooltips.
7. In **Studies**, use **Disable** to pause a study without archiving it; participants see “This study is currently disabled.” Use **Enable** to reopen it. The study, accounts and results remain intact. Use **Back**, **Studies**, **Levels**, and **Sign Out (username)** in the navigation. To stop the local server, press **Ctrl+C** in its terminal; data remains in Firebase.

**Dashboard loading:** After an administrator or moderator logs in, Pizzicato loads the authorized studies, study settings, participants, moderators, current progress, and level *names* once into temporary browser memory. After that, switching pages does not fetch them again. Changes made with **Save**, **Create**, **Enable/Disable**, or **Remove** are sent to Firebase and reflected in the dashboard after Firebase confirms success. Any unsaved form changes stay in the form; they are not yet in Firebase. Clicking **Sign Out** clears the temporary data.

**Participant progress:** The participant list shows completed-session counts and the last date/time a full session finished, as known when you logged in. Use **Refresh participant data** under **+ Add participant** to reload participant accounts and progress from Firebase without downloading their result files. Historical sessions recorded before this timestamp feature will show that their completion time is unavailable. These labels do not live-update while the dashboard remains open. Hover over **Download all participant data** to see its explanation: clicking **Download** fetches all results currently available in Firebase, including results uploaded since your login. Results and published level JSON are **not** downloaded at administrator login; results are fetched only when requested.

**Conflicting edits:** If the same study was changed from another administrator tab/device since you logged in, **Save changes** will refuse to overwrite that newer version. Sign out, sign back in, and reapply your edit. You do not have to limit administrator logins to one device.

**After pulling new code:** run `git pull` (if using Git), then `npm install`. If the update changes Cloud Functions or database rules (this dashboard update does), run `npm install --prefix functions` and redeploy with `firebase deploy --only functions,database --project YOUR-PROJECT-ID`. Restart `npm start` and test with sample accounts before a live study.


### Participant sessions and per-person schedules

In **Edit Study → Schedule options**, the **Weekly scheduling** dropdown always offers **Single session**, **Fixed schedule**, and **Individual schedule**. There is no separate Weekly Study checkbox:

- **Single session:** The same slide timeline repeats at each login without a weekly session limit. This is the default for newly created studies.
- **Fixed schedule:** Enter **Study start date (Week 1)** and **Number of study weeks** (1–104). Week 1 begins on that start date; every later week begins exactly seven days afterward. The dashboard displays the **calculated inclusive end date** as read-only information, not an editable access gate. Participants using Automatic follow the shared calendar, with access locked after the configured number of weeks. Finishing the allowed sessions in a week shows the days until the next week opens. Reducing the number of weeks removes later regular timeline rows (Pre-test/Post-test remain). A researcher can exempt a participant from the shared dates by assigning a personal rolling weekly calendar. Dates are shown as **DD-MM-YYYY**; Firebase stores ISO dates internally.
- **Individual schedule:** Enter the number of weeks (for example, three). Each participant's first normal login sets their Week 1 start date. If a **Pre-test** exists, they must complete it first. After the Pre-test, they must **sign out and sign back in** for that next login to establish the weekly start date. The original first regular login date is shown as read-only information in Participants. Selecting a particular week under **Next session stage** assigns a new personal seven-day calendar, anchored on their next authenticated login; it does not change the recorded original start date.
- In either mode, **Pre-test** is available before Week 1 and **does not count as the first weekly login**. When the weekly phase is over, participants are locked out of further weekly play. **Post-test never unlocks automatically**: assign it in **Participants → Edit settings → Next session stage → Post-test** when ready to test in the lab. Completing the Post-test marks the whole study complete. The maximum completed sessions per week applies in both modes. Researcher-assigned regular weeks persist as a personal weekly calendar until changed back to Automatic; special Pre-test/Post-test assignments remain individual test stages. Existing results are not deleted.

Under **Participants**, choose a study group (or **None**) from the dropdown. To update an existing participant, open **Edit settings**, change the group and optionally assign a personal weekly schedule under **Next session stage**, then **Save participant settings**. The first regular login date is displayed alongside participant information and cannot be changed. **Username** and **Password** update Firebase Authentication; the participant UID stays the same, preserving prior results. **Download** downloads one person's results; **Download all participant data** downloads the entire study.

The Leiden-style login screen accepts only username and password, with **Show password**. When an online participant logs in, the game first downloads **all unique shared JSON levels assigned anywhere in their study** (including level-selection choices and future weeks), showing download progress and level display names. Only after those downloads finish does the game start. It also prepares their programmatic note audio on the initial game loading screen and keeps it cached for subsequent levels. Bundled legacy level assets load through the game’s usual initial Phaser loading phase. A missing published level or a lost connection prevents starting, rather than failing in the middle of a play. This uses browser memory, not permanent file downloads: after a page reload/sign-out the levels must be downloaded again. Larger studies may take longer on the first login. The server still checks permission before starting each play, and saves progress between levels; these network requests are not eliminated. During a study, results are sent once between levels rather than during loops. If a result cannot be sent, the participant sees **Retry Save**. Successfully validated results are first committed to the administrator database together with progress. If result delivery is temporarily unavailable, the validated result remains in the central administrator database for retry or researcher export. After completing a scheduled session, a thank-you screen appears instead of the guest scoreboard.

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
| Firebase login fails | A wrong username or password now displays **Invalid username or password** (Firebase does not safely distinguish the two). Other errors explain disabled accounts, connection problems, or temporary lockouts in plain language. Check the enabled **Email/Password** provider, central project ID, and authorized domain if sign-in is unavailable. All roles use usernames, not an email address. |
| You can sign in, but the dashboard says `functions/not-found` or permissions error | Check `firebase deploy --only functions,database --project YOUR-PROJECT-ID`, that web setup uses the **same** central project, and that the administrator account was created there. |
| Custom level will not upload/play | Upload a supported **Level Designer `.json`**, not an MP4. Try the bundled levels first. Use a new library ID for each revision. |
| Camera/microphone does not work | Use a compatible browser, allow camera permission, and use **localhost** or HTTPS (GitHub Pages). Check another application is not using the camera. |
| GitHub Pages build fails in `online` mode | Verify the Actions secret is exactly `PIZZICATO_WEB_CONFIG` and contains a valid **public web** JSON config. The workflow intentionally refuses invalid online configuration. |
| Need to change the central Firebase project | Repeat backend setup and admin creation for the new project, rerun `npm run setup:web`, then restart the website. Switching the web config alone does not migrate studies or accounts. |
| A Continue button says “step is no longer available”, reports `internal` / `INVALID_ARGUMENT`, or a study result reports `400` | Deploy the latest Cloud Functions, then restart `npm start` and reload the page. The fixed-week Continue transaction now omits unset total-session values that Firebase otherwise rejects. Non-gameplay slides now resync the server's position when a Continue request is repeated or stale; they never skip an uncompleted step. A level receives server-issued authorization at launch; results remain recoverable if progression changes mid-play. If a result is marked **for review**, it was retained but not counted as an automatic progression update. If saving fails, use **Download Backup** and contact a researcher. |
| Creating a moderator or participant shows `provisionAccount: 400` | Check whether the username is already registered across any study, whether a valid group is selected, and and whether a valid study group has been selected. Start dates are recorded automatically. The exact reason should appear in the dashboard error message; this is separate from the results database connection. |
| Uploaded JSON level fails when starting | Upgrade to the current game and re-deploy Functions if you updated the backend. Empty sound-loop lists in custom levels can be omitted by Realtime Database; the player now handles those. Bundled legacy levels are unaffected. |



### Level Selection slides and participant-specific settings

When editing a study, open its visual timeline and choose **+ Level selection**. Click the new slide to select up to **9 levels** and the number of loops per play. Bundled levels offer a **three-position BPM slider** for their actual supported tempos: **90, 115, or 130 BPM**. Uploaded JSON levels instead use an exact BPM slider, with **Reset BPM** to restore the level's authored tempo. New Play Level slides and newly added selection choices default to **1 loop**; existing saved slides keep their own loop settings. Choose an unlock rule: **All unlocked** immediately, **Sequential** (each next choice unlocks after the previous one has been played), or **Weekly** (one additional choice unlocks per study week). **Number of plays** counts completed plays of **any selectable levels combined** before the timeline continues; set it to **0** for free play, where the participant can pick levels repeatedly and presses **Finish session** when ready (after completing at least one play). Each completed play records a separate result in Firebase, including both the level ID and its display name. The level-selection screen shows the number of plays remaining (or unlimited). For a study with multiple weeks, put a Level Selection slide into each relevant week's row. The existing weekly session limits and study date restrictions still apply.

On the **Participants** page, use the search field to find an account. The compact action buttons have hover descriptions: **Download** export, **Edit settings** edit group/condition and personal gameplay settings, **Username** change username, **Password** change password, **Disable/Enable** toggle access, **×** remove. Enable **Use custom gameplay settings** when adding or editing a participant to override study/group gameplay values. Unchecking it removes that participant's individual override. You can enable or disable custom gameplay settings for an existing participant at any time, even if their account was originally created without them. Participant results download as **one JSON file per request**, named with the *study display name*, participant username (or all-participants), and local date/time.

**Password safety:** The interface permits passwords from **1 to 128 characters** for participants and moderators. Firebase Authentication requires at least 6 characters internally, so Pizzicato converts passwords shorter than 6 characters to a deterministic 64-character value before Firebase handles them. This makes them technically compatible, **not secure**: a one-character password is extremely easy to guess. Use long, randomly generated passwords for real studies; treat short passwords as disposable test-only credentials. Existing passwords of 6 or more characters work unchanged. Passwords are never stored in the study database.


### Participant settings, resume behavior, and privacy

The visual timeline determines every participant screen. There is no separately configured Welcome message. Add **Start** and edit its message for an introduction; add **Break** for a pause followed by Continue; and add **End** for a final message without a Continue button.

In **Edit Study → Participant screen controls**, check **Allow participants to edit settings** and choose exactly which gameplay settings they may adjust. This shows a **Settings** button alongside **Setup Camera** on study screens such as Start, Break, Play Level, and Level Selection. The End slide remains button-free. You no longer need a dedicated Settings slide. Older studies containing one are converted into an ordinary instruction slide when edited, keeping their message and previously authorized settings. The **Settings** button opens the game’s original visual **Options** scene, with a live target-size preview, Phaser sliders for volume/size/timing, and checkboxes for researcher-approved options. **Save and Exit** stores those choices against the participant account for future logins; **Reset to Defaults** previews the study/group defaults until you save; **Exit Without Saving** restores the earlier values. This is a separate screen, so the background study buttons cannot be clicked. Offline participants keep saved settings in their local participant pack. Loop count is set on each study level slide and is not an editable participant, group, or study-wide gameplay override.

**Mouse gameplay:** Participants cannot click notes with their mouse by default; they must use tracked hand movements. Researchers may explicitly allow mouse control through gameplay overrides or by enabling it as an editable participant setting. Guest gameplay keeps its original defaults.

**Resume after refresh/logout:** Study participants resume at the last successfully completed gameplay checkpoint. Continue presses on Start, Break, and other instruction screens *after* that checkpoint are not treated as a permanent restart position: the participant will see those instructions again after a new login. This also applies if no level has been completed yet. Completed level records, play counts, and full-session completions are preserved. This reset happens on login, not during ordinary navigation. The first login fetch may take slightly longer because it updates the checkpoint in Firebase.

**Finger-position privacy:** Under **Edit Study → Research data**, the checkbox **Collect normalized positions and radii** is **off by default**. When off, the game records scores and timing but omits normalized target positions, target radii, finger positions, and finger radii. The backend removes these fields from online submissions as a second safeguard. Turning this on affects future plays, not previous results. Obtain appropriate research consent before enabling it.

**Names and decimal values:** Uploaded levels must have distinct display names regardless of capitalization (`strum3` and `Strum3` conflict). For decimal settings, use periods (`0.5`), not commas (`0,5`). Renaming a participant preserves their Firebase user ID and updates participant identifiers in historical results and pending results stored in the central administrator database.

## Research-data and security reminders

- The **admin/service-account JSON, password, and optional vault passphrase must stay private**. Firebase Authentication holds the username-derived internal identifiers and login credentials; neither plain nor encrypted login credentials belong in the public browser code. A protected encrypted vault is only a backup, not a sign-in database.
- The single administrator Realtime Database stores study results, levels, study definitions, accounts and progress. Study settings are created through the administrator dashboard.
- **Use pseudonymous participant IDs.** Check consent, access control, backup, retention/deletion policy, and ethical approval before enrolling real participants. For critical research data, export and back up regularly.
- If a result write fails, the result is first retained in the participant progress record in the central database, then copied to the results table. Researcher exports include pending results when necessary. Check exports and test result recovery before collecting research data.
- This codebase has source-level regression tests (`npm test`), but **a real Firebase deployment, browser gameplay, role permissions and multi-week study have not been fully end-to-end verified**. Always pilot with test accounts and a separate test dataset.

**Useful links:** [Firebase Console](https://console.firebase.google.com/) · [Firebase Realtime Database](https://firebase.google.com/docs/database) · [GitHub Actions](https://docs.github.com/en/actions) · [Node.js](https://nodejs.org/)

## Additional developer commands

- `npm test`: Run the repository's source-level regression tests.
- `npm run build`: Create a production browser build in `dist/`.
- `npm run electron`: Run the Electron desktop version (requires a build).
- `npm run build:win`, `npm run build:mac`, `npm run build:linux`: Package a desktop release on an appropriate build machine; test each platform before distribution.

### Original project and attribution

Pizzicato originated as a serious game developed for TU Delft's *Building Serious Games* course (IN4302). The accompanying [publication](https://ieeexplore.ieee.org/document/10645594) describes the original project. Contributors: Ravi Snellenberg, Joris Rijsdijk, Scott Jochems, Martin Starkov, and Luca Stoffels. The original game builds on [natonato's Phaser/TypeScript/Electron template](https://github.com/natonato/phaser3-typescript-vite-electron-template).


### Dashboard and research play controls

The administrator dashboard uses a **black-and-gray dark theme with rectangular controls**, with subtle blue for add actions, green for save actions, red for removal, and distinct muted colors for slide types. The research login inputs have no green glow. On **Levels**, uploaded levels have a **Download** button and an **×** delete button. Deletion asks for confirmation and is blocked only if the level is assigned in an **active** study or an active study’s participant-specific timeline. Archived studies do not block deletion; download any old level JSON that you may need to reproduce archived sessions before deleting it. **+ Create study** fills its row; every study has **Manage study** and a **×** remove button. Removing a study asks for confirmation, archives it, removes it from the active dashboard, and disables study accounts; existing results and historical user IDs are **retained** in Firebase for audit. The original study display name and its participant/moderator usernames become available for reuse (including usernames from studies archived with older versions). Export needed data before removing an active study. Inside **Manage study**, **Edit Study**, **Moderators**, and **Participants** are shown. Moderators and participants have compact rows and an **×** removal button; participant management uses labeled actions rather than icons.

Study **Start** slides include **Setup Camera** as well as **Continue**. The Continue button does not show a temporary “Continuing…” message. During research sessions, buttons on between-level screens are activated **by mouse only**, so hand tracking cannot accidentally advance screens. Guest gameplay retains its existing hand-based menu controls.

**When updating the backend**, redeploy Cloud Functions and database rules with `firebase deploy --only functions,database --project YOUR-PROJECT-ID`, then restart `npm start`. Research levels now check the server's current study position *before* starting and obtain a 24-hour, server-issued authorization. Submission uses that authorization to preserve a completed play even if its progress position changes before saving; such data is marked **for researcher review**, not silently counted as a completed step. On a failed result save, the completion screen offers **Retry Save** and **Download Backup**. If a backup is downloaded, send that JSON file to a researcher; it must not be counted automatically or imported twice. All studies use the single central administrator Realtime Database for new results; no per-study database link is needed. A connected live Firebase test remains essential before collecting research data.


### Imported JSON levels: chords, drums and study tempo

Level Designer/Level Editor JSON now groups notes starting together into **one chord target**, as in the original Level Editor. A shared four-bar drum backing loop is included and follows the selected tempo. Previously uploaded generated levels are repaired automatically when they load; you do not need to delete and re-upload them. Legacy MP3/MP4 levels remain unchanged.

In **Edit Study → Study timeline**, select a **Play level** slide or a level within a **Level selection** slide. For uploaded JSON levels, move the **Tempo** slider to any whole-number BPM from **60 to 200**, or click **Use original BPM** to retain the tempo saved in the JSON. The slider does not change the underlying shared level. Bundled legacy levels have their own **three-position BPM slider (90, 115, 130)** for the only three supported tempos. Newly added levels default to **1 loop**; previously saved studies are not changed. Participants download and prepare their study's JSON levels and selected tempos when logging in; this may make the initial loading screen longer but reduces interruptions during gameplay.

The **Participants** page shows when each participant last completed an entire study session. The **Download all participant data** button requests the latest results from Firebase when clicked, including results uploaded after you logged in. If a participant gets sent back to a previous study screen after completing a slide, their current progress can be reconciled on the server without counting the same completion twice.

### Selecting levels in a research study

In **Edit Study**, add a **Level selection** slide. Pick up to nine levels. For a
shared JSON level, use the BPM slider to choose any tempo from 60–200 BPM, or
click **Reset BPM** to use the level's authored tempo. Participants see the
researcher-assigned level display names in a grid of up to three columns.

If a username is already registered in another study, account creation tells
the researcher which study owns that username. Active study accounts are globally unique; usernames associated only with archived studies can be reused.

### Weekly timeline editing and dates

Choose **Weekly scheduling** first (Single session, Fixed for one shared calendar, or Individual for separate calendars for each participant). Its short explanation appears beneath the dropdown. For Fixed scheduling, enter a **study start date** and **number of weeks** (the calculated inclusive end date appears beside the fields). For Individual scheduling, enter **weeks per participant**. Both modes have a **maximum completed sessions per week**. Shortening the fixed week count removes timeline weeks beyond the new limit and always retains Week 1. All researcher-facing dates use **DD-MM-YYYY** (for example `14-11-2026`), while Firebase uses ISO dates internally. The level upload date, completion timestamps, and result download timestamps are likewise shown/named in European date order.

**+ Add week** is only available up to the permitted number of weeks. It copies the previous week's complete slide sequence, including Level Selection choices, into the new week. Edit the new week independently to change specific assignments. To give one participant a different ongoing schedule, choose a week under **Next session stage**; their personal seven-day calendar starts on their next authenticated login and follows later weeks automatically. **Automatic** restores the original fixed or individual study calendar. Their recorded first regular login date never changes.

### Study playback and editing notes

- **Progression and loop limit:** A study level checks its required progression count **only after the musical loop completes**. If the threshold was met, the next layer/screen begins. Otherwise, the progress bar resets to zero for the next loop. Reaching the maximum number of fully played loops also advances, even if the threshold was not met. It proceeds to the next playable layer or the next study screen.
- **End slide:** Shows only its message, with no Continue, Camera, or Settings buttons. Completion is saved automatically when it opens. If confirmation fails, the participant is asked to refresh the page to retry.
- **Study editing:** The dashboard reads the actual study revision from Firebase, not the potentially older summary index. If an old dashboard revision disagrees with Firebase but the originally loaded study settings (including its scheduling settings) are still unchanged, the save reconciles the revision automatically. If another researcher actually changed the study, saving is blocked to protect their changes.

### Testing participant stages and editing individual settings

In **Studies → Manage Study → Participants**, open **Edit settings** on a participant.

- **Next session stage** appears for weekly studies. **Automatic** (the default) follows the study's Fixed or Individual dates. Choosing **Week N** creates a **persistent personal seven-day schedule**, beginning on the participant's **next authenticated login** with Week N as day one; seven days later they advance to Week N+1. A participant can therefore complete a fixed-calendar study later than its shared calculated end date. To assign the same week again and restart its clock, choose that week while the **Keep personal calendar** option is displayed. Choosing **Automatic** removes the personal calendar and restores the original study scheduling (which may already be past its final week). Pre-test and Post-test remain researcher-assigned special test stages, not persistent weekly schedules. Existing research results are never deleted.
- **Participant start date** is read-only information in the participant roster, reflecting the **first regular login** after any configured Pre-test (or the first login if none). Both Fixed and Individual studies record it. Reassigning a week does **not** change that date. If Pre-test is still required, a manually assigned weekly calendar waits until it is completed and a fresh login occurs. After a configured Post-test is completed, the participant remains in the final completed state.
- **Use custom gameplay settings** is available for both newly created and existing participants. Check it to configure their individual settings, then save. Uncheck it to return to group/study defaults.
- **Completed sessions this week:** Open **Edit settings** to adjust the current weekly allowance if a test run must be repeated. It is capped by the study's maximum sessions per week. Historic results and the separately displayed **total completed sessions** remain unchanged. Researchers can increase or decrease the allowance even if the participant has already opened that week's session. Changing the count retires that week's unfinished session and creates a fresh session identifier; the participant must **reload or sign back in** to start from its first slide. A correction is blocked only while results are queued for saving, so pending research data is not lost. **Refresh participant data** to see recent progress.
- Ask participants to **sign out and sign back in** after changes, so the study plan and preloaded levels reflect the newly assigned stage. Prior completed-session results and dates are retained.


### v1.8.25 — Repeat the most recent study week; larger game button labels

- In fixed or individual weekly schedules, a regular week with no explicitly defined timeline reuses the slides from the latest earlier defined regular week. For example, a three-week study with only Week 1 defined replays those steps in Weeks 2 and 3; if Weeks 1 and 2 are defined, Week 3 reuses Week 2. Pre-test and Post-test are never repeated automatically. A deliberately defined empty week does **not** silently inherit another week. The effective week number, weekly session allowance, progress checkpoint, session ID, saved results, and weekly level-unlock rules still use the participant's **actual** week number. This also applies to researcher week overrides and participant-specific timelines. To customize an upcoming week, use Add Week in the timeline editor; it duplicates the previous week's slides for editing.
- Removed “Off by default” from the normalized data collection tooltip; the checkbox still defaults to unchecked.
- Phaser button labels now render above the sprite and use a large rendered text texture and `Text.setScale` based on **the sprite's actual displayed size** and measured `Text.width`/`Text.height`, instead of iterative `setFontSize` and dynamic word wrapping, which could shrink labels too much. Labels refit when a button is scaled. Removed residual 25px font overrides from level-management buttons.
- Redeploy Firebase Functions for the new week-resolution logic.

### v1.8.26 — Cross-week drag cleanup and fixed-week Continue transaction

- The study timeline uses one movable **Drop here** preview across all weeks. Moving a slide from one week to another and then back, or cancelling the drag, leaves no stale insertion markers in other weeks.
- Fixed-schedule participants can press **Continue** on Start and Break slides even when they have never completed a full study session. The Firebase progress transaction omits uninitialized optional fields instead of passing `undefined` to Realtime Database (which previously surfaced as `internal` / `INVALID_ARGUMENT`). Repeated Continue requests still resynchronize without skipping slides.
- Phaser button labels now have approximately 7% horizontal and 10% vertical interior padding on each side while remaining centered and proportional to the actual displayed sprite size.
- Regression tests exercise cross-week drag/drop/cancel behavior and a strict simulated RTDB transaction that rejects undefined fields; full browser rendering and live Firebase deployment still require testing. **Deploy the updated Cloud Functions** (`firebase deploy --only functions --project pizzicato-admin`) and update the website to apply both the backend and frontend fixes.


### v1.8.27 — Persistent participant calendars and week-count fixed schedules

- **Fixed study:** Configure **Study start date (Week 1)** and **Number of study weeks** (minimum 1; maximum 104). The read-only **Calculated end date** is the inclusive final day (`start + 7 × weeks − 1`). There is no manually entered study end date. Automatic participants may attend weekly sessions only during those scheduled weeks. The timeline cannot include regular weeks beyond the week count; reducing the count trims them while preserving Pre-test/Post-test.
- **Individual study:** Configure **Weeks per participant**. Automatic participants follow their own first-regular-login calendar. For both schedule types, **Maximum completed sessions per week** remains effective.
- **Personal week assignments:** The participant editor defaults to **Automatic**. Assigning **Week N** requests a new independent seven-day calendar that begins on the participant's **next real sign-in**, not when the researcher clicks Save or when an existing page refreshes. The selected week is day one; every seventh day it advances to the next week, ignoring the fixed study's shared start/end dates until all scheduled weeks have elapsed. After the last week, weekly training locks until Post-test is assigned. The **Keep personal calendar** choice lets researchers save other settings without resetting the clock; selecting a numbered week again starts a new personal clock at the next sign-in. **Automatic** cancels the exemption.
- **Start date as information:** The roster shows the recorded first regular login date (after Pre-test if one exists), in **DD-MM-YYYY**. Researchers no longer edit that account field. It is retained when manually changing weeks. A manually assigned weekly calendar must still respect a required Pre-test. Manually assigned Pre-test and Post-test remain special stages and Post-test completion is final.
- **Compatibility:** Existing studies with fixed `endDate` continue to run with their saved dates until edited; saving a fixed study in the new editor stores a week count and no explicit end date. Existing session history and old results are retained.
- The frontend and Cloud Functions both implement these changes. Deploy Functions with `firebase deploy --only functions --project pizzicato-admin` after updating the repository. In-memory Firebase and source-level tests verify the scheduling logic; a full production browser build and live Firebase deployment still require local verification before research sessions.
