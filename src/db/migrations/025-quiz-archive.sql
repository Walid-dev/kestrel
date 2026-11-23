-- A quiz I no longer use can be archived: off the quiz page's list, kept with its answers, and back with Restore. The
-- moment it was archived; NULL while it is on the list. Every quiz already kept starts on the list.
ALTER TABLE quizzes ADD COLUMN archived TEXT;
CREATE INDEX quizzes_archived ON quizzes (archived);
