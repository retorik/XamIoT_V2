# Admin UI (React/Vite)

## Variables
- `VITE_API_BASE` : base URL de l'API (ex: https://api.xamiot.com)

## Dev local
```bash
npm i
VITE_API_BASE=https://api.xamiot.com npm run dev
```

## Build
```bash
npm i
VITE_API_BASE=https://api.xamiot.com npm run build
```

## Docker
Voir `Dockerfile` (build args : `VITE_API_BASE`)
