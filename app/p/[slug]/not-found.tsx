export default function ProposalNotFound() {
  return (
    <main className="doc min-h-screen grid place-items-center px-6">
      <div className="text-center max-w-md">
        <h1 className="doc-display text-3xl text-white">
          This proposal isn&apos;t available
        </h1>
        <p className="text-doc-muted mt-3 leading-relaxed">
          The link may have expired or been mistyped. Check with whoever sent it
          to you for a current link.
        </p>
      </div>
    </main>
  );
}
