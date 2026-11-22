-- Tasks: when a task's words were last changed by hand, shown as "edited" beside its date.
ALTER TABLE tasks ADD COLUMN edited TEXT;
