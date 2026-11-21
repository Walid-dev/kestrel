#!/usr/bin/env node
// The dev collector: three made-up beekeeping jobs, so the Searches screen has something honest to show.
const today = new Date().toISOString().slice(0, 10);
console.log(
  JSON.stringify([
    {
      source: "made-up-board",
      url: "https://example.com/jobs/1",
      title: "Head Hive Keeper",
      org: "Made-up Co",
      location: "Hiveton",
      seniority: "Head",
      salaryMax: 52000,
      posted: today,
      excerpt: "Apiary, Smoker and Hive work on a Wax farm.",
    },
    {
      source: "made-up-board",
      url: "https://example.com/jobs/2",
      title: "Apprentice Keeper",
      org: "Other Co",
      location: "Elsewhere",
      posted: today,
    },
    {
      source: "made-up-board",
      url: "https://example.com/jobs/3",
      title: "Bee Wrangler",
      org: "Third Co",
      location: "Remote (US)",
      usOnly: true,
      posted: today,
    },
  ]),
);
