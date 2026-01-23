-- Ajout de sources françaises diversifiées (Généraliste, Business, Tech, Mobile)
insert into sources (name, url, category) values
('Le Monde - Pixels', 'https://www.lemonde.fr/pixels/rss_full.xml', 'Général'),
('L''Usine Digitale', 'https://www.usine-digitale.fr/rss', 'Business'),
('FrenchWeb', 'https://www.frenchweb.fr/feed', 'Business'),
('Numerama', 'https://www.numerama.com/feed/', 'Général'),
('Journal du Net', 'https://www.journaldunet.com/rss/', 'Business'),
('Maddyness', 'https://www.maddyness.com/feed/', 'Business'),
('Next (NextInpact)', 'https://www.next.ink/feed/', 'Dev'),
('PhonAndroid', 'https://www.phonandroid.com/feed', 'Smartphones'),
('Clubic', 'https://www.clubic.com/feed/news.rss', 'Général'),
('CNET France', 'https://www.cnetfrance.fr/feeds/rss/news/', 'Smartphones'),
('ZdNet France', 'https://www.zdnet.fr/feeds/rss/actualites/', 'Business')
on conflict (url) do nothing;
