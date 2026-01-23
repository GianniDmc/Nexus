insert into sources (name, url, category) values
('MacRumors', 'https://www.macrumors.com/macrumors.xml', 'Apple'),
('9to5Mac', 'https://9to5mac.com/feed/', 'Apple'),
('Wired', 'https://www.wired.com/feed/rss', 'Général'),
('The Verge - Tech', 'https://www.theverge.com/tech/rss/index.xml', 'Général'),
('Android Central', 'https://www.androidcentral.com/rss.xml', 'Smartphones'),
('Frandroid', 'https://www.frandroid.com/feed', 'Général'),
('Journal du Geek', 'https://www.journaldugeek.com/feed/', 'Général')
on conflict (url) do nothing;
