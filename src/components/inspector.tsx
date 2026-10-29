"use client";

import { useState } from "react";
import type { MemoryItem } from "@/lib/memory";
import type { ContextMetadata } from "@/lib/tools";

/**
 * "O que a IA vê": the context of the last answer, section by section, with
 * token estimates, and the long-term memory with a delete button. Context
 * engineering made visible, so it can be inspected instead of guessed.
 */
export function Inspector({
  context,
  memory,
  onForget,
  forgetting,
}: {
  context: ContextMetadata | null;
  memory: { facts: MemoryItem[]; episodes: MemoryItem[] };
  onForget: () => void;
  forgetting: boolean;
}) {
  const [tab, setTab] = useState<"context" | "memory">("context");
  const [open, setOpen] = useState<string | null>(null);
  const max = context ? Math.max(...context.sections.map((s) => s.tokens), context.history.tokens, 1) : 1;

  const tabClass = (active: boolean) =>
    `flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition ${active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`;

  return (
    <aside className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-2/60 p-4" aria-label="O que a IA vê">
      <div>
        <h2 className="font-display text-lg font-semibold">O que a IA vê</h2>
        <p className="text-sm text-muted">Tudo que entra no modelo a cada resposta, e o que ele lembra de você.</p>
      </div>

      <div className="flex gap-1 rounded-full bg-surface-2 p-1" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "context"} className={tabClass(tab === "context")} onClick={() => setTab("context")}>
          Contexto
        </button>
        <button type="button" role="tab" aria-selected={tab === "memory"} className={tabClass(tab === "memory")} onClick={() => setTab("memory")}>
          Memória ({memory.facts.length + memory.episodes.length})
        </button>
      </div>

      {tab === "context" &&
        (context ? (
          <div className="flex flex-col gap-2" role="tabpanel">
            <p className="text-sm">
              <span className="font-mono font-medium tabular-nums">~{context.totalTokens.toLocaleString("pt-BR")}</span>
              <span className="text-muted"> tokens na última resposta</span>
            </p>
            <ul className="flex flex-col gap-1.5">
              {context.sections.map((section) => (
                <li key={section.id} className="rounded-xl bg-surface">
                  <button
                    type="button"
                    onClick={() => setOpen(open === section.id ? null : section.id)}
                    aria-expanded={open === section.id}
                    className="flex w-full flex-col gap-1.5 px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <span className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate font-medium">{section.label}</span>
                      <span className="shrink-0 font-mono text-xs text-muted tabular-nums">{section.tokens}</span>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${(section.tokens / max) * 100}%` }} />
                    </span>
                    {(section.note || section.dropped) && (
                      <span className="text-xs text-muted">
                        {section.note}
                        {section.dropped ? `${section.note ? " · " : ""}${section.dropped} item(ns) fora do orçamento` : ""}
                      </span>
                    )}
                  </button>
                  {open === section.id && (
                    <pre className="max-h-64 overflow-auto border-t border-line px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted">
                      {section.content}
                    </pre>
                  )}
                </li>
              ))}
              <li className="flex flex-col gap-1.5 rounded-xl bg-surface px-3 py-2">
                <span className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">Conversa ({context.history.messages} mensagens)</span>
                  <span className="font-mono text-xs text-muted tabular-nums">{context.history.tokens}</span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <span className="block h-full rounded-full bg-price" style={{ width: `${(context.history.tokens / max) * 100}%` }} />
                </span>
                {(context.history.droppedMessages > 0 || context.history.prunedToolResults > 0) && (
                  <span className="text-xs text-muted">
                    {context.history.droppedMessages} mensagens antigas fora · {context.history.prunedToolResults} resultados de ferramenta resumidos
                  </span>
                )}
              </li>
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted" role="tabpanel">Envie uma mensagem para ver como o contexto é montado.</p>
        ))}

      {tab === "memory" && (
        <div className="flex flex-col gap-4" role="tabpanel">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Fatos sobre você</h3>
            {memory.facts.length ? (
              <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                {memory.facts.map((f) => <li key={f.id} className="rounded-lg bg-surface px-3 py-1.5">{f.content}</li>)}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">Nada ainda. Conte algo como “calço 37” e veja aparecer aqui.</p>
            )}
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Atendimentos anteriores</h3>
            {memory.episodes.length ? (
              <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                {memory.episodes.map((e) => <li key={e.id} className="rounded-lg bg-surface px-3 py-1.5">{e.content}</li>)}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">Nenhum ainda. Abra uma troca e ela será lembrada na próxima conversa.</p>
            )}
          </section>
          <button
            type="button"
            onClick={onForget}
            disabled={forgetting || memory.facts.length + memory.episodes.length === 0}
            className="self-start rounded-full border border-danger/50 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
          >
            {forgetting ? "Apagando…" : "Esquecer meus dados"}
          </button>
        </div>
      )}
    </aside>
  );
}
