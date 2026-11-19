import { fixturesPdfResponse } from "../pdf";

/** /season/:id/fixtures.pdf — every team's fixtures in one PDF, ordered by group. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return fixturesPdfResponse((await params).id);
}
