#!/usr/bin/env node
// The dev collector: three made-up jobs, so the Searches screen has something honest to show.
const today = new Date().toISOString().slice(0, 10);
console.log(
  JSON.stringify([
    {
      source: "made-up-board",
      url: "https://example.com/jobs/1",
      title: "Senior Software Engineer",
      org: "Made-up Co",
      location: "Toronto, ON",
      seniority: "Senior",
      salaryMax: 150000,
      salaryCurrency: "CAD",
      posted: today,
      excerpt: "TypeScript, React and AWS on a Node platform.",
    },
    {
      source: "made-up-board",
      url: "https://example.com/jobs/2",
      title: "Junior Developer",
      org: "Other Co",
      location: "Elsewhere",
      posted: today,
    },
    {
      source: "made-up-board",
      url: "https://example.com/jobs/3",
      title: "Software Developer",
      org: "Third Co",
      location: "Remote (US)",
      usOnly: true,
      posted: today,
    },
  ]),
);
