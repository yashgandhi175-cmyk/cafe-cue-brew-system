# Production Deployment Guide: GitHub & Hostinger

This guide outlines the complete step-by-step process to deploy the **Cafe Cue & Brew Restaurant Management System** to GitHub and then host it on **Hostinger Business Hosting**.

> **Process Budget Note**: This stack should only ever run **ONE** persistent Node.js process on Hostinger (the NestJS backend). The Next.js frontend is configured for static export (`output: 'export'`) and must be uploaded as static HTML/JS/CSS files directly into `public_html/`. It must **never** be deployed as a second Node.js application in Hostinger hPanel.

---

## Part 1: Push Code to GitHub

### Step 1: Create a GitHub Repository
1. Open your browser and navigate to [GitHub](https://github.com).
2. Log in and click the **New** button (or go to `https://github.com/new`).
3. Set the Repository Name to `cafe-cue-brew-system`.
4. Choose **Public** or **Private** depending on your preference.
5. **Do NOT** check "Add a README", "Add .gitignore", or "Choose a license" (we already have these configured locally).
6. Click **Create repository**.
7. Copy the repository URL (choose HTTPS or SSH format; e.g. `https://github.com/username/cafe-cue-brew-system.git`).

### Step 2: Push Local Commits
Open your local terminal inside `e:/cafe-cue-brew-system` and execute:

```bash
# 1. Link your local repository to the remote GitHub repository
git remote add origin <PASTE_YOUR_GITHUB_REPOSITORY_URL>

# 2. Rename the branch to main (if not already done)
git branch -M main

# 3. Push the commits to GitHub
git push -u origin main
```

---

## Part 2: Setup Database on Hostinger

### Step 1: Create MySQL Database
1. Log in to your **Hostinger hPanel**.
2. Navigate to **Databases** > **MySQL Databases**.
3. Create a new database:
   * **MySQL Database Name**: `cafe_cue_brew` (Hostinger will prefix this; e.g., `u123456789_cafe_cue_brew`).
   * **MySQL Username**: `db_user` (Hostinger will prefix this; e.g., `u123456789_db_user`).
   * **Password**: Create a strong password and note it down safely.
4. Click **Create**.

### Step 2: Retrieve Host Details
1. Look at the database list under **MySQL Databases** on Hostinger.
2. Note down the **MySQL Host** (usually `localhost` or a specific IP/domain name).

---

## Part 3: Deploy Backend (NestJS API Server)

Hostinger Business hosting includes support for Node.js applications.

### Step 1: Configure Environment Variables
On the Hostinger file manager (or via local file edits before upload), create a `.env` file in the root of the `backend` folder:

```ini
# Production connection string (replace with Hostinger credentials)
DATABASE_URL="mysql://u123456789_db_user:YOUR_DB_PASSWORD@localhost:3306/u123456789_cafe_cue_brew?connection_limit=5&connect_timeout=10&pool_timeout=10"

# JWT configuration
JWT_SECRET="YOUR_SECURE_JWT_SECRET_STRING"
JWT_EXPIRATION="24h"

# Port (Hostinger manages this, but 8080 is standard)
PORT=8080

# System secrets for integrations
MARKETING_QUEUE_SECRET="CHOOSE_A_SECURE_API_KEY_SECRET"
WHATSAPP_API_URL="https://graph.facebook.com/v17.0"
WHATSAPP_ACCESS_TOKEN="YOUR_WHATSAPP_TOKEN"
WHATSAPP_PHONE_NUMBER_ID="YOUR_WHATSAPP_PHONE_ID"
WHATSAPP_VERIFY_TOKEN="YOUR_WHATSAPP_VERIFY_TOKEN"
WHATSAPP_APP_SECRET="YOUR_WHATSAPP_SECRET"
```

### Step 2: Build the Backend Code
Locally, build the production distribution in `backend/`:

```bash
# Inside e:/cafe-cue-brew-system/backend
npm run build
```
This generates the compiled JavaScript inside the `backend/dist/` directory.

### Step 3: Upload Files to Hostinger
Using **Hostinger File Manager** or **FTP (FileZilla)**, upload the contents of the `backend` folder to your Hostinger server (e.g., in a folder named `/home/username/public_html/backend`):
* **Upload**: `dist/`, `prisma/`, `package.json`, `package-lock.json`, and `.env`.
* **Do NOT upload**: `node_modules/` or `src/` (to keep transfers fast and light).

### Step 4: Configure Node.js Web App in Hostinger
1. In Hostinger hPanel, go to **Websites** > **Node.js**.
2. Click **Create Application**:
   * **App Name**: `cafe-backend`
   * **App Directory**: `public_html/backend`
   * **Domain/Subdomain**: Select the domain or subdomain (e.g., `api.yourrestaurant.com` or `yourrestaurant.com/api`).
   * **Startup File**: `dist/main.js`
   * **Node.js Version**: Select 18 or 20 (recommended).
3. Click **Create**.

### Step 5: Install Dependencies & Run Database Migrations
1. In the Hostinger Node.js Dashboard, click on **SSH Console** or log in via your system SSH client.
2. Navigate to your app directory:
   ```bash
   cd public_html/backend
   ```
3. Install production dependencies and sync the database schema:
   ```bash
   # Install dependencies
   npm install --production

   # Run Prisma schema verification and update tables
   npx prisma db push
   ```

---

## Part 4: Deploy Frontend (Static Export)

> **IMPORTANT**: Do NOT create a Node.js application in Hostinger hPanel for the frontend. The frontend compiles to static HTML/CSS/JS files and is served directly by Hostinger's web server (Apache/LiteSpeed).

### Step 1: Configure Production API URL
Before building, configure the backend API URL in `frontend/.env.production` (or `.env.local`):

```ini
NEXT_PUBLIC_API_URL="https://api.yourrestaurant.com"
```

### Step 2: Build the Static Export
Locally inside `e:/cafe-cue-brew-system/frontend`, run:

```bash
npm install
npm run build
```

Because `frontend/next.config.ts` is configured with `output: 'export'`, this produces a static `out/` folder containing static `index.html` and assets (NOT `.next/`).

### Step 3: Upload Static Assets to Hostinger
Using **Hostinger File Manager** or **FTP (FileZilla)**:
1. Upload the **contents** of the `frontend/out/` directory directly into Hostinger's `public_html/` (or your domain's document root).
2. Ensure `index.html` sits directly in the root of `public_html/`.
3. Do **NOT** upload `node_modules/`, `.next/`, or run any Node.js server commands for the frontend.

---

## Part 5: Setup Hostinger Cron Job for Marketing Queue

To process queued campaigns periodically:
1. Go to **Advanced** > **Cron Jobs** in Hostinger hPanel.
2. Create a new Cron Job:
   * **Type**: HTTP request
   * **URL to call**: `https://api.yourrestaurant.com/marketing/queue/process?batchSize=50&executionTimeout=25`
   * **HTTP Header**: Add `X-CCB-Marketing-Key: CHOOSE_A_SECURE_API_KEY_SECRET`
   * **Interval**: Every 5 minutes (or custom interval, e.g. `*/5 * * * *`).
3. Click **Save**.
