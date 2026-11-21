// Ask, on a lesson: the question, the open lesson and the pack's map go to the model; the answer comes back plain and
// shaped, naming the lessons it drew on. The lesson is context, never a limit on what may be explained.
export const ASK_VERSION = 1;

export type AskLesson = {
  id: string;
  title: string;
  say: string[];
  explain: string[];
  words: { w: string; m: string }[];
};

export function askPrompt(
  lesson: AskLesson,
  packMap: { id: string; title: string }[],
  question: string,
): { system: string; prompt: string } {
  const system = [
    "You are a patient teacher inside a learning app. Answer the question directly and fully from what you know:",
    "the open lesson is context, not a limit. Write plain English for a non-native reader: one short sentence per",
    "line, at most ten lines, the direct answer first, then how it works, then a short example when it helps.",
    "When another lesson of the pack covers the answer, name it by its id in drewOn.",
    'Answer with ONE JSON OBJECT and nothing else: {"answer": "<the lines, \\n between them>",',
    '"drewOn": ["<lesson ids from the map that the answer uses, the open lesson included when used>"]}',
  ].join(" ");
  const prompt = [
    `THE OPEN LESSON (${lesson.id}): ${lesson.title}`,
    lesson.say.join("\n"),
    lesson.explain.join("\n"),
    lesson.words.map((w) => `${w.w}: ${w.m}`).join("\n"),
    `THE PACK'S MAP:\n${packMap.map((l) => `- ${l.id}: ${l.title}`).join("\n")}`,
    `THE QUESTION: ${question}`,
  ].join("\n\n");
  return { system, prompt };
}
