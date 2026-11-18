import { EmptyState, LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg">
      <EmptyState icon="🤷" title="Page not found">
        <p>That season, team or match doesn&apos;t exist.</p>
        <LinkButton href="/" variant="primary" className="mt-4">Back to the table</LinkButton>
      </EmptyState>
    </div>
  );
}
