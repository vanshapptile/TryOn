-- Table for storing generated try-on images
CREATE TABLE IF NOT EXISTS generated_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Source images
  person_image_path TEXT NOT NULL,  -- S3 path to the person's photo
  wardrobe_item_id UUID REFERENCES wardrobe_items(id) ON DELETE SET NULL,  -- Reference to wardrobe item
  clothing_image_path TEXT NOT NULL,  -- S3 path to the clothing item
  
  -- Generated result
  result_image_path TEXT,  -- S3 path to the generated try-on image
  
  -- Metadata
  status VARCHAR(50) DEFAULT 'pending',  -- pending, processing, completed, failed
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Additional info
  prompt_used TEXT,  -- The prompt sent to Gemini API
  generation_time_ms INTEGER  -- Time taken to generate
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_generated_images_user_id ON generated_images(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_images_status ON generated_images(status);
CREATE INDEX IF NOT EXISTS idx_generated_images_created_at ON generated_images(created_at DESC);

-- Add avatar_path column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path TEXT;

-- Add credits column to users table (credit-based system)
-- New users get 3 free try-ons by default
ALTER TABLE users ADD COLUMN IF NOT EXISTS available_tryons INTEGER DEFAULT 3;

-- Add user tier column to track if user has ever purchased credits
-- 'free' = never purchased, 'paid' = has purchased at least once
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_tier VARCHAR(20) DEFAULT 'free';

-- Table for tracking payment orders
CREATE TABLE IF NOT EXISTS payment_orders (
  id VARCHAR(255) PRIMARY KEY,  -- Razorpay order ID
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id VARCHAR(50) NOT NULL,  -- 'starter', 'pro', etc.
  amount INTEGER NOT NULL,  -- Amount in INR
  tryons INTEGER NOT NULL,  -- Number of try-ons purchased
  status VARCHAR(50) DEFAULT 'created',  -- created, completed, failed
  payment_id VARCHAR(255),  -- Razorpay payment ID
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_created_at ON payment_orders(created_at DESC);

-- Table for tracking API usage (optional but recommended)
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_name VARCHAR(100) NOT NULL,  -- 'gemini', 'remove_bg', etc.
  endpoint VARCHAR(255),
  tokens_used INTEGER,
  cost_usd DECIMAL(10, 4),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage(created_at DESC);

