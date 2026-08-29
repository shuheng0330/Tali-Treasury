import Link from 'next/link';

const ROUTES = [
  { href: '/claim', title: 'Submit a claim', body: 'The member journey: photograph a receipt, confirm what was read, watch the rules decide.' },
  { href: '/treasury', title: 'Treasurer view', body: 'The mandate, the budget, and the claims the agent escalated instead of paying.' },
  { href: '/safety', title: 'Safety test', body: 'Try to make the agent overspend. Watch the contract refuse.' },
  { href: '/system', title: 'Design system', body: 'Status chips, amounts and the budget meter, in both themes.' },
];

export default function Page() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-10 px-5 py-16">
      <div className="flex flex-col gap-4">
        <h1 className="max-w-2xl text-display">Set the rules once. The money enforces them.</h1>
        <p className="max-w-xl text-subhead text-ink-2">
          Your committee photographs receipts. The agent reads them and pays what is allowed —
          and only that. The limits live on Sui, so nobody has to trust the app.
        </p>
      </div>

      <nav className="flex flex-col gap-3">
        {ROUTES.map((route) => (
          <Link
            key={route.href}
            href={route.href}
            className="group flex flex-col gap-1 rounded-card border border-rule bg-surface px-5 py-4 transition-colors duration-150 ease-pop hover:border-rule-strong hover:bg-raised"
          >
            <span className="flex items-center gap-2 text-subhead font-medium">
              {route.title}
              <span className="text-ink-3 transition-transform duration-150 ease-pop group-hover:translate-x-0.5" aria-hidden>
                →
              </span>
            </span>
            <span className="text-caption text-ink-3">{route.body}</span>
          </Link>
        ))}
      </nav>

      <p className="text-caption text-ink-3">Sui testnet · no mainnet, no real funds</p>
    </main>
  );
}
