# Frontend Deployment Guide

This guide helps you resolve CORS and network connection issues when deploying the Solana Agents frontend.

## Environment Variables Setup

Create a `.env.local` file in the frontend directory with the following variables:

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Deployer API Configuration  
VITE_DEPLOYER_URL=http://54.166.244.200
VITE_API_KEY=Commune_dev1
```

## Common Issues and Solutions

### 1. CORS Errors with Supabase

**Error:** `Fetch API cannot load https://xxx.supabase.co/auth/v1/token due to access control checks`

**Solutions:**
- Ensure your Supabase project allows your domain in the CORS settings
- Check that your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are correct
- For local development, add `http://localhost:5173` and `http://localhost:5174` to your Supabase CORS allowed origins

### 2. Network Connection Lost

**Error:** `The network connection was lost`

**Solutions:**
- Check if the API server at `54.166.244.200` is accessible
- Verify your internet connection
- The app now includes automatic retry logic with exponential backoff
- No timeouts on deployment calls - deployments can take as long as needed
- For development, the app uses a proxy to avoid CORS issues

### 3. API Server Issues

**Error:** `Failed to load resource` for deployer API

**Solutions:**
- Verify the deployer API server is running
- Check if the API key is correct
- The app now includes better error handling and no deployment timeouts

## Development vs Production

### Development Mode
- Uses Vite proxy to route API calls through `/api` to avoid CORS
- Includes detailed error logging
- Auto-retry on network failures
- No timeouts on deployment calls

### Production Mode  
- Uses Vercel serverless proxy (`/api/proxy`) to handle CORS issues
- Automatically routes requests through HTTPS proxy to HTTP API server
- No CORS configuration needed on the API server
- Includes graceful error handling
- No timeouts on deployment calls

## Testing the Setup

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Run development server:**
   ```bash
   npm run dev
   ```

3. **Check for errors in browser console**

4. **Test authentication and API calls**

## Troubleshooting

If you still encounter issues:

1. Check browser network tab for failed requests
2. Verify environment variables are loaded correctly
3. Ensure API servers are accessible from your network
4. Check Supabase project settings for CORS configuration

## Production Deployment

For production deployment:

1. Set proper environment variables in your hosting platform
2. Ensure your domain is added to Supabase CORS settings
3. Configure your API server to allow requests from your frontend domain
4. Test all functionality after deployment

## Support

If issues persist, check:
- Browser console for detailed error messages
- Network tab for failed requests
- Supabase dashboard for authentication logs
- API server logs for connection issues
