-- Migration: Add user_tier column to users table
-- Date: 2026-01-01
-- Description: Track whether user is on free or paid tier

-- Add user_tier column if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_tier VARCHAR(20) DEFAULT 'free';

-- Add index for faster queries on user_tier
CREATE INDEX IF NOT EXISTS idx_users_user_tier ON users(user_tier);

-- Update existing users to 'free' tier if NULL
UPDATE users SET user_tier = 'free' WHERE user_tier IS NULL;

-- Verify the migration
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name = 'user_tier';

-- Show sample data
SELECT 
    id,
    email,
    available_tryons,
    user_tier,
    created_at
FROM users
LIMIT 5;

