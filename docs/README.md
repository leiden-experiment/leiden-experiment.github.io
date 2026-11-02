# Pizzicato — one guide: first-time setup and everyday use

**Start here.** This is the only setup/use guide you need for the browser-based research version of Pizzicato. It is written for a lead researcher or a technical helper who can install software and copy commands; **you do not need to edit game code**.

**Follow Steps 1–10 once** to get from a GitHub repository to a working test study. **After that, go straight to Step 11** whenever you want to use Pizzicato again. Steps 12–13 are optional: GitHub Pages and offline/guest use.

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
3. Sign in with the **administrator username and password** from Step 5 (e.g. `leadresearcher`, **not** `leadresearcher@pizzicato.com`). You should see **Pizzicato · Research administration** with a **Create new study** button.
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

1. In the administrator dashboard, click **Create new study**.
2. Enter a simple **Study ID** (e.g. `test_study_01`) and **Title** (e.g. `First test`). Set **Default start date** to today in `YYYY-MM-DD` form (e.g. `2026-11-01`) so a test participant can start immediately.
3. Set **Maximum completed sessions per week** to **`1`** for an easy test of the weekly limit.
4. In **Optional linked Firebase Realtime Database URL (server-side access required)**, paste the second database URL from Step 8. To use the same central database instead, leave it blank.
5. In the **Study timeline**, use the existing Week 1 row or add slides to make **Start → Play level → Break → Play level → End**. Click a rectangle to edit its message or choose a level. Drag cards to rearrange them (or use their arrow buttons). Use a **bundled** level for the first test—no upload needed. Set each **level's loop count** to something small, e.g. 1.
6. Tick **Study enabled**, then click **Save study**. If the database is linked correctly, the study appears in the study list. **If saving reports that it cannot write to the linked database, do not ignore the error; fix the link or temporarily use the central database.**

**You can add multiple weeks:** open **Edit settings**, choose **+ Add week**, and arrange another horizontal row. Week 2 starts seven days after a participant's start date. A week must include at least one playable level. There are also optional pretest/posttest rows. Avoid changing a live participant's schedule partway through a session.

### Step 10 — Make a test participant, play, and check the results

1. In the study list, click **Participants / results** next to `test_study_01`.
2. Enter a **New username** such as `testplayer01` (4–40 characters, starting with a letter), a password of **at least 12 characters**, and optionally a group. Leave the participant-specific start date blank to use the study's date. Click **Add participant**.
3. Open a **private/incognito browser window** at the *same* local URL. Sign in using the test participant **username** and password. Do not use your administrator credentials in this window.
4. Complete the test timeline: Start → first level → Break/Resume → second level → End. Return to the dashboard in the administrator window.
5. Choose **Participants / results → Download data** for the test participant, or **Export full study** for a study-wide JSON/CSV export. Verify that the data contains the expected pseudonymous participant ID, week, level and completion records.
6. In Firebase Console, open the **second results database → Data** (if linked) and check for records under **`results/test_study_01/`**. The central database still contains study configuration, accounts, shared levels and participant progression. If you used the default database instead, results are stored there.
7. Try starting the study again as the participant: the **one completed session per week** limit should prevent a second full session. If something does not match, fix the test study before adding real participants.

**If you upgraded from an earlier Pizzicato version with email-based admin accounts or `@pizzicato.example` participant/moderator accounts:** use the migration command in Step 11a **before trying to sign in with their new usernames**. New installations do not need migration.

**First-time setup is finished.** Return to Step 11 next time.

---

## EVERYDAY USE (after first-time setup)

### Step 11 — Start, manage studies, then stop

1. Open a terminal in the Pizzicato repository folder (the one containing `package.json`).
2. Run **`npm start`**, then open **<http://localhost:8080/>** (or the address printed), and log in with your existing administrator or moderator credentials. You do **not** need to create Firebase projects or administrator accounts again.
3. **Create/change studies:** click **Create new study** or **Edit settings**. Drag weekly slide cards to set up Start, Play level, Break and End screens; set difficulty/BPM, loop count, group settings and weekly limit. Click **Save study** after changes.
4. **Share custom levels:** click **Shared level library**, select a `.json` exported by the separate **Pizzicato Level Designer**, enter a unique level ID and display name, then click **Publish JSON level**. In any study's Play level slide, choose that level or use `library:YOUR_LEVEL_ID`. **Publishing an edited version requires a new ID; existing published IDs are not overwritten.** The shared library is in the central Firebase database, not in one study's results database.
5. **Manage participants:** open **Participants / results** beside a study. Add accounts, set groups/individual start dates, disable accounts, and download participant or full-study data (JSON/CSV).
6. **Manage moderators (admin only):** click **Manage moderator accounts**. Select a study, enter a moderator username and a 12+ character password, then choose **Create moderator login**. Existing moderator accounts have **Disable login**, **Enable login**, **Set new password**, and **Remove moderator** actions. Moderators can view/export their assigned study's data but cannot edit study settings or create/delete accounts.
7. When finished, close the browser window and press **Ctrl+C** in the terminal to stop the local web server. The data remains in Firebase.

**After pulling new code:** in the repository folder run `git pull` (if using Git), `npm install`, `npm install --prefix functions` if backend dependencies changed, and rerun `firebase deploy --only functions,database --project YOUR-PROJECT-ID` **only if the backend/rules changed**. Then restart `npm start`. Back up your project and test before updating a live study.

