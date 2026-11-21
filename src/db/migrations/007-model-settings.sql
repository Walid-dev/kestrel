-- Which model each use runs on, switched on the Models screen; the settings file stays the fallback.
CREATE TABLE model_settings (
  use TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  set_at TEXT NOT NULL
) STRICT;
