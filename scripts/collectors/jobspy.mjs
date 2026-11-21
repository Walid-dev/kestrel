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
out = []
for _, r in rows.iterrows():
    out.append({
        "source": str(r.get("site") or "jobspy"),
        "url": str(r.get("job_url") or ""),
        "title": str(r.get("title") or ""),
        "org": str(r.get("company") or ""),
        "location": str(r.get("location") or ""),
        "posted": str(r.get("date_posted") or ""),
        "salaryMin": None if r.get("min_amount") != r.get("min_amount") else float(r.get("min_amount")),
        "salaryMax": None if r.get("max_amount") != r.get("max_amount") else float(r.get("max_amount")),
        "salaryCurrency": None if not r.get("currency") else str(r.get("currency")),
        "salaryPeriod": None if not r.get("interval") else str(r.get("interval")),
        "excerpt": str(r.get("description") or "")[:800],
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