### Step 11a — Existing accounts only: switch an old login to a username

**Skip this section for a brand-new Firebase project.** If a Firebase account was created with an actual email address (older admin accounts), or internally with `@pizzicato.example` (older participants/moderators), **updating the website alone will not convert it**. A trusted administrator must migrate it once. This keeps the **same Firebase UID, password, roles, group assignments, and study data**.

1. Make sure `npm run setup:web` was completed for the **existing central Firebase project** and you still have its private service-account JSON from Step 5. Back up the Firebase Authentication user list and Realtime Database first.
2. Find the account's existing email **in Firebase Console → Authentication → Users**. For example, it might be `researcher@university.edu` or `testplayer01@pizzicato.example`. This is the **only time** you need that old email: for the administrator's one-time migration command.
3. From the repository folder, type (replace all three example values):

   ```sh
   npm run account:migrate -- "researcher@university.edu" leadresearcher "/FULL/PATH/TO/service-account.json"
   ```

4. Repeat for every older account. Each username must be unique (ignoring upper/lowercase); a collision stops the change. Ask the user to **sign out** of older sessions and sign back in using **only** the new username and their **existing password**.
5. Password-reset emails will **not** reach these internal identifiers. For moderator passwords, use the dashboard's **Set new password** control. For an administrator password change, use a trusted Firebase Admin SDK operation or your organization's secure account-management process. **Do not email passwords or use Firebase email recovery with `@pizzicato.com`**.

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
- **Offline participant packs and desktop applications (advanced):** in the online administrator dashboard, open a participant and choose **Create offline pack**; distribute the pack and its separately chosen 12+ character password securely. An offline app must be built with `mode: offline` and `allowGuest: false`, with no Firebase web config. Packaging scripts include `npm run build:win`, `npm run build:mac` and `npm run build:linux`. These builds and the offline security model require separate validation: locally exported results are not automatically uploaded, and offline packs cannot be remotely revoked. This is **not the same** as `npm start`, which connects live to Firebase.

---

## Help if a step fails

| Problem | What to check |
| --- | --- |
| `git`, `node` or `npm` is not recognized | Install Git/Node.js from Step 1, then restart the terminal. |
| `npm start` reports TypeScript TS2345, TS1323, TS2540, or TS2367, or a MediaPipe `vision_bundle.mjs` critical dependency warning | Make sure you are using **Pizzicato v1.3.2 or newer** (the corrected source files). Stop the server with **Ctrl+C**; run `npm install`, then `npm start` again. Earlier repository ZIPs have these build issues. |
| Website starts as a guest instead of asking for login | Run `npm run check:web`. If it says `guest`, rerun `npm run setup:web` with Firebase (`y`) and **restart** `npm start`. |
| Firebase login fails | Check administrator username/password, enabled **Email/Password** provider, central project ID, and (if relevant) authorized domain. All roles log in using their chosen username, not an email address. |
| You can sign in, but the dashboard says `functions/not-found` or permissions error | Check `firebase deploy --only functions,database --project YOUR-PROJECT-ID`, that web setup uses the **same** central project, and that the administrator account was created there. |
| Saving a study says it cannot write to its linked database | Check the **second Realtime Database URL**, instance/project permissions, and that Blaze is active. For a first test, leave the optional study URL blank and use the default database until linking is fixed. |
| Custom level will not upload/play | Upload a supported **Level Designer `.json`**, not an MP4. Try the bundled levels first. Use a new library ID for each revision. |
| Camera/microphone does not work | Use a compatible browser, allow camera permission, and use **localhost** or HTTPS (GitHub Pages). Check another application is not using the camera. |
| GitHub Pages build fails in `online` mode | Verify the Actions secret is exactly `PIZZICATO_WEB_CONFIG` and contains a valid **public web** JSON config. The workflow intentionally refuses invalid online configuration. |
| Need to change the central Firebase project | Repeat backend setup and admin creation for the new project, rerun `npm run setup:web`, then restart the website. Switching the web config alone does not migrate studies or accounts. |

## Research-data and security reminders

- The **admin/service-account JSON, password, and optional vault passphrase must stay private**. Firebase Authentication holds the username-derived internal identifiers and login credentials; neither plain nor encrypted login credentials belong in the public browser code. A protected encrypted vault is only a backup, not a sign-in database.
- A linked study results database stores **results only**; shared custom levels, study definitions, accounts and progress remain in the central database. Study settings are created through the administrator dashboard, not by manually pasting user credentials into Firebase.
- **Use pseudonymous participant IDs.** Check consent, access control, backup, retention/deletion policy, and ethical approval before enrolling real participants. For critical research data, export and back up regularly.
- Online results may be retained in a **central recovery queue** if a linked results database is unreachable. A download that says **partial** is *not a complete dataset*. Automatic recovery/re-delivery is not fully implemented; verify both exports and database data before relying on them.
- This codebase has source-level regression tests (`npm test`), but **a real Firebase deployment, browser gameplay, role permissions and multi-week study have not been fully end-to-end verified**. Always pilot with test accounts and a separate test dataset.

**Useful links:** [Firebase Console](https://console.firebase.google.com/) · [Firebase Realtime Database — multiple instances](https://firebase.google.com/docs/database/usage/sharding) · [GitHub Actions](https://docs.github.com/en/actions) · [Node.js](https://nodejs.org/)
