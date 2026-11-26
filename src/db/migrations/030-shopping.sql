-- Shopping (src/domain/shopping/): my wants, each with its compared products, their offers, every price reading and
-- what I deleted. Its own tables until listings take kinds (docs/tasks/v1.2-shopping.md): shaped so that move is a
-- copy. Money is in cents, as integers; a budget is whole units of the region's currency. Only src/domain/shopping/
-- writes here.
-- job: the work queued or running, as JSON ({"do": "full"}, or {"do": "offers", "products": [ids]}); need: the need
-- card with its category's criteria taken along; answers: my picks ({"<question key>": <option index>}); result: the
-- sources, assumptions, conflicts and checks of the last good run; log: the dated changes
CREATE TABLE wants (
  id TEXT PRIMARY KEY,
  words TEXT NOT NULL,
  budget INTEGER CHECK (budget IS NULL OR budget > 0),
  note TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'done', 'failed')),
  job TEXT,
  step TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'bought', 'passed')),
  starred INTEGER NOT NULL DEFAULT 0 CHECK (starred IN (0, 1)),
  need TEXT,
  answers TEXT NOT NULL DEFAULT '{}',
  result TEXT,
  log TEXT NOT NULL DEFAULT '[]',
  error TEXT NOT NULL DEFAULT '',
  created TEXT NOT NULL,
  updated TEXT NOT NULL,
  ran TEXT
) STRICT;
CREATE INDEX wants_queue ON wants (state, created);
-- key: brand and model, normalised, so a run again finds the product by it; models: every code it is sold under, the
-- region's first; facts: {criterion: {v, unit, ref, quote, unsure, others}}; out: why it is only also considered
-- ('' for a finalist); words: its checked sentences with their refs; usual: a usual price a source states (cents);
-- watch: {until, everyHours, stock, began, last, low, pinged, wasOut}; mine: when I last set each mark (ISO, by mark)
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  want TEXT NOT NULL REFERENCES wants (id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  models TEXT NOT NULL DEFAULT '[]',
  facts TEXT NOT NULL DEFAULT '{}',
  labels TEXT NOT NULL DEFAULT '[]',
  score REAL,
  place INTEGER,
  out TEXT NOT NULL DEFAULT '',
  flags TEXT NOT NULL DEFAULT '[]',
  words TEXT NOT NULL DEFAULT '{}',
  usual INTEGER,
  evidence TEXT NOT NULL DEFAULT '{}',
  starred INTEGER NOT NULL DEFAULT 0 CHECK (starred IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'bought', 'passed')),
  target INTEGER CHECK (target IS NULL OR target > 0),
  watch TEXT,
  mine TEXT NOT NULL DEFAULT '{}',
  found TEXT NOT NULL,
  updated TEXT NOT NULL,
  UNIQUE (want, key)
) STRICT;
-- one store's offer for one product, by its address. method: how its price was read ('' when none was); read: how
-- the read went; words: a price read from the page's words, those words; why: a row not read, in words; seen: the
-- last time kestrel looked at it
CREATE TABLE offers (
  id TEXT PRIMARY KEY,
  product TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  store TEXT NOT NULL,
  url TEXT NOT NULL,
  seller TEXT NOT NULL DEFAULT '',
  condition TEXT NOT NULL DEFAULT 'new' CHECK (condition IN ('new', 'open-box', 'refurbished', 'used', 'marketplace')),
  price INTEGER,
  regular INTEGER,
  shipping INTEGER,
  currency TEXT NOT NULL DEFAULT '',
  stock TEXT NOT NULL DEFAULT 'unknown' CHECK (stock IN ('in', 'out', 'preorder', 'unknown')),
  pickup INTEGER CHECK (pickup IS NULL OR pickup IN (0, 1)),
  valid_until TEXT,
  method TEXT NOT NULL DEFAULT '' CHECK (method IN ('', 'shopify', 'jsonld', 'meta', 'microdata', 'text', 'link')),
  read TEXT NOT NULL CHECK (read IN ('ok', 'blocked', 'unreadable', 'link', 'mismatch', 'unsearched')),
  words TEXT NOT NULL DEFAULT '',
  why TEXT NOT NULL DEFAULT '',
  seen TEXT NOT NULL,
  UNIQUE (product, url)
) STRICT;
-- every price kestrel read, from the first one: the history no other tool keeps across stores in my region
CREATE TABLE price_readings (
  offer TEXT NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  price INTEGER NOT NULL,
  regular INTEGER,
  stock TEXT NOT NULL,
  method TEXT NOT NULL,
  PRIMARY KEY (offer, at)
) STRICT;
-- a deleted want or product, whole: its row and its children as JSON, with when. A run again never brings a deleted
-- product back (its want and key); Restore puts it back as it was
CREATE TABLE shop_deleted (
  id TEXT PRIMARY KEY,
  what TEXT NOT NULL CHECK (what IN ('want', 'product')),
  want TEXT NOT NULL,
  key TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  row TEXT NOT NULL,
  at TEXT NOT NULL
) STRICT;
CREATE INDEX shop_deleted_want ON shop_deleted (want, key);
