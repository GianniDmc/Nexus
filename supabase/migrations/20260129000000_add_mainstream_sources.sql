-- Ajout de sources Tech Mainstream (Grand Public)
insert into sources (name, url, category) values
-- Sources FR
('Les Numériques', 'https://www.lesnumeriques.com/feeds/news.xml', 'Général'),
('01net', 'https://www.01net.com/feed', 'Général'),
('Tom''s Guide FR', 'https://www.tomsguide.fr/feed/', 'Général'),

-- Sources EN
('Mashable Tech', 'https://mashable.com/feeds/rss/tech', 'Général'),
('PCMag', 'https://www.pcmag.com/feeds/rss/latest', 'Général'),
('Lifehacker', 'https://lifehacker.com/rss', 'Général')

on conflict (url) do nothing;
