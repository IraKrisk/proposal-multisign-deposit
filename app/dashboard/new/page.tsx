import NewProposalForm from "./NewProposalForm";

export default function NewProposalPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">New proposal</h1>
      <p className="text-sm text-app-muted mt-1 mb-8">
        Describe the engagement. Claude drafts the full document from your
        template: you edit pricing and details on the next screen.
      </p>
      <NewProposalForm />
    </div>
  );
}
