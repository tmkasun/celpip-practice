import { useCallback, useRef, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useMatch, useParams, useSearchParams } from "react-router-dom";
import Practice from "./Practice";
import Review, { History } from "./Review";
import { loadSessions, saveAudio, saveSession, type Session } from "./practiceStorage";
import { taskTitles, type Skill } from "./questions/pool";
import "./App.css";

const officialPractice = "https://www.celpip.ca/free-practice-tests/";

function Home() {
  return (
    <main className="page home" id="main">
      <section className="intro">
        <p className="eyebrow">CELPIP General</p>
        <h1>Practice for test day.</h1>
        <p>Work on one task at a time, or run a timed section and review your responses afterward.</p>
        <Link className="button secondary" to="/review">Review your attempts <span aria-hidden="true">→</span></Link>
      </section>
      <div className="home-grid">
        <section className="card skill-card">
          <div className="skill-heading"><h2>Writing</h2><span>53 min</span></div>
          <p>Write an email and respond to a survey. Review both drafts against CELPIP’s criteria.</p>
          <div className="actions">
            <Link className="button primary" to="/mock/writing">Start Writing mock</Link>
            <Link className="text-link" to="/writing/1">Drill a Writing task <span aria-hidden="true">→</span></Link>
          </div>
        </section>
        <section className="card skill-card">
          <div className="skill-heading"><h2>Speaking</h2><span>About 15 min</span></div>
          <p>Work through all eight tasks with timed preparation and recording, then listen back.</p>
          <div className="actions">
            <Link className="button primary" to="/mock/speaking">Start Speaking mock</Link>
            <Link className="text-link" to="/speaking/1">Drill a Speaking task <span aria-hidden="true">→</span></Link>
          </div>
        </section>
        <section className="card skill-card resource-card">
          <div className="skill-heading"><h2>Listening</h2><span>46–55 min</span></div>
          <p>Use the official audio, questions and answer key.</p>
          <a className="text-link" href={officialPractice} target="_blank" rel="noreferrer">Official Listening practice <span aria-hidden="true">↗</span></a>
        </section>
        <section className="card skill-card resource-card">
          <div className="skill-heading"><h2>Reading</h2><span>43–56 min</span></div>
          <p>Use the official passages, questions and answer key.</p>
          <a className="text-link" href={officialPractice} target="_blank" rel="noreferrer">Official Reading practice <span aria-hidden="true">↗</span></a>
        </section>
      </div>
    </main>
  );
}

interface PracticeData {
  sessions: Session[];
  save: (session: Session) => void;
  keepAudio: (key: string, blob: Blob) => void;
}

function PracticeRoute({ skill, mode, sessions, save, keepAudio }: PracticeData & {
  skill: Skill;
  mode: Session["mode"];
}) {
  const { taskId } = useParams();
  const [search] = useSearchParams();
  const requestedSet = search.get("set");
  const set = requestedSet === "2" ? 2 : 1;
  const hasRequestedSet = requestedSet === "1" || requestedSet === "2";
  const task = mode === "mock" ? 1 : Number(taskId);
  if (!Number.isInteger(task) || task < 1 || task > taskTitles[skill].length) {
    return <Navigate replace to={"/" + skill + "/1"} />;
  }

  const draft = mode === "drill" && skill === "writing" ? sessions.find((session) =>
    session.status === "active" && session.skill === skill && session.mode === mode &&
    session.responses[0]?.task === task && (!hasRequestedSet || session.set === set)
  ) : undefined;

  return <Practice
    key={mode + "-" + skill + "-" + task + "-" + set}
    skill={skill} mode={mode} firstTask={task} initialSet={set} draft={draft} save={save} keepAudio={keepAudio}
  />;
}

function ReviewRoute({ sessions, save, getMemoryAudio }: {
  sessions: Session[];
  save: (session: Session) => void;
  getMemoryAudio: (key: string) => Blob | undefined;
}) {
  const { sessionId } = useParams();
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) return <Navigate replace to="/review" />;
  if (session.status === "active") return <Navigate replace to={session.mode === "drill" && session.skill === "writing" ? "/writing/" + session.responses[0].task + "?set=" + session.set : "/review"} />;
  return <Review key={session.id} session={session} save={save} getMemoryAudio={getMemoryAudio} />;
}

export default function App() {
  const isMockPage = Boolean(useMatch("/mock/:skill"));
  const [sessions, setSessions] = useState(loadSessions);
  const [storageError, setStorageError] = useState(false);
  const memoryAudio = useRef(new Map<string, Blob>());

  const save = useCallback((session: Session) => {
    setSessions((items) => {
      const index = items.findIndex((item) => item.id === session.id);
      return index === -1 ? [session, ...items] : items.map((item, position) => position === index ? session : item);
    });
    try {
      saveSession(session);
    } catch {
      setStorageError(true);
    }
  }, []);

  const keepAudio = useCallback((key: string, blob: Blob) => {
    memoryAudio.current.set(key, blob);
    saveAudio(key, blob).then(() => memoryAudio.current.delete(key), () => setStorageError(true));
  }, []);
  const getMemoryAudio = useCallback((key: string) => memoryAudio.current.get(key), []);

  const data = { sessions, save, keepAudio };
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      {!isMockPage && <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand"><span className="brand-mark" aria-hidden="true">CP</span> CELPIP Practice</Link>
          <nav aria-label="Main navigation"><NavLink end to="/">Practice</NavLink><NavLink to="/review">Review</NavLink></nav>
        </div>
      </header>}
      {storageError && <p className="notice storage-notice" role="alert">Browser storage is unavailable for some responses. Copy or download your work before closing this page.</p>}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/writing" element={<Navigate replace to="/writing/1" />} />
        <Route path="/speaking" element={<Navigate replace to="/speaking/1" />} />
        <Route path="/writing/:taskId" element={<PracticeRoute {...data} skill="writing" mode="drill" />} />
        <Route path="/speaking/:taskId" element={<PracticeRoute {...data} skill="speaking" mode="drill" />} />
        <Route path="/mock/writing" element={<PracticeRoute {...data} skill="writing" mode="mock" />} />
        <Route path="/mock/speaking" element={<PracticeRoute {...data} skill="speaking" mode="mock" />} />
        <Route path="/review" element={<History sessions={sessions.filter((item) => item.status !== "active" || (item.mode === "drill" && item.skill === "writing"))} />} />
        <Route path="/review/:sessionId" element={<ReviewRoute sessions={sessions} save={save} getMemoryAudio={getMemoryAudio} />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
      {!isMockPage && <footer className="site-footer"><span>Independent CELPIP practice</span><a href="https://www.celpip.ca/test-format-scoring/" target="_blank" rel="noreferrer">Official test format and scoring ↗</a></footer>}
    </>
  );
}
