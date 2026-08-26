'use client';

import { useRef, useState } from 'react';

type ImportItemResult = {
  index: number;
  title?: string;
  ok: boolean;
  errors?: string[];
};

type ImportResponse =
  | { imported: number; results: ImportItemResult[] }
  | { error: string; code: string; results?: ImportItemResult[] };

type ExistingLesson = {
  id: string;
  languagePairCode: string;
  level: string;
  topic: string;
  title: string;
  position: number;
};

export function ContentImportPanel({ initialLessons }: { initialLessons: ExistingLesson[] }) {
  const [text, setText] = useState('');
  const [lessons, setLessons] = useState(initialLessons);
  const [status, setStatus] = useState<'idle' | 'importing'>('idle');
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function refreshLessons() {
    const res = await fetch('/api/admin/content');
    if (res.ok) {
      const data = await res.json();
      setLessons(data.lessons);
    }
  }

  async function handleImport() {
    setStatus('importing');
    setResponse(null);
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(text);
    } catch {
      setResponse({ error: 'Not valid JSON', code: 'invalid_json' });
      setStatus('idle');
      return;
    }
    try {
      const res = await fetch('/api/admin/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedBody),
      });
      const data: ImportResponse = await res.json();
      setResponse(data);
      if (res.ok) {
        setText('');
        await refreshLessons();
      }
    } catch {
      setResponse({ error: 'Network error', code: 'network_error' });
    } finally {
      setStatus('idle');
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch('/api/admin/content', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) await refreshLessons();
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(setText);
  }

  return (
    <section className="card flex flex-col gap-4 p-5">
      <h2 className="heading-section">
        Content import (§2, Phase 5)
      </h2>
      <p className="text-sm text-ink-muted">
        Paste or upload a JSON array of lessons. Every item is validated before anything is
        written - if any item fails, nothing is imported.
      </p>

      <div className="flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='[{ "languagePairCode": "en>es-speaker", "level": "A1", "topic": "greetings", "title": "...", "content": { "intro": "...", "vocab": [], "exercises": [] } }]'
          rows={10}
          className="field w-full p-3 font-mono text-xs"
        />
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleFile}
            className="text-sm text-ink-muted"
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={status === 'importing' || text.trim().length === 0}
            className="btn-primary btn-sm"
          >
            {status === 'importing' ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>

      {response && (
        <div
          className={`rounded-xl border p-3 text-sm ${
            'imported' in response
              ? 'border-success-500 bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500'
              : 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'
          }`}
        >
          {'imported' in response ? (
            <p>Imported {response.imported} lesson(s).</p>
          ) : (
            <p className="font-medium">{response.error}</p>
          )}
          {response.results && response.results.some((r) => !r.ok) && (
            <ul className="mt-2 flex flex-col gap-1">
              {response.results
                .filter((r) => !r.ok)
                .map((r) => (
                  <li key={r.index}>
                    Item {r.index + 1}
                    {r.title ? ` ("${r.title}")` : ''}: {r.errors?.join('; ')}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-ink">
          Imported lessons ({lessons.length})
        </h3>
        <ul className="flex flex-col gap-1">
          {lessons.length === 0 && (
            <li className="text-sm text-ink-muted">No lesson content imported yet.</li>
          )}
          {lessons.map((l) => (
            <li
              key={l.id}
              className="panel flex items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <span className="truncate text-ink">
                <span className="font-mono text-xs text-ink-muted">{l.languagePairCode}</span>{' '}
                {l.level} · {l.topic} · {l.title}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(l.id)}
                className="shrink-0 text-red-600 hover:underline dark:text-red-400"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
