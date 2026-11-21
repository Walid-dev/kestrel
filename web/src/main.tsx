// The app starts here: the router, the server-data cache, and the service worker that keeps the last answers for the
// times the computer is asleep.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { App } from "./app.tsx";
import { Home } from "./home.tsx";
import { Models } from "./models.tsx";
import { NotesList } from "./notes/list.tsx";
import { Reader } from "./notes/reader.tsx";
import { NotesSet } from "./notes/set.tsx";
import { Searches } from "./search/searches.tsx";
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
              <Route path="notes/set" element={<NotesSet />} />
              <Route path="notes/:id" element={<Reader />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
