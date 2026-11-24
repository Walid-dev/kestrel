// The quiz's rules the page and the server share, so the page's "Start 6 questions" is the number the server draws.
// Nothing from Node here, and no zod: the web may import only src/shared, and its bundle carries no validator.

// a lesson as the quiz's start sees it: its pack, whether it is due for review, how many checks of its own it has
export type QuizLesson = { id: string; title: string; pack: string; due: boolean; checks: number };

// new questions on one lesson, at most: past three, the model's questions start to repeat each other
export const FRESH_PER_LESSON = 3;

// how many questions one lesson can give a quiz. A quiz on lessons I picked goes round them: each of their own checks
// once, or one the model writes when a lesson has none; with new questions, up to three each, so a quiz on one or two
// lessons is still a round. A quiz on a topic or on packs asks each lesson once, as it always has.
export const questionsFrom = (checks: number, fresh: boolean, round: boolean): number =>
  !round ? 1 : fresh ? FRESH_PER_LESSON : Math.max(1, checks);

// the count kept between one and thirty
export const clampCount = (count: number): number => Math.max(1, Math.min(30, Math.floor(count)));

// the quiz a pick would start: how many questions it holds (the count, unless the lessons give fewer)
export const questionsIn = (lessons: { checks: number }[], count: number, fresh: boolean, round: boolean): number =>
  Math.min(
    clampCount(count),
    lessons.reduce((n, l) => n + questionsFrom(l.checks, fresh, round), 0),
  );
