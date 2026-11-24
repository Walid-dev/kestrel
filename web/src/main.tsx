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

prefetchPages();

if ("serviceWorker" in navigator) {
  // The very first visit: this page's own files came before the service worker was there to keep a copy. Once it
  // takes over, ask for them once more through it (the browser's cache answers, nothing is downloaded again), so the
  // page opened first also works while the computer sleeps. Every later file goes through the worker by itself.
  if (!navigator.serviceWorker.controller)
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        for (const e of performance.getEntriesByType("resource"))
          if (new URL(e.name).pathname.startsWith("/assets/")) fetch(e.name).catch(() => {});
      },
      { once: true },
    );
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
