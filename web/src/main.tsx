// The app starts here: the router, the server-data cache, and the service worker that keeps the last answers for the
// times the computer is asleep.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { App } from "./app.tsx";
import { Applications } from "./apply/applications.tsx";
import { Home } from "./home.tsx";
import { InterviewHelper } from "./learn/helper.tsx";
import { LearnLesson } from "./learn/lesson.tsx";
import { LearnPack, LearnPacks } from "./learn/packs.tsx";
import { LearnPractice } from "./learn/practice.tsx";
import { LivePage } from "./live.tsx";
import { Models } from "./models.tsx";
import { NotesList } from "./notes/list.tsx";
import { Reader } from "./notes/reader.tsx";
import { NotesSet } from "./notes/set.tsx";
import { Searches } from "./search/searches.tsx";
import { Tasks } from "./tasks.tsx";
import "./styles.css";

const queryClient = new QueryClient();

const rootEl = document.getElementById("root");
if (rootEl)
  createRoot(rootEl).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route element={<App />}>
              <Route index element={<Home />} />
              <Route path="notes" element={<NotesList />} />
              <Route path="models" element={<Models />} />
              <Route path="searches" element={<Searches />} />
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
              <Route path="notes/set" element={<NotesSet />} />
              <Route path="notes/:id" element={<Reader />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
