// The app starts here: the router, the server-data cache, and the service worker that keeps the last answers for the
// times the computer is asleep. Every page but Home and Chat is its own file in the build (pages.tsx says why), and
// sits in PageFrame, which shows a quiet line while a page's file comes in.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { App } from "./app.tsx";
import { Chats } from "./chats.tsx";
import { Home } from "./home.tsx";
import {
  Applications,
  Cost,
  Design,
  InterviewHelper,
  LearnLesson,
  LearnPack,
  LearnPacks,
  LearnPractice,
  LivePage,
  Models,
  NotesList,
  NotesPrint,
  NotesSet,
  PageFrame,
  prefetchPages,
  Quiz,
  QuizRun,
  Reader,
  Research,
  Searches,
  SearchSettings,
  Tasks,
  Writing,
} from "./pages.tsx";
import "./styles.css";

const queryClient = new QueryClient();

const rootEl = document.getElementById("root");
if (rootEl)
  createRoot(rootEl).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route element={<PageFrame />}>
              <Route path="notes/:id/print" element={<NotesPrint />} />
            </Route>
            <Route element={<App />}>
              <Route element={<PageFrame />}>
                <Route index element={<Home />} />
                <Route path="notes" element={<NotesList />} />
                <Route path="models" element={<Models />} />
                <Route path="searches" element={<Searches />} />
                <Route path="searches/settings" element={<SearchSettings />} />
                <Route path="applications" element={<Applications />} />
                <Route path="learn" element={<LearnPacks />} />
                <Route path="learn/pack/:id" element={<LearnPack />} />
                <Route path="learn/lesson/:id" element={<LearnLesson />} />
                <Route path="learn/practice" element={<LearnPractice />} />
                <Route path="learn/live" element={<InterviewHelper />} />
                <Route path="interview" element={<LearnPacks area="interview" />} />
                <Route path="interview/helper" element={<InterviewHelper />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="live" element={<LivePage />} />
                <Route path="cost" element={<Cost />} />
                <Route path="design" element={<Design />} />
                <Route path="chats" element={<Chats />} />
                <Route path="research" element={<Research />} />
                <Route path="quiz" element={<Quiz />} />
                <Route path="quiz/:id" element={<QuizRun />} />
                <Route path="writing" element={<Writing />} />
                <Route path="letters" element={<Writing />} />
                <Route path="notes/set" element={<NotesSet />} />
                <Route path="notes/:id" element={<Reader />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );

// The very first visit: the files that came before the service worker took over went past it, so it kept no copy.
// Once it controls the page, ask for them once more through it (the browser's cache answers, nothing downloads
// again), and only then fetch the other pages, so they go through it too. A last sweep catches a file that was still
// coming in when the worker took over. Later visits are controlled from the start, and every file goes through it.
const sweep = () =>
  Promise.allSettled(
    performance
      .getEntriesByType("resource")
      .filter((e) => new URL(e.name).pathname.startsWith("/assets/"))
      .map((e) => fetch(e.name)),
  );

if ("serviceWorker" in navigator) {
  const sw = navigator.serviceWorker;
  const first = !sw.controller;
  const controlled = new Promise<void>((resolve) => {
    if (!first) return resolve();
    sw.addEventListener("controllerchange", () => resolve(), { once: true });
    // a worker that never takes over (refused, or its install failed) doesn't hold the other pages back
    sw.register("/sw.js").catch(() => resolve());
    setTimeout(resolve, 10_000);
  });
  if (!first) sw.register("/sw.js").catch(() => {});
  controlled.then(async () => {
    const through = first && !!sw.controller; // without a worker the sweeps would only ask the browser's cache again
    if (through) await sweep();
    await prefetchPages();
    if (through) await sweep();
  });
} else prefetchPages();
