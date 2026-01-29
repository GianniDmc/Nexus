-- Correction URL RSS Les Numériques (410 Gone -> Nouvelle URL)
update sources
set url = 'https://www.lesnumeriques.com/rss.xml',
    last_fetched_at = null -- Reset fetch status to retry immediately
where name = 'Les Numériques';
