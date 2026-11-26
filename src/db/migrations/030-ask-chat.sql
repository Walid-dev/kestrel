-- Ask is a chat that keeps its context, with the web on every page. Each answer keeps what its looks did and found, so
-- the next answer rereads them. steps: the answer's own turns before its words, as the model had them (its look, then
-- what the look returned), as JSON [{"role", "content"}]; sources: the pages it found or read, numbered across the
-- conversation as it cites them ([{"n", "title", "url"}]); left_out: how many of the oldest questions, with their
-- answers, stayed out of its call to fit what the model reads at once; paused: while a search waits for my tap on a
-- page of my own, the work to go on from (JSON), '' otherwise.
ALTER TABLE ask_messages ADD COLUMN steps TEXT NOT NULL DEFAULT '[]';
ALTER TABLE ask_messages ADD COLUMN sources TEXT NOT NULL DEFAULT '[]';
ALTER TABLE ask_messages ADD COLUMN left_out INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ask_messages ADD COLUMN paused TEXT NOT NULL DEFAULT '';
