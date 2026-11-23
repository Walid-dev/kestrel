-- Ask may propose changes on a page (a stage, a deep check, an application): each answer keeps its cards, what each
-- would do and whether my tap ran it, as JSON.
ALTER TABLE ask_messages ADD COLUMN cards TEXT NOT NULL DEFAULT '[]';
