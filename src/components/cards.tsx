"use client";

import Image from "next/image";
import type { Order } from "@/lib/orders";
import type { Eligibility } from "@/lib/policy";

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

function StatusBadge({ order }: { order: Order }) {
  return order.status === "delivered" ? (
    <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">Entregue em {date(order.deliveredOn!)}</span>
  ) : (
    <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-warn">Em trânsito · previsão {date(order.expectedOn!)}</span>
  );
}

export function OrderCard({ order }: { order: Order }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display font-semibold">Pedido #{order.id}</h3>
        <StatusBadge order={order} />
      </div>
      {order.items.map((item) => (
        <div key={item.sku} className="flex items-center gap-3">
          <div className="relative size-14 shrink-0 rounded-xl bg-surface-2">
            <Image src={item.image} alt="" fill sizes="56px" className="object-contain p-1.5" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{item.title}</p>
            <p className="text-sm text-muted tabular-nums">{brl(item.priceBRL)} · sku {item.sku}</p>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted">
        Comprado em {date(order.placedOn)}
        {order.tracking && <> · rastreio <span className="font-mono">{order.tracking}</span></>}
      </p>
    </article>
  );
}

export function OrderList({ orders }: { orders: Order[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {orders.map((order) => <OrderCard key={order.id} order={order} />)}
    </div>
  );
}

/** The policy decision, made by code. Color and icon carry the verdict, the text carries the reason. */
export function DecisionCard({ decision, title, reasonLabel }: { decision: Eligibility; title: string; reasonLabel: string }) {
  const tone =
    decision.eligible === true
      ? { label: "Dentro da política", color: "text-ok", border: "border-ok/40", icon: "✓" }
      : decision.eligible === "needs_info"
        ? { label: "Falta uma informação", color: "text-warn", border: "border-warn/40", icon: "?" }
        : { label: "Fora da política", color: "text-danger", border: "border-danger/40", icon: "✕" };

  return (
    <article className={`flex flex-col gap-2 rounded-2xl border bg-surface p-4 ${tone.border}`} aria-label={`Decisão da política: ${tone.label}`}>
      <p className={`flex items-center gap-2 text-sm font-semibold ${tone.color}`}>
        <span aria-hidden className="grid size-5 place-items-center rounded-full border border-current text-xs">{tone.icon}</span>
        {tone.label}
      </p>
      <p className="font-display font-semibold">{title} · {reasonLabel}</p>
      {decision.eligible === true && (
        <>
          <p className="text-sm">{decision.resolution}</p>
          <p className="text-xs text-muted">
            Entregue há {decision.daysSinceDelivery} dias · {decision.daysLeft === 0 ? "último dia do prazo" : `faltam ${decision.daysLeft} dias do prazo`}
          </p>
        </>
      )}
      {decision.eligible === false && <p className="text-sm">{decision.reason}</p>}
      {decision.eligible === "needs_info" && <p className="text-sm">{decision.question}</p>}
      <p className="text-xs text-muted">Regra aplicada: {decision.rule} · decidido pelo sistema, não pela IA</p>
    </article>
  );
}

export function ProtocolCard({ protocol, title, reasonLabel, resolution }: { protocol: string; title: string; reasonLabel: string; resolution: string }) {
  return (
    <article className="flex flex-col gap-1 rounded-2xl border border-ok/40 bg-surface p-4">
      <p className="text-sm font-semibold text-ok">Solicitação aberta</p>
      <p className="font-mono text-lg font-medium tracking-wide">{protocol}</p>
      <p className="text-sm">{title} · {reasonLabel}</p>
      <p className="text-sm text-muted">{resolution}</p>
    </article>
  );
}

export function MemoryChip({ result }: { result: { saved: true; content: string } | { saved: false; reason: string } }) {
  return result.saved ? (
    <p className="self-start rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">Memória atualizada: {result.content}</p>
  ) : (
    <p className="self-start rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-warn">Não guardado na memória: {result.reason}</p>
  );
}

export function Pending({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted" role="status">
      <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden />
      {label}
    </p>
  );
}
