-- The notes the last draft's save moved to Done (a JSON list of ids), so Undo can open them again: an undone change
-- leaves its note waiting for the next Apply. Any other save (my own edit, a restore) or a reopened file clears it.
ALTER TABLE documents ADD COLUMN previous_done TEXT;
