-- Ajout de sources tech généralistes "Large Spectre"
insert into sources (name, url, category) values
('Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 'Général'),
('Engadget', 'https://www.engadget.com/rss.xml', 'Général'),
('Gizmodo', 'https://gizmodo.com/rss', 'Général'),
('Tom''s Hardware', 'https://www.tomshardware.com/feeds/all', 'Hardware'),
('VentureBeat', 'https://venturebeat.com/feed/', 'Business'),
('MIT Technology Review', 'https://www.technologyreview.com/feed/', 'Science'),
('Korben', 'https://korben.info/feed', 'Dev'),
('Presse-citron', 'https://www.presse-citron.net/feed/', 'Général')
on conflict (url) do nothing;
