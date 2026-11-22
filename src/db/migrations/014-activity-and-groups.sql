-- The activity log: every piece of work that ended and every mark I made, with where to open it, so Live's Activity
-- shows the week and a tap lands on the work itself.
CREATE TABLE activity (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  started TEXT NOT NULL,
  ended TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'done',
  note TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]'
) STRICT;
CREATE INDEX activity_ended ON activity (ended);
-- A pack's parent group in Learn (AI, Platform, My stack…): one column, changed with one tap.
ALTER TABLE packs ADD COLUMN grp TEXT NOT NULL DEFAULT '';
