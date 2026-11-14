# PetroVision

PetroVision's `public/` folder contains the web UI. `github/` is the original
Express/TypeScript API folder, and `backend/` is the deployment-ready API copy
for Vercel. The UI sends authentication and feature data to the API; browser
localStorage is used only to retain the login tokens.

## Run the app locally

Requirements: Node.js 20 or newer and npm.

1. In a terminal, go to `github/` and install the dependencies:

   ```powershell
   cd github
   npm install
   ```

2. Start the API and UI server:

   ```powershell
   npm run dev
   ```

3. Open [http://localhost:3000/index.html](http://localhost:3000/index.html) to browse prices and
   the station map as a guest. Create an account and sign in when you want to
   contribute reports or access rewards. The API health check is at
   [http://localhost:3000/health](http://localhost:3000/health).

The server also exposes the API directly at `/api`. For example, use
`POST /api/auth/register` to create an account. Set `ADMIN_EMAIL` in
`github/.env` before registering the matching email address to grant that
account the admin role. Do not use the development JWT secret outside local
development.

For a separate VS Code Live Server UI (port 5500 or 5501), start the API as
above and serve `public/` with Live Server. The UI uses `http://localhost:3000/api`
on those ports.

## Deploy to Vercel

Deploy the UI and API as **two Vercel projects from this same repository**.
Use the deployment-ready API copy in `backend/`; the original `github/` folder
remains in place:

1. **Deploy the API project first.** Import the repository in Vercel, set
   **Root Directory** to `petro-vision/backend`, choose the Express framework if
   Vercel asks, and leave the detected/default build settings in place. Vercel
   deploys the default-exported Express app in `petro-vision/backend/src/app.ts`.
   Before the first deployment, set `JWT_SECRET` and
   `FIREBASE_SERVICE_ACCOUNT_JSON` in the API project's Environment Variables.
   Never paste these secrets into chat or commit them. After deployment, copy
   the assigned HTTPS origin (for example,
   `https://your-api-project.vercel.app`).
2. **Point the UI at the API.** In `public/js/config.js`, set
   `window.PETROVISION_API_URL` to the API origin followed by `/api`, for
   example `https://your-api-project.vercel.app/api`. Commit and push this setting,
   then deploy another Vercel project from the same repository with **Root
   Directory** set to `petro-vision/public`. It is a plain static site; no build
   command is needed. The `index.html` file redirects visitors to `home.html`.
3. **Allow the UI origin.** In the API Vercel project's Environment Variables,
   set `FRONTEND_ORIGIN` to the exact HTTPS origin assigned to the UI project
   (no path or trailing slash), for example
   `https://your-ui-project.vercel.app`. For local Live Server development, the
   existing localhost origins are also allowed. Redeploy the API after changing
   this setting.
4. `FIREBASE_SERVICE_ACCOUNT_JSON` must contain the Firebase service-account
   JSON as a single-line value; the API refuses to start on Vercel without it.
   `JWT_SECRET` must be a unique, long random secret. Set `ADMIN_EMAIL` before
   registering the email address that should receive admin privileges, and
   configure `GOOGLE_MAPS_API_KEY` only if needed. Enter all secrets directly
   in Vercel's Environment Variables settings; never put them in the repository
   or `public/js/config.js`.
5. Redeploy after changing project settings or environment variables. Test
   `https://your-api-project.vercel.app/api/health`, then test registration,
   sign-in, and a protected UI page on the deployed site.

The backend stores account profiles, email lookups, and login sessions in
Firestore when `FIREBASE_SERVICE_ACCOUNT_JSON` is configured. Vercel API
deployments require this setting; local development can still use in-memory
storage. Garage vehicles, rewards (balances, catalog, rules, redemptions, and
activity), stations, price and availability reports, and alert subscriptions
and notifications also use Firestore. Trips and refuels remain process-local
and are not durable across Vercel function restarts or instances. See
[backend/README.md](./backend/README.md) for setup details and deployment
limitations.

- `public/` — static UI and its deployed API URL configuration
- `public/js/api.js` — shared API client, session handling, and UI/API data
  mapping
- `backend/` — deployment-ready Express API copy for the Vercel project
- `github/` — original Express API folder, left in place
- `backend/src/` — API, domain models, and in-memory backend store
- `backend/test/` — API tests

Run the backend checks from `backend/`:

```powershell
npm test
npm run build
```
