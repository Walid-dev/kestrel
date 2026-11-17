-- the first table: small facts about the installation (later steps add their own tables, each in a new migration)
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
