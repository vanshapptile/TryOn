# 🚀 Deployment Guide - Payment System

## Current Issue
The `/payment/purchase` endpoint exists in local code but is not deployed to production (`https://api.tryonapp.in`).

## Files Changed
- ✅ `Backend/index.js` - Added payment purchase endpoint
- ✅ `Backend/database_schema.sql` - Added user_tier column
- ✅ `Frontend/app/(app)/pricing.tsx` - Purchase flow implementation
- ✅ `Frontend/app/(app)/index.tsx` - User tier tracking
- ✅ `Frontend/app/(app)/profile.tsx` - Dynamic pricing visibility
- ✅ `Frontend/app/(app)/camera.tsx` - Credit validation

## Deployment Steps

### Step 1: Database Migration (IMPORTANT - Do this FIRST!)

Connect to your production database and run:

```sql
-- Add user_tier column if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_tier VARCHAR(20) DEFAULT 'free';

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'user_tier';
```

### Step 2: Commit Changes

```bash
cd /Users/vanshkarnwal/Documents/Personal/TryOn

# Stage all changes
git add Backend/index.js Backend/database_schema.sql Frontend/

# Commit with descriptive message
git commit -m "feat: Add payment purchase endpoint and credit system

- Add /payment/purchase endpoint for mock payments
- Update user_tier to 'paid' on purchase
- Increment available_tryons on purchase
- Add user_tier column to database schema
- Update frontend pricing page with purchase flow
- Add credit validation in camera screen
- Show/hide pricing based on user tier"
```

### Step 3: Push to Deploy

```bash
# Push to your branch (this will trigger Vercel deployment)
git push origin Macbook-pro-tryon
```

### Step 4: Verify Deployment

1. **Check Vercel Dashboard:**
   - Go to https://vercel.com
   - Check deployment status
   - Wait for "Ready" status

2. **Test the endpoint:**
   ```bash
   curl -X POST https://api.tryonapp.in/payment/purchase \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{"package_id":"starter","amount":499,"tryons":15}'
   ```

3. **Expected Response:**
   ```json
   {
     "success": true,
     "message": "Purchase successful!",
     "order_id": "uuid-here",
     "available_tryons": 15,
     "user_tier": "paid"
   }
   ```

### Step 5: Test in App

1. Open the app
2. Go to Pricing page
3. Select a plan
4. Confirm purchase
5. Should see success message with updated credits

## Rollback Plan (If Something Goes Wrong)

```bash
# Revert the commit
git revert HEAD

# Push to redeploy previous version
git push origin Macbook-pro-tryon
```

## Post-Deployment Checklist

- [ ] Database migration completed
- [ ] Code pushed to GitHub
- [ ] Vercel deployment successful
- [ ] Endpoint returns JSON (not HTML)
- [ ] Purchase flow works in app
- [ ] Credits increment correctly
- [ ] User tier updates to 'paid'
- [ ] Payment order created in database

## Notes

- This is a **mock payment** system (no real payment processing)
- For real payments, integrate Razorpay/Stripe later
- All purchases are marked as 'completed' immediately
- No payment verification is performed

## Support

If deployment fails, check:
1. Vercel logs for errors
2. Database connection in production
3. Environment variables are set
4. CORS settings allow frontend domain

