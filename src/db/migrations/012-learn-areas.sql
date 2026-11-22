-- Learn and Interview prep share the packs: area says where a pack lives, so moving one is a single update.
ALTER TABLE packs ADD COLUMN area TEXT NOT NULL DEFAULT 'learn' CHECK (area IN ('learn', 'interview'));
-- The review ladder counts the times in a row a lesson was known (the old Learn's level): 1, 1, 3, 7, 16, 35 days.
ALTER TABLE reviews ADD COLUMN level INTEGER NOT NULL DEFAULT 0;
