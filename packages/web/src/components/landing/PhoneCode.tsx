'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Rendered light-on-white in both themes. Scanners cope badly with inverted
 *  codes, and a projector in a dark room is exactly where this gets scanned. */
export function PhoneCode({ path = '/requests/expense' }: { path?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [href, setHref] = useState(path);

  useEffect(() => {
    let live = true;
    const url = new URL(path, window.location.origin).toString();
    setHref(url);

    QRCode.toString(url, {
      type: 'svg',
      // The spec wants four clear modules around the symbol; without them
      // scanners get unreliable, which is the whole point of this thing.
      margin: 4,
      errorCorrectionLevel: 'M',
    })
      .then((result) => {
        if (live) setSvg(result);
      })
      .catch(() => {
        if (live) setSvg(null);
      });

    return () => {
      live = false;
    };
  }, [path]);

  return (
    <div className="flex items-center gap-4">
      <div className="h-36 w-36 shrink-0 rounded-card bg-surface p-3">
        {svg ? (
          <div
            className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
            aria-hidden
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="h-full w-full rounded-card bg-raised" aria-hidden />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-display text-subhead">Try it on your own phone</span>
        <span className="text-caption text-ink-3">
          Scan to open the member flow. Photograph any receipt — no wallet needed to look
          around.
        </span>
        <a
          href={href}
          className="link w-fit break-all font-mono text-caption"
        >
          {href}
        </a>
      </div>
    </div>
  );
}
