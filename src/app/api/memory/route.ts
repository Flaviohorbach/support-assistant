import { z } from "zod";
import { customers } from "@/data/seed";
import { getDb } from "@/lib/db";
import { forgetCustomer, listMemories } from "@/lib/memory";

const QuerySchema = z.object({
  customerId: z.enum(customers.map((c) => c.id) as [string, ...string[]]),
  visitorId: z.string().min(8).max(64),
});

function parse(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return QuerySchema.safeParse(params);
}

/** What the assistant remembers about this customer, for the memory panel. */
export async function GET(request: Request) {
  const query = parse(request);
  if (!query.success) return new Response("Requisição inválida.", { status: 400 });
  const db = await getDb();
  return Response.json(await listMemories(db, query.data.visitorId, query.data.customerId));
}

/** "Esquecer meus dados": deletes facts and episodes for this customer and visitor. */
export async function DELETE(request: Request) {
  const query = parse(request);
  if (!query.success) return new Response("Requisição inválida.", { status: 400 });
  const db = await getDb();
  await forgetCustomer(db, query.data.visitorId, query.data.customerId);
  return new Response(null, { status: 204 });
}
