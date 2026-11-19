import { fixturesPdfResponse } from "../pdf";

/** /season/:id/fixtures.pdf — every team's fixtures, each team on its own page. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return fixturesPdfResponse((await params).id);
}
