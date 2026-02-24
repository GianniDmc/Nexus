-- Add skip_scrape column to sources for configurable scraping control
ALTER TABLE sources ADD COLUMN IF NOT EXISTS skip_scrape boolean DEFAULT false;

-- Activate for sources that systematically block scraping (403/429)
UPDATE sources SET skip_scrape = true WHERE name IN ('TechRepublic', 'BleepingComputer');
