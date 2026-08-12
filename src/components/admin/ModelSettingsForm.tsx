'use client';

import { useState } from 'react';
import {
  LLM_TASKS,
  PROVIDER_IDS,
  TASK_DESCRIPTIONS,
  TASK_LABELS,
  estimateCostPer100Turns,
  type LlmTask,
  type ModelSpec,
  type ProviderId,
} from '@/lib/llm/catalog';
import type { LlmSettings, ModelSelection } from '@/lib/zodSchemas';

type ProviderInfo = {
  id: ProviderId;
  label: string;
  apiKeyEnvVar: string;
  acceptsAudioDirectly: boolean;
  pricingUrl: string;
  hasKey: boolean;
};

type TestState = {
  status: 'idle' | 'running' | 'done';
  ok?: boolean;
  latencyMs?: number;
  schemaValid?: boolean;
  sampleReply?: string | null;
  message?: string;
};

const CUSTOM = '__custom__';

function formatUsd(value: number): string {
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

export function ModelSettingsForm({
  initialSettings,
  models,
  providers,
}: {
  initialSettings: LlmSettings;
  models: ModelSpec[];
  providers: ProviderInfo[];
}) {
  const [settings, setSettings] = useState<LlmSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<Partial<Record<LlmTask, TestState>>>({});

  const usesOpenai = LLM_TASKS.some((t) => settings.tasks[t]?.providerId === 'openai');

  function providerInfo(id: ProviderId): ProviderInfo {
    return providers.find((p) => p.id === id) ?? providers[0];
  }

  function updateTask(task: LlmTask, patch: Partial<ModelSelection>) {
    setSaved(false);
    setSettings((prev) => {
      const current = prev.tasks[task] ?? { providerId: 'gemini' as ProviderId, modelId: '' };
      return { ...prev, tasks: { ...prev.tasks, [task]: { ...current, ...patch } } };
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Could not save. Try again.');
        return;
      }
      setSaved(true);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(task: LlmTask) {
    const selection = settings.tasks[task];
    if (!selection?.modelId) return;
    setTests((prev) => ({ ...prev, [task]: { status: 'running' } }));
    try {
      const res = await fetch('/api/admin/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selection),
      });
      const data = await res.json().catch(() => ({}));
      setTests((prev) => ({ ...prev, [task]: { status: 'done', ...data } }));
    } catch {
      setTests((prev) => ({
        ...prev,
        [task]: { status: 'done', ok: false, message: 'Could not reach the server.' },
      }));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {LLM_TASKS.map((task) => {
        const selection = settings.tasks[task] ?? { providerId: 'gemini' as ProviderId, modelId: '' };
        const provider = providerInfo(selection.providerId);
        const providerModels = models.filter((m) => m.providerId === selection.providerId);
        const known = providerModels.find((m) => m.id === selection.modelId);
        const isCustom = !known;
        const cost = estimateCostPer100Turns(known);
        const test = tests[task];

        return (
          <section
            key={task}
            className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {TASK_LABELS[task]}
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {TASK_DESCRIPTIONS[task]}
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-300">Provider</span>
                <select
                  className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-800"
                  value={selection.providerId}
                  onChange={(e) => {
                    const providerId = e.target.value as ProviderId;
                    const firstModel = models.find((m) => m.providerId === providerId);
                    updateTask(task, { providerId, modelId: firstModel?.id ?? '' });
                  }}
                >
                  {PROVIDER_IDS.map((id) => (
                    <option key={id} value={id}>
                      {providerInfo(id).label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-300">Model</span>
                <select
                  className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-800"
                  value={isCustom ? CUSTOM : selection.modelId}
                  onChange={(e) =>
                    updateTask(task, {
                      modelId: e.target.value === CUSTOM ? '' : e.target.value,
                    })
                  }
                >
                  {providerModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                  <option value={CUSTOM}>Type a model ID…</option>
                </select>
              </label>

              {isCustom && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-600 dark:text-slate-300">Model ID</span>
                  <input
                    className="rounded border border-slate-300 px-2 py-1 font-mono dark:border-slate-600 dark:bg-slate-800"
                    value={selection.modelId}
                    placeholder="exact ID from the provider's docs"
                    onChange={(e) => updateTask(task, { modelId: e.target.value })}
                  />
                </label>
              )}
            </div>

            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-500 dark:text-slate-400">Price</dt>
              <dd className="text-slate-800 dark:text-slate-100">
                {known && known.inputPricePerMTok !== null && known.outputPricePerMTok !== null ? (
                  <>
                    ${known.inputPricePerMTok}/1M in · ${known.outputPricePerMTok}/1M out
                    {known.freeTier && ' · free tier available'}
                  </>
                ) : (
                  <>
                    Unknown to this app —{' '}
                    <a
                      className="underline"
                      href={provider.pricingUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      check {provider.label} pricing
                    </a>
                  </>
                )}
              </dd>

              <dt className="text-slate-500 dark:text-slate-400">Est. per 100 turns</dt>
              <dd className="text-slate-800 dark:text-slate-100">
                {cost ? `${formatUsd(cost.per100Turns)} (rough estimate)` : '—'}
              </dd>
            </dl>

            {known?.notes && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{known.notes}</p>
            )}

            {!provider.hasKey && (
              <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {provider.apiKeyEnvVar} is not set — turns using this provider will fail.
              </p>
            )}

            {!provider.acceptsAudioDirectly && (
              <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {provider.label} can&apos;t hear the recording directly. Each turn runs
                speech-to-text first, then feedback — two calls, slower and more expensive, and{' '}
                <strong>no pronunciation feedback</strong>, because a transcript can&apos;t carry
                it.
              </p>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleTest(task)}
                disabled={test?.status === 'running' || !selection.modelId}
                className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-slate-600"
              >
                {test?.status === 'running' ? 'Testing…' : 'Test this model'}
              </button>
              {test?.status === 'done' && (
                <span className="text-sm">
                  {test.ok ? (
                    <span className="text-green-700 dark:text-green-400">
                      Worked in {test.latencyMs}ms
                      {test.schemaValid === false && ' — but the JSON did not match our schema'}
                    </span>
                  ) : (
                    <span className="text-red-700 dark:text-red-400">
                      Failed: {test.message ?? 'unknown error'}
                    </span>
                  )}
                </span>
              )}
            </div>
            {test?.status === 'done' && test.ok && test.sampleReply && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Sample reply: “{test.sampleReply}”
              </p>
            )}
          </section>
        );
      })}

      {usesOpenai && (
        <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            OpenAI speech-to-text model
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Required while any task above runs on OpenAI — it turns the recording into text before
            the feedback call. Not used by Gemini.
          </p>
          <input
            className="mt-3 w-full max-w-sm rounded border border-slate-300 px-2 py-1 font-mono text-sm dark:border-slate-600 dark:bg-slate-800"
            value={settings.openaiTranscribeModelId}
            placeholder="exact transcription model ID"
            onChange={(e) => {
              setSaved(false);
              setSettings((prev) => ({ ...prev, openaiTranscribeModelId: e.target.value }));
            }}
          />
        </section>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && (
          <span className="text-sm text-green-700 dark:text-green-400">
            Saved — live within 30 seconds, no redeploy.
          </span>
        )}
        {error && <span className="text-sm text-red-700 dark:text-red-400">{error}</span>}
      </div>
    </div>
  );
}
