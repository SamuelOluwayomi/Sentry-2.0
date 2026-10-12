import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="sentry-bw min-h-screen bg-[#F7F4EC] text-[#121212] px-4 py-10 sm:px-6">
      <section className="mx-auto max-w-3xl border-2 border-[#121212] bg-[#FDFBF7] p-6 sm:p-8">
        <Link href="/" className="font-mono text-xs font-bold uppercase text-[#5A564F] hover:text-[#121212]">
          Back to Sentry
        </Link>
        <h1 className="mt-6 font-serif text-3xl font-black leading-tight sm:text-5xl">
          Terms Of Service
        </h1>
        <p className="mt-4 font-sans text-sm leading-7 text-[#5A564F]">
          These terms describe basic conditions for using Sentry 2.0 as a developer training and transaction observability product.
        </p>

        <div className="mt-8 space-y-6 font-sans text-sm leading-7">
          <section>
            <h2 className="font-serif text-xl font-bold">Use At Your Own Risk</h2>
            <p className="mt-2 text-[#5A564F]">
              Blockchain transactions can be irreversible. Review all wallet actions and network selections before submitting any transaction.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold">No Custody</h2>
            <p className="mt-2 text-[#5A564F]">
              Sentry does not request seed phrases or private keys. Keep wallet credentials private and use test networks for training flows whenever possible.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold">Training Content</h2>
            <p className="mt-2 text-[#5A564F]">
              Labs, examples, and diagnostics are provided for education, testing, and product demonstration. They are not financial, legal, or security advice.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold">Service Changes</h2>
            <p className="mt-2 text-[#5A564F]">
              Features, integrations, network endpoints, and lab behavior may change as the product evolves.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
