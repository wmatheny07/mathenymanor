## Agent Web

### Local dev
npm install
npm run dev

### Docker build
docker build --build-arg VITE_API_URL=http://localhost:8000 -t agent-web .

### Env vars
- VITE_API_URL (required)