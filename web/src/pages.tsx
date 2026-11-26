// Each page as its own file in the build, so a phone opening one page downloads that page and the shared code, not
// every page. A page comes in when its route first shows (React's lazy); the frame around it shows a quiet line if
// that takes a moment, and a plain message if the page can't come at all (the computer asleep before the page was
// ever opened here). After the first screen, the other pages come in quietly: the five tabs first, then the rest, so
// a tab never waits on the network and the service worker keeps a copy of every page for when the computer sleeps.
// Home and Chat stay in the first file: the frame itself (app.tsx) uses parts of both.
import { Component, lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { EmptyState } from "./ui/empty.tsx";

// every page file, once: lazy() and the prefetch both load through this table, so they fetch the same file
const load = {
  searches: () => import("./search/searches.tsx"),
  learnPacks: () => import("./learn/packs.tsx"),
  live: () => import("./live.tsx"),
  notesList: () => import("./notes/list.tsx"),
  notesPrint: () => import("./notes/print.tsx"),
  reader: () => import("./notes/reader.tsx"),
  notesSet: () => import("./notes/set.tsx"),
  models: () => import("./models.tsx"),
  searchSettings: () => import("./search/settings.tsx"),
  applications: () => import("./apply/applications.tsx"),
  lesson: () => import("./learn/lesson.tsx"),
  practice: () => import("./learn/practice.tsx"),
  helper: () => import("./learn/helper.tsx"),
  tasks: () => import("./tasks.tsx"),
  cost: () => import("./cost.tsx"),
  design: () => import("./design.tsx"),
  research: () => import("./research.tsx"),
  quiz: () => import("./quiz.tsx"),
  writing: () => import("./letters.tsx"),
  news: () => import("./news/page.tsx"),
  newsDays: () => import("./news/days.tsx"),
  shopping: () => import("./shopping/page.tsx"),
  shoppingWant: () => import("./shopping/want.tsx"),
};

// the tabs on the phone's bottom bar that live in a file of their own (Home and Chat are in the first file)
const TABS: (keyof typeof load)[] = ["searches", "learnPacks", "live"];

export const Searches = lazy(() => load.searches().then((m) => ({ default: m.Searches })));
export const SearchSettings = lazy(() => load.searchSettings().then((m) => ({ default: m.SearchSettings })));
export const LearnPacks = lazy(() => load.learnPacks().then((m) => ({ default: m.LearnPacks })));
export const LearnPack = lazy(() => load.learnPacks().then((m) => ({ default: m.LearnPack })));
export const LearnLesson = lazy(() => load.lesson().then((m) => ({ default: m.LearnLesson })));
export const LearnPractice = lazy(() => load.practice().then((m) => ({ default: m.LearnPractice })));
export const InterviewHelper = lazy(() => load.helper().then((m) => ({ default: m.InterviewHelper })));
export const LivePage = lazy(() => load.live().then((m) => ({ default: m.LivePage })));
export const NotesList = lazy(() => load.notesList().then((m) => ({ default: m.NotesList })));
export const NotesPrint = lazy(() => load.notesPrint().then((m) => ({ default: m.NotesPrint })));
export const NotesSet = lazy(() => load.notesSet().then((m) => ({ default: m.NotesSet })));
export const Reader = lazy(() => load.reader().then((m) => ({ default: m.Reader })));
export const Models = lazy(() => load.models().then((m) => ({ default: m.Models })));
export const Applications = lazy(() => load.applications().then((m) => ({ default: m.Applications })));
export const Tasks = lazy(() => load.tasks().then((m) => ({ default: m.Tasks })));
export const Cost = lazy(() => load.cost().then((m) => ({ default: m.Cost })));
export const Design = lazy(() => load.design().then((m) => ({ default: m.Design })));
export const Research = lazy(() => load.research().then((m) => ({ default: m.Research })));
export const Quiz = lazy(() => load.quiz().then((m) => ({ default: m.Quiz })));
export const QuizRun = lazy(() => load.quiz().then((m) => ({ default: m.QuizRun })));
export const Writing = lazy(() => load.writing().then((m) => ({ default: m.Writing })));
export const News = lazy(() => load.news().then((m) => ({ default: m.News })));
export const NewsDays = lazy(() => load.newsDays().then((m) => ({ default: m.NewsDays })));
export const Shopping = lazy(() => load.shopping().then((m) => ({ default: m.Shopping })));
export const ShoppingWant = lazy(() => load.shoppingWant().then((m) => ({ default: m.ShoppingWant })));

// After the first screen is up and the browser is idle: the tabs, then every other page. A file already loaded costs
// nothing (the browser keeps one copy of each module), and a file whose name hasn't changed comes from the cache. A
// deploy renames every page file that imports a changed one, and the first file changes with almost any change, so
// most pages come in again after a deploy. Resolves once every page has come in or failed.
export function prefetchPages(): Promise<void> {
  const idle = (run: () => void) =>
    "requestIdleCallback" in window ? requestIdleCallback(run, { timeout: 3000 }) : setTimeout(run, 1200);
  const all = (keys: (keyof typeof load)[]) => Promise.allSettled(keys.map((k) => load[k]()));
  const rest = (Object.keys(load) as (keyof typeof load)[]).filter((k) => !TABS.includes(k));
  return new Promise<void>((done) => {
    const start = () => idle(() => all(TABS).then(() => idle(() => all(rest).then(() => done()))));
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
  });
}

// The quiet line while a page's file comes in: nothing for the first 400 ms, so a quick load shows no flash, then the
// thin sweeping bar the lists use when they refill. No spinner, nothing that moves the page.
function Opening() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div role="status" className="pt-2">
      {shown && <div className="loading-bar" aria-hidden="true" />}
      <span className="sr-only">Opening the page</span>
    </div>
  );
}

// A page that can't come in: the app was deployed again and this page's old file is gone (a reload brings the new
// version), or its file never reached this phone and the computer doesn't answer now. The message stays inside the frame, so the bar and the tabs still work;
// going to another address clears it.
type Caught = { error: boolean; path: string };
class PageError extends Component<{ path: string; children: ReactNode }, Caught> {
  state: Caught = { error: false, path: this.props.path };
  static getDerivedStateFromError() {
    return { error: true };
  }
  static getDerivedStateFromProps(props: { path: string }, state: Caught): Partial<Caught> | null {
    return props.path === state.path ? null : { error: false, path: props.path };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert">
        <EmptyState
          title="This page didn't open."
          line="A new version is probably ready: reload to get it. If the computer is asleep, reload once it answers."
          action={
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          }
        />
      </div>
    );
  }
}

// The one frame every page sits in, as a route with no address of its own: it stays mounted from page to page, so a
// tap on a tab keeps the page on screen until the next one is ready (the router moves in a transition), instead of
// flashing the quiet line.
export function PageFrame() {
  const { pathname } = useLocation();
  return (
    <PageError path={pathname}>
      <Suspense fallback={<Opening />}>
        <Outlet />
      </Suspense>
    </PageError>
  );
}
