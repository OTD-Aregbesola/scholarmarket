# ScholarMarket Production Deployment Guide

Step-by-step instructions for taking ScholarMarket from development to a production deployment on Vercel (frontend + API) and Stellar Mainnet (Soroban contracts), backed by MongoDB Atlas.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Variables Reference](#2-environment-variables-reference)
3. [MongoDB Atlas Setup](#3-mongodb-atlas-setup)
4. [Soroban Contract Deployment — Testnet](#4-soroban-contract-deployment--testnet)
5. [Soroban Contract Deployment — Mainnet](#5-soroban-contract-deployment--mainnet)
6. [Vercel Deployment](#6-vercel-deployment)
7. [Post-Deployment Validation](#7-post-deployment-validation)
8. [CI/CD — GitHub Actions](#8-cicd--github-actions)
9. [Database Backup and Recovery](#9-database-backup-and-recovery)
10. [Monitoring and Error Tracking](#10-monitoring-and-error-tracking)
11. [Rollback Procedure](#11-rollback-procedure)

---

## 1. Prerequisites

| Tool | Minimum version | Purpose |
|---|---|---|
| Node.js | 20 | Next.js runtime |
| npm | 10 | Package manager |
| Rust + Cargo | stable | Compile Soroban contracts |
| Stellar CLI (`stellar`) | 21 | Deploy and invoke contracts |
| Docker | 24 | Local MongoDB (dev only) |
| `mongodump` / `mongorestore` | 100.9 | Backup and restore |

### Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown
```

### Install the Stellar CLI

```bash
cargo install --locked stellar-cli --features opt
stellar --version
```

---

## 2. Environment Variables Reference

Copy `.env.example` to `.env.local` before running locally, and mirror every value in the Vercel dashboard for production. `NEXT_PUBLIC_*` variables are baked into the client bundle at build time and must be set before `npm run build`.

### Core application

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | Public URL of the deployed app, e.g. `https://scholarmarket.vercel.app` |
| `JWT_SECRET` | Yes | ≥ 32 random bytes — used to sign auth tokens. Generate with `openssl rand -hex 32` |
| `ADMIN_WALLETS` | No | Comma-separated wallet addresses granted admin access (case-insensitive) |

### Database

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | Full MongoDB Atlas connection string, including username, password, and cluster host |
| `MONGODB_DB` | Yes | Database name (default: `scholarmarket`) |
| `MONGODB_MAX_POOL_SIZE` | No | Max connection pool size (default: `150`) |
| `MONGODB_MIN_POOL_SIZE` | No | Min connection pool size (default: `20`) |
| `MONGODB_TIMEOUT_MS` | No | Connection timeout in ms (default: `5000`) |

### File storage (Pinata / IPFS)

| Variable | Required | Description |
|---|---|---|
| `PINATA_JWT` | Yes | Pinata API JWT for uploading files and metadata to IPFS |
| `NEXT_PUBLIC_GATEWAY_URL` | Yes | Pinata gateway base URL for reading pinned content, e.g. `https://gateway.pinata.cloud` |

### Email

| Variable | Required | Description |
|---|---|---|
| `SMTP_HOST` | For email | SMTP server hostname |
| `SMTP_PORT` | For email | SMTP port (default: `587`) |
| `SMTP_USER` | For email | SMTP username |
| `SMTP_PASS` | For email | SMTP password |
| `EMAIL_FROM` | For email | Sender address shown in outgoing emails |

### Stellar / Soroban

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_STELLAR_NETWORK` | Yes | `testnet` or `mainnet` |
| `NEXT_PUBLIC_STELLAR_RPC_URL` | Yes | Soroban RPC endpoint. See table below for standard URLs |
| `NEXT_PUBLIC_HORIZON_URL` | Yes | Horizon REST API base URL |
| `NEXT_PUBLIC_EXPLORER_URL` | No | Stellar expert block explorer URL |
| `NEXT_PUBLIC_MATERIAL_REGISTRY_CONTRACT_ID` | Yes | Deployed `MaterialRegistry` contract ID (set after step 4/5) |
| `NEXT_PUBLIC_PURCHASE_MANAGER_CONTRACT_ID` | Yes | Deployed `PurchaseManager` contract ID (set after step 4/5) |
| `NEXT_PUBLIC_SOROBAN_CONTRACT_ID` | No | Legacy alias kept for compatibility |
| `NEXT_PUBLIC_ACCEPTED_ASSET` | No | Default accepted asset symbol (default: `USDC`) |
| `STELLAR_ADMIN_PUBLIC_KEY` | Yes | Platform admin Stellar public key (server-side only) |
| `STELLAR_ADMIN_SECRET` | Yes | Platform admin secret key for signing admin transactions — never commit this |

**Standard RPC and Horizon URLs**

| Network | RPC URL | Horizon URL |
|---|---|---|
| Testnet | `https://soroban-testnet.stellar.org` | `https://horizon-testnet.stellar.org` |
| Mainnet | `https://soroban-mainnet.stellar.org` | `https://horizon.stellar.org` |

### Horizon resilience (optional tuning)

| Variable | Default | Description |
|---|---|---|
| `STELLAR_HORIZON_FALLBACKS` | — | Space or comma-separated backup Horizon endpoints |
| `STELLAR_HORIZON_TIMEOUT_MS` | `8000` | Timeout before failing over |
| `STELLAR_HORIZON_RETRIES` | `2` | Retry attempts before failover |

### Fee management (optional tuning)

| Variable | Default | Description |
|---|---|---|
| `STELLAR_SURGE_FEE_THRESHOLD` | `500` | p95 fee threshold in stroops above which surge pricing kicks in |
| `STELLAR_SURGE_FEE_MULTIPLIER` | `3` | Fee multiplier during moderate surge |
| `STELLAR_HIGH_SURGE_FEE_MULTIPLIER` | `5` | Fee multiplier during extreme congestion |
| `STELLAR_MAX_FEE_STROOPS` | `10000` | Hard ceiling on the fee the app will pay |

### Transaction recovery

| Variable | Default | Description |
|---|---|---|
| `RECOVERY_LOOKBACK_LEDGERS` | `200` | Number of recent ledgers scanned during recovery mode |
| `CHECKOUT_MAX_ADDRESS_WARNINGS` | `2` | Repeated address mismatches before the session is cleared |

### GitHub Actions backup secrets

Set these in **Repository Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `BACKUP_MONGODB_URI` | Connection string with dedicated backup-user credentials |
| `MONGODB_DB` | Database name (mirrors `MONGODB_DB` env var) |
| `BACKUP_S3_BUCKET` | Destination S3 or Cloudflare R2 bucket name |
| `BACKUP_S3_REGION` | AWS region, e.g. `us-east-1` |
| `BACKUP_S3_ENDPOINT` | Custom endpoint for Cloudflare R2 or MinIO (optional) |
| `BACKUP_AWS_ACCESS_KEY_ID` | Access key ID for backup storage |
| `BACKUP_AWS_SECRET_ACCESS_KEY` | Secret access key for backup storage |
| `BACKUP_SLACK_WEBHOOK_URL` | Slack Incoming Webhook for failure alerts (optional) |

### Monitoring

| Variable | Description |
|---|---|
| `SENTRY_DSN` | Sentry DSN for server-side error tracking (omit to disable) |
| `NEXT_PUBLIC_SENTRY_DSN` | Same DSN exposed to the browser bundle |

### Health probes

Three endpoints are available for orchestrators:

| Endpoint | Purpose |
|---|---|
| `GET /api/health/live` | Liveness. Returns 200 while the Node process is running. It calls no dependencies. |
| `GET /api/health/ready` | Readiness. Returns 200 only when MongoDB, Redis, Pinata, email, Stellar and the indexer pass. Otherwise 503. |
| `GET /api/health` | Backward-compatible aggregate. Keeps the original `services` string map and adds `indexerLag` and `checks`. |

Readiness fails when Redis is configured but unreachable, and when indexer lag exceeds the configured threshold. When `REDIS_URL` is unset, Redis is reported as `not_configured` and does not fail readiness because the cache is optional.

Tuning variables, all optional:

| Variable | Default | Description |
|---|---|---|
| `HEALTH_CHECK_TIMEOUT_MS` | `2000` | Timeout applied to each dependency check |
| `HEALTH_RPC_CACHE_TTL_MS` | `5000` | TTL for the shared RPC health response used by Stellar and lag checks |
| `INDEXER_LAG_THRESHOLD` | `50` | Ledgers of lag allowed before readiness fails. Set to `0` to disable the threshold. |

The readiness payload reports `indexerLag` with `lag`, `latestLedger`, `lastIndexedLedger` and `threshold`.

---

## 3. MongoDB Atlas Setup

### 3a. Create a cluster

1. Log in to [cloud.mongodb.com](https://cloud.mongodb.com).
2. Create a new **Project** and then a **Cluster** (M10 or higher recommended for production workloads).
3. Choose your cloud provider and region closest to your Vercel deployment region.

### 3b. Create a database user

1. Navigate to **Database Access → Add New Database User**.
2. Choose **Password** authentication.
3. Grant the user **Atlas Admin** or a custom role with `readWrite` on the `scholarmarket` database.
4. Save the username and password — you will need them for the connection string.

### 3c. Configure network access

1. Navigate to **Network Access → Add IP Address**.
2. For Vercel serverless functions, which use dynamic IPs, you must allow `0.0.0.0/0` (all IPs). You can restrict this further using Vercel's [IP allowlist](https://vercel.com/docs/security/deployment-protection) feature on Pro plans.
3. If running a self-hosted indexer, add its static IP instead.

### 3d. Get the connection string

1. Navigate to **Database → Connect → Connect your application**.
2. Select **Driver: Node.js**, version **5.5 or later**.
3. Copy the connection string. It will look like:
   ```
   mongodb+srv://<username>:<password>@<cluster-host>/?retryWrites=true&w=majority&appName=<cluster-name>
   ```
4. Set this as `MONGODB_URI` in your environment. The `MONGODB_DB` variable sets the database name separately, so you do not need to include the database name in the URI.

### 3e. Create indexes

The application relies on the following indexes for performance. Run these once after the cluster is ready:

```javascript
// Connect to the scholarmarket database in mongosh or Atlas Data Explorer

// materials collection
db.materials.createIndex({ creatorWallet: 1 });
db.materials.createIndex({ status: 1 });
db.materials.createIndex({ createdAt: -1 });
db.materials.createIndex({ title: "text", description: "text" });

// purchases collection
db.purchases.createIndex({ buyerWallet: 1 });
db.purchases.createIndex({ materialId: 1 });
db.purchases.createIndex({ createdAt: -1 });

// entitlement_cache collection
db.entitlement_cache.createIndex({ materialId: 1, buyerAddress: 1 }, { unique: true });

// sync_events collection (idempotency log)
db.sync_events.createIndex({ eventId: 1 }, { unique: true });
db.sync_events.createIndex({ processedAt: -1 });

// dead_letter_events collection
db.dead_letter_events.createIndex({ failedAt: -1 });
```

### 3f. Schema migration approach

ScholarMarket does not use a schema migration tool. Collection schemas evolve through application code. When a field is added:

1. Deploy the new application code, which handles both old and new document shapes.
2. If needed, run a one-off migration script from `scripts/` to backfill existing documents.
3. Verify the new field is indexed (if needed) by running the index creation command above.

---

## 4. Soroban Contract Deployment — Testnet

Always deploy and validate on Testnet first before touching Mainnet.

### 4a. Set up a deployer identity

```bash
# Generate a new keypair for deployment
stellar keys generate scholarmarket-deployer --network testnet

# Fund the account via Friendbot
stellar keys fund scholarmarket-deployer --network testnet

# Confirm the balance
stellar keys address scholarmarket-deployer
```

Store the mnemonic or secret key securely. You will need this identity to invoke admin functions later.

### 4b. Configure network

```bash
stellar network add \
  --rpc-url https://soroban-testnet.stellar.org:443 \
  --network-passphrase "Test SDF Network ; September 2015" \
  testnet
```

### 4c. Build the contracts

```bash
cd soroban
cargo build --target wasm32-unknown-unknown --release
```

The compiled WASM files land in:

```
soroban/target/wasm32-unknown-unknown/release/material_registry.wasm
soroban/target/wasm32-unknown-unknown/release/purchase_manager.wasm
```

### 4d. Optimize the WASM binaries

Optimization reduces the deployed contract size, lowers the resource fee, and is required before production deployment:

```bash
# From the soroban/ directory
stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/material_registry.wasm

stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/purchase_manager.wasm
```

The optimized files are saved alongside the originals with an `_optimized.wasm` suffix.

### 4e. Deploy MaterialRegistry

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/material_registry_optimized.wasm \
  --source scholarmarket-deployer \
  --network testnet
# Output: Contract ID — e.g. CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB5C
```

Save the output contract ID as `NEXT_PUBLIC_MATERIAL_REGISTRY_CONTRACT_ID`.

### 4f. Deploy PurchaseManager

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/purchase_manager_optimized.wasm \
  --source scholarmarket-deployer \
  --network testnet
# Output: Contract ID
```

Save the output contract ID as `NEXT_PUBLIC_PURCHASE_MANAGER_CONTRACT_ID`.

### 4g. Initialize the contracts

Replace all angle-bracket placeholders with your actual values:

```bash
# Initialize MaterialRegistry
stellar contract invoke \
  --id <MATERIAL_REGISTRY_CONTRACT_ID> \
  --source scholarmarket-deployer \
  --network testnet \
  -- init \
  --admin <ADMIN_STELLAR_ADDRESS>

# Initialize PurchaseManager
stellar contract invoke \
  --id <PURCHASE_MANAGER_CONTRACT_ID> \
  --source scholarmarket-deployer \
  --network testnet \
  -- init \
  --admin <ADMIN_STELLAR_ADDRESS> \
  --registry <MATERIAL_REGISTRY_CONTRACT_ID> \
  --treasury <TREASURY_STELLAR_ADDRESS> \
  --platform_fee_bps 250
```

`platform_fee_bps` is in basis points — 250 = 2.5%. The maximum allowed by the contract is 1,000 (10%).

### 4h. Allowlist accepted payment assets

After initialization, add each asset the platform accepts. Use the Stellar Asset Contract (SAC) address for each asset:

```bash
# Example: allow USDC on testnet
stellar contract invoke \
  --id <PURCHASE_MANAGER_CONTRACT_ID> \
  --source scholarmarket-deployer \
  --network testnet \
  -- set_asset_allowed \
  --asset <USDC_SAC_ADDRESS> \
  --enabled true
```

The USDC SAC address on Testnet is `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`. Verify current addresses on [Stellar Laboratory](https://laboratory.stellar.org).

### 4i. Verify deployment

```bash
stellar contract invoke \
  --id <PURCHASE_MANAGER_CONTRACT_ID> \
  --source scholarmarket-deployer \
  --network testnet \
  -- get_platform_config
```

Confirm the treasury address, fee, and registry contract ID match what you configured.

---

## 5. Soroban Contract Deployment — Mainnet

> **Important:** Mainnet transactions cost real XLM. Ensure your deployer account holds enough lumens before proceeding. A typical deploy + init sequence costs roughly 10–20 XLM in resource fees.

### 5a. Key management for production

Never use a development keypair for Mainnet. Follow these practices:

- Generate the deployer keypair offline if possible, or in a secure environment.
- Use a hardware wallet (Ledger) for the treasury address.
- Store the secret key in a secrets manager (e.g. AWS Secrets Manager, HashiCorp Vault, 1Password), not in plaintext files or CI environment variables.
- The deployer identity is only needed for initial deployment and admin operations. Rotate or retire it after setup.
- Keep `STELLAR_ADMIN_SECRET` in the Vercel environment only — it is a server-side variable and should never appear in `NEXT_PUBLIC_*` or client bundles.

### 5b. Generate a production deployer keypair

```bash
# Generate and immediately note down the secret key
stellar keys generate scholarmarket-mainnet-deployer

# Print the public key to fund it
stellar keys address scholarmarket-mainnet-deployer
```

Fund the account by sending XLM from an exchange or another account. Verify the balance on [Stellar Expert](https://stellar.expert/explorer/public).

### 5c. Configure Mainnet network

```bash
stellar network add \
  --rpc-url https://soroban-mainnet.stellar.org:443 \
  --network-passphrase "Public Global Stellar Network ; September 2015" \
  mainnet
```

### 5d. Build and optimize for Mainnet

Run a fresh build and optimization. Do not reuse Testnet artifacts:

```bash
cd soroban
cargo build --target wasm32-unknown-unknown --release

stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/material_registry.wasm

stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/purchase_manager.wasm
```

Record the SHA-256 hash of each optimized WASM for audit purposes:

```bash
# Windows (PowerShell)
Get-FileHash target/wasm32-unknown-unknown/release/material_registry_optimized.wasm -Algorithm SHA256
Get-FileHash target/wasm32-unknown-unknown/release/purchase_manager_optimized.wasm -Algorithm SHA256

# Linux/macOS
sha256sum target/wasm32-unknown-unknown/release/material_registry_optimized.wasm
sha256sum target/wasm32-unknown-unknown/release/purchase_manager_optimized.wasm
```

Store these hashes alongside the deployment record.

### 5e. Deploy to Mainnet

The commands are identical to Testnet, with `--network mainnet` and the Mainnet identity:

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/material_registry_optimized.wasm \
  --source scholarmarket-mainnet-deployer \
  --network mainnet

stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/purchase_manager_optimized.wasm \
  --source scholarmarket-mainnet-deployer \
  --network mainnet
```

Save both contract IDs — these are permanent and cannot be changed.

### 5f. Initialize on Mainnet

```bash
stellar contract invoke \
  --id <MATERIAL_REGISTRY_CONTRACT_ID> \
  --source scholarmarket-mainnet-deployer \
  --network mainnet \
  -- init \
  --admin <PRODUCTION_ADMIN_ADDRESS>

stellar contract invoke \
  --id <PURCHASE_MANAGER_CONTRACT_ID> \
  --source scholarmarket-mainnet-deployer \
  --network mainnet \
  -- init \
  --admin <PRODUCTION_ADMIN_ADDRESS> \
  --registry <MATERIAL_REGISTRY_CONTRACT_ID> \
  --treasury <PRODUCTION_TREASURY_ADDRESS> \
  --platform_fee_bps 250
```

### 5g. Allowlist assets on Mainnet

```bash
# USDC on Mainnet (verify this address on Stellar Expert before using)
stellar contract invoke \
  --id <PURCHASE_MANAGER_CONTRACT_ID> \
  --source scholarmarket-mainnet-deployer \
  --network mainnet \
  -- set_asset_allowed \
  --asset <MAINNET_USDC_SAC_ADDRESS> \
  --enabled true
```

### 5h. Contract upgrade strategy

ScholarMarket contracts are **not upgradeable in place**. Breaking changes require deploying a new contract pair and migrating:

1. Deploy new `MaterialRegistryV2` and `PurchaseManagerV2`.
2. Initialize the new contracts with the existing data by running any migration scripts in `scripts/`.
3. Update `NEXT_PUBLIC_MATERIAL_REGISTRY_CONTRACT_ID` and `NEXT_PUBLIC_PURCHASE_MANAGER_CONTRACT_ID` in Vercel.
4. Redeploy the frontend so it reads from the new contracts.
5. Keep the old contracts running in read-only mode until all buyers have confirmed their entitlements on the new contracts.

---

## 6. Vercel Deployment

### 6a. Import the project

1. Push your repository to GitHub.
2. Open [vercel.com/new](https://vercel.com/new) and click **Import Git Repository**.
3. Select the `scholarmarket` repository.
4. Set **Framework Preset** to **Next.js**.
5. Leave the **Root Directory** blank (the project root is the Next.js app).

### 6b. Configure environment variables

In the Vercel dashboard go to **Settings → Environment Variables** and add every variable from Section 2.

Key production values to double-check:

- `NEXT_PUBLIC_APP_URL` — set to your production domain, e.g. `https://scholarmarket.vercel.app` or your custom domain
- `NEXT_PUBLIC_STELLAR_NETWORK` — set to `mainnet`
- `NEXT_PUBLIC_STELLAR_RPC_URL` — set to `https://soroban-mainnet.stellar.org`
- `NEXT_PUBLIC_HORIZON_URL` — set to `https://horizon.stellar.org`
- `NEXT_PUBLIC_MATERIAL_REGISTRY_CONTRACT_ID` — set to the Mainnet contract ID from step 5e
- `NEXT_PUBLIC_PURCHASE_MANAGER_CONTRACT_ID` — set to the Mainnet contract ID from step 5e
- `STELLAR_ADMIN_SECRET` — set the environment scope to **Production only**, never Preview or Development

### 6c. Configure a custom domain (optional)

1. In Vercel go to **Settings → Domains**.
2. Add your domain and follow the DNS verification steps.
3. Update `NEXT_PUBLIC_APP_URL` to match the custom domain.

### 6d. Deploy

Vercel auto-deploys on every push to `main`. For a one-shot deploy via CLI:

```bash
npx vercel --prod
```

### 6e. Environment scopes

Use Vercel's environment scoping to keep secrets isolated:

| Secret | Production | Preview | Development |
|---|---|---|---|
| `STELLAR_ADMIN_SECRET` | Yes | No | No |
| `MONGODB_URI` | Yes (Atlas) | Yes (separate Atlas cluster) | No (use local Docker) |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `mainnet` | `testnet` | `testnet` |
| `JWT_SECRET` | Yes (unique value) | Yes (separate value) | No (use `.env.local`) |

---

## 7. Post-Deployment Validation

Run through this checklist after every production deployment:

### Frontend

- [ ] Home page loads without JavaScript errors in the browser console
- [ ] Wallet connection works (Freighter or other supported wallet)
- [ ] Material listing page loads and displays catalog items
- [ ] Upload flow completes and the material appears in the creator dashboard

### API

- [ ] `GET /api/health` (or equivalent) returns 200
- [ ] `GET /api/materials` returns data from MongoDB
- [ ] JWT auth flow: log in, receive a cookie, call an authenticated endpoint

### Stellar / Soroban

- [ ] `get_platform_config` returns the expected treasury, fee, and registry values
- [ ] At least one test material registration succeeds on-chain (Testnet only — skip on Mainnet until ready)
- [ ] `has_entitlement` returns `false` for an account that has not purchased

### Database

- [ ] MongoDB Atlas cluster shows active connections from Vercel
- [ ] Run a sample query in Atlas Data Explorer to confirm collections exist

### Backup

- [ ] Manually trigger the MongoDB Backup workflow from GitHub Actions and confirm the archive appears in the S3 / R2 bucket

---

## 8. CI/CD — GitHub Actions

The repository ships with five workflows:

| Workflow | File | Trigger |
|---|---|---|
| Frontend CI | `frontend-ci.yml` | PR and push to `main` on `src/**` changes |
| Backend CI | `backend.yml` | PR and push to `main`/`develop` on `src/app/api/**`, `src/lib/**` |
| Contracts CI | `contracts-ci.yml` | PR and push to `main` on `soroban/**` |
| Contracts (extended) | `contracts.yml` | PR and push to `main`/`develop` on `soroban/**` and `archive/legacy-evm/**` |
| MongoDB Backup | `backup.yml` | Daily cron at 02:00 UTC + manual dispatch |

Contracts CI uses `Swatinem/rust-cache` for fast incremental builds. All workflows use Node.js 20.

### Secrets required for CI

Add the backup secrets from Section 2 to **Repository Settings → Secrets and variables → Actions**. The CI build workflows use mock values for `MONGODB_URI`, `JWT_SECRET`, and other runtime vars — you do not need to expose real credentials for build checks.

### Manual backup trigger

Navigate to **GitHub → Actions → MongoDB Backup → Run workflow** to trigger an out-of-schedule backup.

---

## 9. Database Backup and Recovery

### Run a backup manually

```bash
# Requires mongodump in PATH and the BACKUP_* env vars set in your shell
node scripts/backup-mongodb.mjs
```

### Restore from a backup archive

```bash
# Download the archive from S3 or R2
aws s3 cp s3://<BACKUP_S3_BUCKET>/backups/YYYY-MM/scholarmarket-backup-<TIMESTAMP>.gz ./restore.gz

# Restore — the --drop flag removes existing collections before restoring
mongorestore \
  --uri="$MONGODB_URI" \
  --archive=./restore.gz \
  --gzip \
  --drop
```

### Recovery testing checklist

Run this after any significant schema migration or before a major release:

- [ ] Trigger a fresh backup with `node scripts/backup-mongodb.mjs`
- [ ] Spin up a separate MongoDB instance: `docker run -p 27018:27017 mongo:7`
- [ ] Restore the backup: `mongorestore --uri="mongodb://localhost:27018" --archive=./restore.gz --gzip --drop`
- [ ] Point the app at the test instance and verify: login, list materials, and initiate a purchase
- [ ] Tear down the test instance when done

---

## 10. Monitoring and Error Tracking

### Sentry

1. Create a project at [sentry.io](https://sentry.io).
2. Copy the DSN from **Settings → Projects → Client Keys**.
3. Set `SENTRY_DSN` (server-side) and `NEXT_PUBLIC_SENTRY_DSN` (client-side) in Vercel.
4. Deploy — unhandled API exceptions are automatically captured.

For Slack alerts on critical errors, configure an alert rule in Sentry pointing to your Slack workspace.

### Stellar event indexer

The indexer process polls the Soroban RPC for contract events and writes them to MongoDB. Start it manually or wire it to a cron:

```bash
npm run indexer:stellar
```

Failed events are written to the `dead_letter_events` collection. Reprocess them with:

```bash
node scripts/reprocess-deadletter.mjs
```

Monitor `dead_letter_events` in Atlas — a growing count of un-reprocessed events indicates an indexer issue.

---

## 11. Rollback Procedure

### Frontend rollback

```bash
# Roll back to the immediately previous Vercel deployment
npx vercel rollback

# Or redeploy a specific git commit
git checkout <commit-sha>
npx vercel --prod
```

### Contract rollback

Soroban contracts are immutable once deployed. To roll back:

1. Re-deploy the previous WASM binary as a new contract instance.
2. Update `NEXT_PUBLIC_MATERIAL_REGISTRY_CONTRACT_ID` and/or `NEXT_PUBLIC_PURCHASE_MANAGER_CONTRACT_ID` in Vercel to point at the reverted contract IDs.
3. Redeploy the frontend.

Because contracts are migration-driven, existing entitlements on the previous deployment remain valid and queryable.

### Database rollback

Restore from the most recent backup using the procedure in Section 9. Coordinate with a frontend rollback if the schema change is breaking.
