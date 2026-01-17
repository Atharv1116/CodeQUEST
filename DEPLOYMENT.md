# CodeQuest Vercel Deployment Guide

## ⚠️ Critical: Socket.io Limitation

**Vercel does NOT support WebSockets/Socket.io natively**. You have two options:

### Option 1: Separate Socket.io Server (Recommended)
Deploy Socket.io server on Railway/Render/Heroku and connect frontend to it.

### Option 2: Use Polling (Temporary Solution)
Socket.io will use HTTP polling instead of WebSockets. This works but is less efficient.

**The code has been updated to use polling as fallback automatically.**

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **MongoDB Atlas**: Set up a MongoDB database (free tier available)
3. **Environment Variables**: Prepare all required secrets

## Step 1: Prepare Your Project

### 1.1 Update server.js for Vercel

Your `server.js` needs to export the Express app for Vercel:

```javascript
// At the end of server.js, add:
module.exports = app;
```

### 1.2 Create vercel.json

The `vercel.json` file is already created in the root directory.

### 1.3 Update Frontend Build Output

Ensure `frontend/vite.config.js` has correct build settings:

```javascript
export default {
  build: {
    outDir: 'dist',
    // ... other config
  }
}
```

## Step 2: Set Up MongoDB Atlas

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create a database user
4. Whitelist IP addresses (add `0.0.0.0/0` for Vercel)
5. Get your connection string

## Step 3: Environment Variables

Set these in Vercel Dashboard → Project Settings → Environment Variables:

### Required Variables:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/codequest?retryWrites=true&w=majority
JWT_SECRET=your-super-secret-jwt-key-here
FRONTEND_URL=https://your-app.vercel.app
OPENAI_API_KEY=sk-... (if using AI features)
JUDGE0_API_KEY=your-judge0-key (if using Judge0)
NODE_ENV=production
```

### Optional Variables:

```
PORT=3000 (Vercel handles this automatically)
```

## Step 4: Deploy to Vercel

### Option A: Using Vercel CLI (Recommended)

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Link to existing project? **No** (first time)
   - Project name: **codequest** (or your choice)
   - Directory: **./** (root)
   - Override settings? **No**

4. **Deploy to Production**:
   ```bash
   vercel --prod
   ```

### Option B: Using GitHub Integration

1. **Push your code to GitHub** (make sure secrets are removed from history)
2. Go to [vercel.com/new](https://vercel.com/new)
3. **Import your GitHub repository**
4. Configure:
   - **Framework Preset**: Other
   - **Root Directory**: `./`
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Output Directory**: `frontend/dist`
   - **Install Command**: `npm install && cd frontend && npm install`

5. **Add Environment Variables** (from Step 3)
6. **Deploy**

## Step 5: Handle Socket.io (Critical)

Since Vercel doesn't support WebSockets, you have two options:

### Option 1: Separate Socket.io Server (Recommended)

Deploy Socket.io server separately on:
- **Railway** (recommended, easy setup)
- **Render** (free tier available)
- **Heroku** (paid)
- **DigitalOcean App Platform**

Then update your frontend to connect to the separate Socket.io server.

### Option 2: Use Polling Fallback

Modify your Socket.io client to use polling:

```javascript
// In frontend/src/contexts/SocketContext.jsx
const socket = io(serverUrl, {
  transports: ['polling', 'websocket'],
  upgrade: true,
  rememberUpgrade: true
});
```

**Note**: This is less efficient but works with Vercel.

## Step 6: Update Frontend API URLs

Update your frontend to use the Vercel deployment URL:

```javascript
// In frontend/src/contexts/SocketContext.jsx or similar
const API_URL = import.meta.env.VITE_API_URL || 'https://your-app.vercel.app';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://your-socket-server.com';
```

Create `frontend/.env.production`:
```
VITE_API_URL=https://your-app.vercel.app
VITE_SOCKET_URL=https://your-socket-server.com
```

## Step 7: Post-Deployment Checklist

- [ ] Test authentication (login/register)
- [ ] Test API endpoints
- [ ] Test Socket.io connections (if using separate server)
- [ ] Verify MongoDB connection
- [ ] Check environment variables are set
- [ ] Test code execution (Judge0 integration)
- [ ] Verify CORS settings
- [ ] Test all game modes (1v1, 2v2, Battle Royale)

## Troubleshooting

### Issue: "Module not found" errors
- Ensure all dependencies are in `package.json`
- Run `npm install` in root and `cd frontend && npm install`

### Issue: Socket.io not working
- Deploy Socket.io server separately (see Step 5)
- Or use polling transport

### Issue: MongoDB connection fails
- Check MongoDB Atlas IP whitelist includes `0.0.0.0/0`
- Verify connection string format
- Check database user permissions

### Issue: Build fails
- Check build logs in Vercel dashboard
- Ensure all environment variables are set
- Verify Node.js version compatibility

### Issue: API routes return 404
- Check `vercel.json` routes configuration
- Ensure routes start with `/api/`
- Verify server.js exports the app correctly

## Alternative: Split Deployment

For better performance, consider:

1. **Frontend on Vercel**: Deploy `frontend/` directory
2. **Backend on Railway/Render**: Deploy root directory with server.js
3. **Socket.io on separate service**: Dedicated Socket.io server

This gives you:
- ✅ Fast frontend delivery (Vercel CDN)
- ✅ Persistent WebSocket connections
- ✅ Better scalability

## Support

If you encounter issues:
1. Check Vercel deployment logs
2. Review environment variables
3. Test API endpoints with Postman/curl
4. Check MongoDB Atlas logs
5. Review Socket.io connection status

