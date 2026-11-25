-- A news story starred, kept for good (src/domain/news/stars.ts): a copy of the story as its brief told it (a
-- NewsStory as JSON: the headline, the text, the section, the figure, the links), its day and the brief it came from,
-- n its number there (the page's #s<n>). No foreign key to news_briefs: deleting a day never takes its stars.
-- starred: when I starred it, the order the Starred list reads them in
CREATE TABLE news_stars (
  brief TEXT NOT NULL,
  n INTEGER NOT NULL CHECK (n >= 1),
  day TEXT NOT NULL,
  story TEXT NOT NULL,
  starred TEXT NOT NULL,
  PRIMARY KEY (brief, n)
) STRICT;
CREATE INDEX news_stars_starred ON news_stars (starred);
CREATE INDEX news_stars_day ON news_stars (day);
