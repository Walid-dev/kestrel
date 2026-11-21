-- One previous version per document, kept for Undo after a save.
ALTER TABLE documents ADD COLUMN previous_text TEXT;
