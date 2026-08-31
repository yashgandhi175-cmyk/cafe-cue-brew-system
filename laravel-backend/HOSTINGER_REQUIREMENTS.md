# CAFÉ CUE & BREW — HOSTINGER TECHNICAL REQUIREMENTS (PHASE 4)

This document specifies the server, PHP, extension, and filesystem requirements for deploying **Laravel 11.56.1** on **Hostinger Business Shared Hosting**.

---

## 1. SERVER & PHP ENVIRONMENT REQUIREMENTS

- **Hosting Tier**: Hostinger Business Shared Hosting
- **PHP Version**: `PHP 8.3` (or `PHP 8.2` minimum)
- **Web Server Configuration**: Apache / LiteSpeed with `mod_rewrite` enabled
- **Document Root Path**: Must point directly to `laravel-backend/public/`

---

## 2. REQUIRED PHP EXTENSIONS MATRIX

| Extension | Purpose | Hostinger Availability | Status |
|---|---|---|---|
| `PDO` / `pdo_mysql` | MySQL/MariaDB database access | Pre-installed | **Required** |
| `mbstring` | Multibyte string processing | Pre-installed | **Required** |
| `openssl` | Cryptographic JWT & password hashing | Pre-installed | **Required** |
| `json` | JSON API response encoding/decoding | Pre-installed | **Required** |
| `fileinfo` | Uploaded file MIME validation | Pre-installed | **Required** |
| `ctype` | String type validation | Pre-installed | **Required** |
| `tokenizer` | Code parsing and route caching | Pre-installed | **Required** |
| `xml` | Document and report parsing | Pre-installed | **Required** |
| `bcmath` | Arbitrary precision math fallback | Pre-installed | Recommended |
| `gd` | Image thumbnail processing | Pre-installed | Optional |

---

## 3. FILESYSTEM PERMISSIONS & DIRECTORY ACCESS

- `laravel-backend/storage/`: `0755` (Read / Write / Execute for Web Server)
- `laravel-backend/bootstrap/cache/`: `0755` (Read / Write / Execute for Web Server)
- `laravel-backend/.env`: `0600` or `0644` (Strictly non-public file)

---

## 4. PROCESS LIMIT CONSTRAINTS (HOSTINGER SHARED HOSTING RULE)

- **Process Limit Cap**: Max 20 concurrent processes on shared hosting.
- **Node.js Process**: **0 processes** (Frontend is pre-rendered static HTML/JS export in `out/`).
- **Laravel Process**: Standard request/response PHP-FPM execution. **Zero persistent daemons**.
