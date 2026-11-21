#!/usr/bin/env node
// A generic fetcher over python-jobspy (the big boards), in kestrel's collector convention: env in, items JSON out.
// Env: TERM (what to search), LOCATION, HOURS_OLD (how fresh). Needs uv on the computer; the first run downloads
// python-jobspy. This is engine plumbing, not a site script: the sites it reaches are jobspy's own generic set.
import { execFileSync } from "node:child_process";

const term = process.env.TERM_WORDS ?? "";
const location = process.env.LOCATION ?? "";
const hours = process.env.HOURS_OLD ?? "72";
if (!term) {
  console.error("jobspy collector: set TERM_WORDS (and LOCATION, HOURS_OLD) in the search's env");
  process.exit(1);
}
const py = `
import json, sys
from jobspy import scrape_jobs
rows = scrape_jobs(site_name=["linkedin", "indeed"], search_term=sys.argv[1], location=sys.argv[2], hours_old=int(sys.argv[3]), results_wanted=60)
def num(v):
    if v is None or v != v:  # None, or pandas NaN
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
def txt(v):
    return "" if v is None or v != v else str(v)
out = []
for _, r in rows.iterrows():
    out.append({
        "source": txt(r.get("site")) or "jobspy",
        "url": txt(r.get("job_url")),
        "title": txt(r.get("title")),
        "org": txt(r.get("company")),
        "location": txt(r.get("location")),
        "posted": txt(r.get("date_posted")),
        "salaryMin": num(r.get("min_amount")),
        "salaryMax": num(r.get("max_amount")),
        "salaryCurrency": txt(r.get("currency")) or None,
        "salaryPeriod": txt(r.get("interval")) or None,
        "excerpt": txt(r.get("description"))[:800],
    })
print(json.dumps([o for o in out if o["url"] and o["title"]]))
`;
try {
  const stdout = execFileSync("uv", ["run", "--with", "python-jobspy", "python", "-c", py, term, location, hours], {
    encoding: "utf8",
    maxBuffer: 50_000_000,
    timeout: 240_000,
  });
  console.log(stdout.trim().split("\n").pop());
} catch (e) {
  console.error(String(e.message ?? e).slice(0, 200));
  process.exit(1);
}
