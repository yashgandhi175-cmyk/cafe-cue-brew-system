# Café Cue & Brew Management System

Production repository for the **Café Cue & Brew** point-of-sale, billing, QR ordering, inventory, and marketing management system.

## Architecture

- **Frontend (`frontend/`)**: Next.js 16 (React 19) TypeScript application with Tailwind CSS v4, compiled as a static HTML/CSS/JS export for Hostinger `public_html/`.
- **Backend (`laravel-backend/`)**: Laravel 11.56 + PHP 8.3 RESTful API backend running on MySQL 8.x, deployed to Hostinger `laravel-app/`.
- **Database**: MySQL 8.x relational schema managed via Laravel migrations.
- **Documentation (`docs/`)**: Centralized architecture maps, security audits, operations runbooks, and deployment guides.

## Repository Structure

```
cafe-cue-brew-system/
├── .agents/          # Antigravity agent configuration and coding rules
├── docs/             # Centralized architecture, audit, deployment, and operations documentation
│   ├── architecture/ # Database models, API mappings, and financial logic
│   ├── audits/       # Security, concurrency, and validation audits
│   ├── deployment/   # Hostinger deployment guides, cron, and environment checklists
│   ├── operations/   # Runbooks, incident response, rollback plans, and maintenance policies
│   └── archive/      # Historical development phase reports
├── frontend/         # Next.js static frontend application
└── laravel-backend/  # Laravel 11 PHP backend application
```

## Quick Start (Local Development)

### Frontend
```bash
cd frontend
npm install
npm run dev
# Build for production:
npm run build
```

### Backend
```bash
cd laravel-backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve
```

## Production Testing
```bash
cd laravel-backend
php artisan test
```
