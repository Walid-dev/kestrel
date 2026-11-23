-- A job search without a hunt of its own once stamped its name on the listings its runs found, while the imported
-- ones carried none, so the same search showed as two tabs (27 found here beside 2150 carried over). A job listing's
-- hunt is its search: the stamp goes.
UPDATE listings SET data = json_remove(data, '$.hunt')
WHERE kind = 'jobs' AND json_extract(data, '$.hunt') IS NOT NULL;
