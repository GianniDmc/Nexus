-- Harmonize categories in 'articles' table
UPDATE articles SET category = 'Général' WHERE category = 'Tech News';
UPDATE articles SET category = 'Mobile' WHERE category IN ('Apple', 'Smartphones');

-- Harmonize categories in 'sources' table
UPDATE sources SET category = 'Général' WHERE category = 'Tech News';
UPDATE sources SET category = 'Mobile' WHERE category IN ('Apple', 'Smartphones');
