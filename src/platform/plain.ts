// An error's words, fit for the service log and the run rows: any path becomes "(a path)" and the line stays short,
// since an fs or SQLite error names the folder it failed in, and the log never carries folders.
export const plainWords = (msg: string): string => msg.replaceAll(/\/[^\s"']+/g, "(a path)").slice(0, 120);
