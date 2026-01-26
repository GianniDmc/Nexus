-- Change published_on to TIMESTAMPTZ to support exact publication time
ALTER TABLE clusters 
ALTER COLUMN published_on TYPE timestamptz 
USING published_on::timestamptz;
