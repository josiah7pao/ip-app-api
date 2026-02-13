# IP App API (Node.js + Express)

Backend API for login, IP geolocation lookup, and search history.

## Tech Stack
- Node.js
- Express
- PostgreSQL
- Axios
- CORS

## Features
- Login endpoint with DB credential validation
- Auto-seeded test user
- Current IP geolocation lookup
- Search IP geolocation lookup
- Search history list
- Multi-select history delete
- History IP lookup without re-inserting history

## Base URL
- Local: `http://localhost:8000`
- Production: `https://ip-app-api.vercel.app` (change if will deploy personally)

## API Endpoints
- `POST /api/login`
- `GET /api/home`
- `POST /api/home/search`
- `POST /api/home/lookup`
- `DELETE /api/home/history`
- `GET /` (health check)

## Environment Variables
Create `.env` (or set in Vercel):

- `DATABASE_URL` or `POSTGRES_URL` = PostgreSQL connection string
- `IPINFO_TOKEN` = ipinfo token
- `CORS_ORIGIN` = frontend URL (example: `https://ip-app-web.vercel.app`)

## Local Development
```bash
npm install
npx vercel dev

## Test Credentials

Use this seeded demo account for testing:

- Email: `test@test.com`
- Password: `1234`

Notes:
- This is a non-production demo account for assessment/review only.

