import { fixturesPdfResponse } from "../../../pdf";

/** /season/:id/teams/:teamId/fixtures.pdf — this team's fixtures and results as a PDF. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; teamId: string }> }) {
  const { id, teamId } = await params;
  return fixturesPdfResponse(id, teamId);
}
