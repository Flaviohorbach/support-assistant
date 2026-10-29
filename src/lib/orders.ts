import type { SeedItem } from "@/data/seed";
import type { Db } from "./db";

export interface Order {
  id: string;
  status: "delivered" | "in_transit";
  placedOn: string;
  deliveredOn: string | null;
  deliveredDaysAgo: number | null;
  expectedOn: string | null;
  tracking: string | null;
  items: SeedItem[];
  totalBRL: number;
}

interface OrderRow {
  id: string;
  status: "delivered" | "in_transit";
  placed_days_ago: number;
  delivered_days_ago: number | null;
  expected_in_days: number | null;
  tracking: string | null;
  items: SeedItem[] | string;
}

const DAY = 86_400_000;
const isoDate = (offsetDays: number, today: Date) => new Date(today.getTime() + offsetDays * DAY).toISOString().slice(0, 10);

function toOrder(row: OrderRow, today: Date): Order {
  const items = typeof row.items === "string" ? (JSON.parse(row.items) as SeedItem[]) : row.items;
  return {
    id: row.id,
    status: row.status,
    placedOn: isoDate(-row.placed_days_ago, today),
    deliveredOn: row.delivered_days_ago === null ? null : isoDate(-row.delivered_days_ago, today),
    deliveredDaysAgo: row.delivered_days_ago,
    expectedOn: row.expected_in_days === null ? null : isoDate(row.expected_in_days, today),
    tracking: row.tracking,
    items,
    totalBRL: Math.round(items.reduce((sum, i) => sum + i.priceBRL, 0) * 100) / 100,
  };
}

/**
 * Authorization lives in the query: every lookup filters by the customer of
 * the conversation. The model can ask for any order id; it only ever gets the
 * customer's own orders. No prompt can change a WHERE clause.
 */
export async function listOrders(db: Db, customerId: string, today = new Date()): Promise<Order[]> {
  const rows = await db.query<OrderRow>("SELECT * FROM orders WHERE customer_id = $1 ORDER BY placed_days_ago ASC", [customerId]);
  return rows.map((r) => toOrder(r, today));
}

export async function findOrder(db: Db, customerId: string, orderId: string, today = new Date()): Promise<Order | null> {
  const id = orderId.replace(/\D/g, "");
  const [row] = await db.query<OrderRow>("SELECT * FROM orders WHERE id = $1 AND customer_id = $2", [id, customerId]);
  return row ? toOrder(row, today) : null;
}
