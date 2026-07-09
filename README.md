# Anixi Health — Admin Panel

The **Admin Panel** is the internal operations console for the [Anixi Health](https://anixihealth.com) ecosystem — a complete chronic-care platform built for Africa. It is used by the Anixi operations team to verify clinicians, publish health-education content to condition communities, manage users, and monitor platform activity across all three connected portals.

This panel is part of a three-portal ecosystem:

| Surface | Audience | Stack |
| --- | --- | --- |
| **Admin Panel** (this repo) | Anixi operations team | Angular |
| Doctor Portal | Doctors & caregivers | React + CRA |
| Mobile app | Patients / Warriors | React Native (Expo) |

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Available scripts](#available-scripts)
- [Project structure](#project-structure)
- [Authentication & access control](#authentication--access-control)
- [Deployment](#deployment)
- [Branching & workflow](#branching--workflow)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Operations dashboard** — key platform metrics visualised with ECharts (`ngx-echarts`).
- **Doctor verification** — review submitted applications, inspect supporting documents in an in-app PDF viewer, and approve or reject clinicians through a streamlined workflow.
- **Content management** — author, preview, and publish health-education articles/posts to the right condition communities.
- **User management** — browse and manage platform users.
- **Secure admin login** — Firebase Auth sign-in gated to an allow-list of admin UIDs.

## Tech stack

- **Framework:** [Angular 21](https://angular.dev/) (standalone bootstrap + NgModules)
- **Language:** TypeScript 5.9
- **UI library:** [ng-zorro-antd 21](https://ng.ant.design/) (Ant Design for Angular)
- **Styling:** Tailwind CSS 4 (via `@tailwindcss/postcss`) + component CSS
- **Backend / data:** Firebase 12 via [`@angular/fire`](https://github.com/angular/angularfire) — Authentication, Cloud Firestore, Storage
- **Charts:** ECharts 6 + `ngx-echarts`
- **Icons:** `lucide-angular`
- **Text utilities:** `linkifyjs` / `linkify-html`

## Prerequisites

- **Node.js 20 LTS** (Angular 21 requires a modern Node runtime)
- **npm 9+**
- **Angular CLI 21** — `npm install -g @angular/cli` (optional; scripts use the local CLI)
- Access to the shared **Firebase project** (`anixihealth24`)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server (http://localhost:4200)
npm start

# 3. Create a production build (output in dist/)
npm run build
```

The dev server runs on **http://localhost:4200** and reloads on save.

## Configuration

Environment configuration lives in `src/environments/`:

- `environment.ts` — production config
- `environment.development.ts` — local development config

Each file exports the Firebase config plus the admin allow-list:

```ts
export const environment = {
  production: true,
  firebaseConfig: {
    apiKey: "…",
    authDomain: "anixihealth24.firebaseapp.com",
    projectId: "anixihealth24",
    storageBucket: "anixihealth24.appspot.com",
    messagingSenderId: "…",
    appId: "…",
    measurementId: "…",
  },
  // Firebase UIDs allowed to access the admin panel
  ADMIN_UIDS: ["…"],
  // Default content author when no session is present
  ADMIN_USER_ID: "…",
};
```

> These are **client-side Firebase keys** and are safe to ship; access is enforced by Firestore/Storage security rules and the `ADMIN_UIDS` allow-list. Point the panel at a different Firebase project by updating these files.

## Available scripts

| Script | Description |
| --- | --- |
| `npm start` | Start the Angular dev server on port 4200 |
| `npm run build` | Produce a production build in `dist/` |
| `npm run watch` | Rebuild continuously using the development configuration |
| `npm test` | Run unit tests with Karma + Jasmine |

## Project structure

```
src/
├── main.ts                    # Bootstrap
├── environments/              # Firebase config & admin allow-list
└── app/
    ├── app.module.ts          # Root module
    ├── app-routing.module.ts  # Root routes
    ├── pages/                 # Feature pages
    │   ├── login/             # Two-column auth screen
    │   ├── dashboard/         # Metrics & charts
    │   ├── doctor-verification/  # Verification queue
    │   ├── application-details/  # Single application review
    │   ├── content/           # Article/post management
    │   ├── users/             # User management
    │   ├── pdf-viewer/        # In-app document viewer
    │   └── admin-panel/       # Shell / layout
    ├── components/            # Shared components (cards, brand logo, profile menu)
    ├── services/             # auth, firestore, post services
    ├── guards/               # Route guards
    ├── models/               # Data models
    ├── pipes/                # Custom pipes (post title, linkify)
    └── utils/                # Helpers
```

## Authentication & access control

- Sign-in is handled by **Firebase Auth** through `services/auth.service.ts`.
- Access is restricted to the Firebase UIDs listed in `environment.ADMIN_UIDS`; non-admin accounts are denied entry even with valid credentials.
- Route guards under `app/guards/` protect authenticated areas of the panel.

## Deployment

The panel deploys to **Vercel** as an Angular production build.

- **Build command:** `npm run build`
- **Output directory:** `dist/anixi-admin-panel/browser` (Angular application build output)

Notes:

- **Dependency compatibility** — `@angular/fire` is pinned to `21.0.0-rc.0` to match Angular 21 peer requirements. Keep it aligned when upgrading Angular.
- **Component style budgets** — configured in `angular.json` (`anyComponentStyle`: 8 kB warning / 12 kB error). Rich pages such as the login screen may approach the warning threshold; adjust the budget if a legitimately styled component exceeds it.

## Branching & workflow

- `main` — production / deploy branch.
- `dev` — active development branch.
- Feature branches are merged via pull request into `dev`, then promoted to `main`.

## Troubleshooting

- **`npm install` ERESOLVE with `@angular/fire`** — ensure `@angular/fire` matches the installed Angular major version (currently `21.0.0-rc.0` for Angular 21).
- **Build fails on a CSS budget** — reduce the component's stylesheet size or raise the `anyComponentStyle` budget in `angular.json`.
- **Login rejected for a valid account** — confirm the user's Firebase UID is present in `environment.ADMIN_UIDS`.
- **`No space left on device` during builds** — clear caches: `rm -rf .angular dist && npm cache clean --force`.
