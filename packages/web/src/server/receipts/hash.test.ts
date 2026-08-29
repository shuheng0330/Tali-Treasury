import { describe, expect, it } from 'vitest';

import { buildReceiptObjectPath, hashReceipt } from './hash';

describe('hashReceipt', () => {
  it('returns the lowercase SHA-256 digest of the exact bytes', () => {
    expect(hashReceipt(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('changes when the receipt bytes change', () => {
    expect(hashReceipt(Buffer.from('receipt-a'))).not.toBe(
      hashReceipt(Buffer.from('receipt-b')),
    );
  });

  it('rejects an empty receipt', () => {
    expect(() => hashReceipt(Buffer.alloc(0))).toThrow('empty');
  });
});

describe('buildReceiptObjectPath', () => {
  it('scopes the immutable object path to the event', () => {
    expect(
      buildReceiptObjectPath(
        'ba7e50e2-7e7b-4a67-a505-9e3a329739ae',
        'a'.repeat(64),
        'image/png',
      ),
    ).toBe(
      `ba7e50e2-7e7b-4a67-a505-9e3a329739ae/${'a'.repeat(64)}.png`,
    );
  });

  it('uses a different key for the same receipt in a different event', () => {
    const hash = 'a'.repeat(64);

    expect(
      buildReceiptObjectPath('729f4b11-7155-4632-87ff-53c4824ea958', hash, 'image/jpeg'),
    ).not.toBe(
      buildReceiptObjectPath('b80f7d43-f58a-4b14-ac37-bcff96251d28', hash, 'image/jpeg'),
    );
  });

  it('rejects invalid identifiers, hashes, and MIME types', () => {
    expect(() => buildReceiptObjectPath('not-a-uuid', 'a'.repeat(64), 'image/png')).toThrow();
    expect(() =>
      buildReceiptObjectPath('729f4b11-7155-4632-87ff-53c4824ea958', 'abc', 'image/png'),
    ).toThrow();
    expect(() =>
      buildReceiptObjectPath(
        '729f4b11-7155-4632-87ff-53c4824ea958',
        'a'.repeat(64),
        'application/pdf',
      ),
    ).toThrow();
  });
});
