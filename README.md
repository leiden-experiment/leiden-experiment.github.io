![5](https://github.com/user-attachments/assets/5177212a-fcff-4dc7-b25c-bbecc177b53b)

# Serious Game

This is a serious game developed for the Master's course "Building Serious Games" IN4302 at TU Delft. The publication accompanying it can be found [here](https://ieeexplore.ieee.org/document/10645594).

## Contributors

1. Ravi Snellenberg (Producer)
2. Joris Rijsdijk (Lead Designer)
3. Scott Jochems (Playtesting)
4. Martin Starkov (Lead Programmer)
5. Luca Stoffels (Lead Art and Sound)

## Available Commands

| Primary Commands | Description                                  |
| ---------------- | -------------------------------------------- |
| `npm install`    | Install project dependencies                 |
| `npm start` | Run local browser website (guest unless web setup was completed) |
| `npm run electron` | Run with Electron (locally) |
| `npm run build`  | Build a local version (in dist directory)    |
| `npm run build:exe` | Build a Windows executable folder directly in release |
| `npm run setup:web` | Easy setup for local Firebase browser login |
| `npm run check:web` | Check which Firebase project will be used |
| `npm run start:guest` | Run a guest-only browser demo |
| `npm run serve:build` | Test a production website build locally |
| `npm run admin:create -- USERNAME PATH` | Create a Firebase administrator (trusted machine only) |
| `npm run account:migrate -- OLD_EMAIL USERNAME KEY_PATH` | Migrate a legacy Firebase login without changing its password or UID |
| `npm run deploy` | Show GitHub Pages deployment instructions |

## Project Structure

`main.js` Entry point for Electron

`index.html` Entry point for HTML

`game.ts` Entry point for Phaser

`assets` Location of binary resources

## Dependencies

- [Node.Js](https://nodejs.org/en/download/) : Node.js LTS (GitHub Actions uses Node 22)
- [Phaser](https://phaser.io/) : HTML5 Game Framework
- [TypeScript](https://www.typescriptlang.org/) : Better than JavaScript

## Known Issues

From [natonato](https://github.com/natonato)'s [template repository](https://github.com/natonato/phaser3-typescript-vite-electron-template):

- Electron `useContentSize` not working properly.
  - Electron appears to include a title bar and menu in width/height by default.
  - `useContentSize` option was expected to solve this problem because it takes the size of the browser window and uses it, but the problem is that the phaser has set the 'height:100%' option throughout the document.
- Running Electron with Devtool, keyboard input ignored.
  - Devtool snatched keyboard input.

## Thanks to

[natonato](https://github.com/natonato) for his [great phaser electron template](https://github.com/natonato/phaser3-typescript-vite-electron-template).

## Unified Level Designer projects (Phases 1–3)

This version supports both bundled legacy MP4/MP3 levels and locally imported Level Designer JSON projects. From the main menu use **SELECT LEVEL** for legacy levels or **OPEN A LEVEL** to import and manage Designer JSON levels. Imported JSON levels use programmatically generated audio, can have their BPM/progression count adjusted, and persist locally in the browser profile. Run `npm run test:levels` for the format/asset regression checks. See [UNIFICATION_CHANGES.md](UNIFICATION_CHANGES.md) for the exact file changes, supported formats and testing limitations.

## Research setup, local website, and visual study builder

**[Start with the single step-by-step guide: docs/README.md](docs/README.md).**

That one guide covers:

1. **First-time setup:** clone/download the repository, install tools, create the central Firebase project, deploy secure Functions and rules, create administrator credentials, and connect the local browser game.
2. **Create a test study:** link a separate Firebase Realtime Database for study results, arrange weekly slide timelines, add a test participant, play through the study, and verify exported results.
3. **Everyday use:** run the local website, publish shared custom JSON levels, create/edit studies, manage moderators and participants, and export results.
4. **Optional deployment:** publish `main` or `dev` to GitHub Pages, use guest mode, and review offline/desktop options.

All users log in with a **username**, never a visible email address; the app uses `username@pizzicato.com` internally for Firebase Authentication. The research system uses Firebase Authentication for passwords, the central Realtime Database for study settings and shared level data, and optional linked Realtime Database instances for per-study results. Administrator account creation is performed locally on a trusted computer; no passwords or administrator keys are built into the public browser application.

**This remains development/research software:** a live Firebase integration, browser gameplay, access controls, camera permissions and study-data export must be tested end-to-end with fictional participants before real research use.
