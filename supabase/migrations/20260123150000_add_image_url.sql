-- Add image_url column to articles table for og:image storage
ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_url TEXT;
