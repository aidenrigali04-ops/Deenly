import Link from "next/link";

export default function CheckoutCancelPage() {
  return (
    <div className="page-stack mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-text">Checkout canceled</h1>
      <p className="mt-3 text-sm text-muted">No charge was made. You can close this tab or try again from the post.</p>
      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href="/feed" className="btn-primary inline-flex justify-center px-4 py-2 text-sm">
          Back to feed
        </Link>
      </div>
    </div>
  );
}
