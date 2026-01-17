# Quick Vercel Deployment Steps

## 🚀 Fast Track Deployment

### 1. Install Vercel CLI
```bash
npm i -g vercel
```

### 2. Login
```bash
vercel login
```

### 3. Set Environment Variables
Before deploying, prepare these values:

```bash
# In Vercel Dashboard → Settings → Environment Variables, add:
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/codequest
JWT_SECRET=your-secret-key-min-32-chars
FRONTEND_URL=https://your-app.vercel.app
OPENAI_API_KEY=sk-... (optional)
JUDGE0_API_KEY=... (optional)
NODE_ENV=production
```

### 4. Deploy
```bash
# From project root
vercel

# For production
vercel --prod
```

### 5. Configure Build Settings (if using Dashboard)

If deploying via GitHub:
- **Framework Preset**: Other
- **Root Directory**: `./`
- **Build Command**: `cd frontend && npm install && npm run build`
- **Output Directory**: `frontend/dist`
- **Install Command**: `npm install && cd frontend && npm install`

## ⚠️ Socket.io Setup

Since Vercel doesn't support WebSockets, you need a separate Socket.io server:

### Option A: Deploy Socket.io on Railway (Easiest)

1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Select your repo
4. Set environment variables (same as Vercel)
5. Railway will auto-detect Node.js
6. Get the Railway URL
7. Update `VITE_SOCKET_URL` in Vercel to Railway URL

### Option B: Use Polling (Works but slower)

The code already supports polling. Just ensure:
- `VITE_SOCKET_URL` points to your Vercel API URL
- Socket.io will automatically use polling

## 📝 Environment Variables Summary

**Vercel Environment Variables:**
```
MONGODB_URI=...
JWT_SECRET=...
FRONTEND_URL=https://your-app.vercel.app
VITE_API_URL=https://your-app.vercel.app
VITE_SOCKET_URL=https://your-socket-server.com (or same as API URL for polling)
```

## ✅ Post-Deployment Checklist

- [ ] Test login/register
- [ ] Test Socket.io connection
- [ ] Test code execution
- [ ] Verify MongoDB connection
- [ ] Check all game modes work

## 🐛 Common Issues

**Socket.io not connecting?**
→ Deploy Socket.io server separately on Railway/Render

**API 404 errors?**
→ Check `vercel.json` routes configuration

**Build fails?**
→ Ensure all dependencies are in package.json

**MongoDB connection fails?**
→ Whitelist `0.0.0.0/0` in MongoDB Atlas

