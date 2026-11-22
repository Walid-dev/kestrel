-- Writing: a try is a cover letter, an answer to a form's question, or any text; the question or what to write.
ALTER TABLE letters ADD COLUMN kind TEXT NOT NULL DEFAULT 'letter' CHECK (kind IN ('letter', 'answer', 'text'));
ALTER TABLE letters ADD COLUMN ask TEXT NOT NULL DEFAULT '';
