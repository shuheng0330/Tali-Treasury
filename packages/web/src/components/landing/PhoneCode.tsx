'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Rendered light-on-white in both themes. Scanners cope badly with inverted
 *  codes, and a projector in a dark room is exactly where this gets scanned. */
export function PhoneCode({ path = '/claim' }: { path?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [href, setHref] = useState(path);

  useEffect(() => {
    const url = new URL(path, window.location.origin).toString();
    setHref(url);

    QRCode.toString(url, {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#101519', light: '#FFFFFF' },
    })
      .then(setSvg)
      .catch(() => setSvg(null));
  }, [path]);

  return (
    <div className="flex items-center gap-4">
      <div className="h-32 w-32 shrink-0 rounded-control bg-white p-2.5">
        {svg ? (
          <div
            className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
            aria-hidden
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="h-full w-full rounded-sm bg-neutral-100" aria-hidden />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-subhead">Try it on your own phone</span>
        <span className="text-caption text-ink-3">
          Scan to open the member flow. Photograph any receipt — no wallet needed to look
          around.
        </span>
        <a
          href={href}
          className="w-fit break-all font-mono text-caption text-accent underline underline-offset-4"
        >
          {href}
        </a>
      </div>
    </div>
  );
}
