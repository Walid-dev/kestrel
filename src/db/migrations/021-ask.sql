-- Ask, on any page: the conversations with the computer's model, one per page (an app and what is open in it: a
-- lesson, a quiz question). My lines and the model's answers in the order written; an answer grows in its row while
-- the model writes it.
CREATE TABLE ask_messages (
  id TEXT PRIMARY KEY,
  app TEXT NOT NULL,
  ref TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('me', 'model')),
  text TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL CHECK (state IN ('writing', 'done', 'failed')),
  error TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL
) STRICT;
CREATE INDEX ask_messages_page ON ask_messages (app, ref);
-- Learn's one-question Ask became Ask on every page: its model pick, when I made one, carries over
UPDATE OR IGNORE model_settings SET use = 'ask' WHERE use = 'learn-ask';
DELETE FROM model_settings WHERE use = 'learn-ask';
