// The closing rule of every public page. Deliberately minimal: an attribution line and nothing
// else. It carries no navigation — the masthead's tab bar is the site's only wayfinding.

export function SiteFooter({ labName }: { labName: string }) {
  const year = new Date().getFullYear();

  return (
    // No top margin: `main` already ends on its own bottom padding.
    <footer className="border-t border-border-strong">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-8">
        <p className="text-sm text-muted-foreground">
          <span className="tabular">{year}</span> {labName}
        </p>
      </div>
    </footer>
  );
}
