import type { GenerateContentParameters } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';

import { createAnalyzeTimesheetHandler } from '../../app/api/overtime/analyze/route';
import { ServerError } from '../errors';
import type { GeminiModelClient } from '../receipts/gemini';
import {
  createGeminiTimesheetReader,
  createGoogleTimesheetReader,
  timesheetDraftJsonSchema,
  type OvertimeDraft,
  type TimesheetImage,
  type TimesheetReader,
} from './timesheet';

/** 2026-09-05, 11:00 in Kuala Lumpur. */
const NOW = Date.UTC(2026, 8, 5, 3, 0, 0);
const MODEL = 'gemini-test-model';
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const readFailed: OvertimeDraft = {
  workedOn: null,
  kind: null,
  hours: null,
  note: "Couldn't read this timesheet. Enter the details manually.",
  uncertain: [],
};

const modelOutput = {
  workedOn: '2026-09-03',
  kind: 'rest_day',
  hours: '3.5',
  note: 'Read the rest day row for 3 September.',
  uncertain: [],
};

const clientReturning = (text: string | undefined): GeminiModelClient => ({
  generateContent: async () => ({ text }),
});

function readerReturning(output: unknown, now = NOW): TimesheetReader {
  return createGeminiTimesheetReader({
    client: clientReturning(typeof output === 'string' ? output : JSON.stringify(output)),
    model: MODEL,
    now: () => now,
  });
}

function readPng(reader: TimesheetReader): Promise<OvertimeDraft> {
  return reader.read({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' });
}

describe('timesheetDraftJsonSchema', () => {
  it('keeps the day kinds aligned with the shared contract', () => {
    expect(timesheetDraftJsonSchema.properties.kind.anyOf[0].enum).toEqual([
      'normal_day',
      'rest_day',
      'public_holiday',
    ]);
  });

  it('asks for uncertainty by name and never for a score', () => {
    expect(timesheetDraftJsonSchema.properties.uncertain.items.enum).toEqual([
      'workedOn',
      'kind',
      'hours',
    ]);
    expect(Object.keys(timesheetDraftJsonSchema.properties)).not.toContain('confidence');
  });
});

describe('createGeminiTimesheetReader', () => {
  it('submits the image for structured output and returns the draft it validated', async () => {
    let capturedRequest: GenerateContentParameters | undefined;
    const reader = createGeminiTimesheetReader({
      client: {
        generateContent: async (request) => {
          capturedRequest = request;
          return { text: JSON.stringify({ ...modelOutput, hours: '3.50' }) };
        },
      },
      model: MODEL,
      now: () => NOW,
    });

    const draft = await readPng(reader);

    expect(draft).toEqual({
      workedOn: '2026-09-03',
      kind: 'rest_day',
      hours: '3.5',
      note: 'Read the rest day row for 3 September.',
      uncertain: [],
    });
    expect(capturedRequest).toMatchObject({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: expect.stringContaining('Do not invent') },
            { inlineData: { data: 'AQID', mimeType: 'image/png' } },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: expect.objectContaining({ type: 'object' }),
      },
    });
  });

  it('keeps a score the model volunteered out of the draft', async () => {
    const draft = await readPng(
      readerReturning({ ...modelOutput, confidence: 0.42, score: 91 }),
    );

    expect(Object.keys(draft).sort()).toEqual([
      'hours',
      'kind',
      'note',
      'uncertain',
      'workedOn',
    ]);
    expect(JSON.stringify(draft)).not.toContain('confidence');
  });

  const unreadable: [string, string | undefined][] = [
    ['no response at all', undefined],
    ['an empty response', ''],
    ['prose instead of JSON', 'I cannot read this image.'],
    ['a JSON array', '[]'],
    ['fields of the wrong type', JSON.stringify({ workedOn: 5, kind: 2, hours: {} })],
    [
      'nothing it could read',
      JSON.stringify({ workedOn: null, kind: null, hours: null, note: '', uncertain: [] }),
    ],
  ];

  it.each(unreadable)('degrades to a flat sentence for %s', async (_case, text) => {
    const reader = createGeminiTimesheetReader({
      client: clientReturning(text),
      model: MODEL,
      now: () => NOW,
    });

    await expect(readPng(reader)).resolves.toEqual(readFailed);
  });

  it('degrades when the model errors rather than rejecting', async () => {
    const reader = createGeminiTimesheetReader({
      client: {
        generateContent: async () => {
          throw new Error('503 model overloaded');
        },
      },
      model: MODEL,
      now: () => NOW,
    });

    await expect(readPng(reader)).resolves.toEqual(readFailed);
  });

  it.each(['20', '16.25', '0', '-2', 'about four', ''])(
    'empties and highlights hours of %s',
    async (hours) => {
      const draft = await readPng(readerReturning({ ...modelOutput, hours }));

      expect(draft.hours).toBeNull();
      expect(draft.uncertain).toEqual(['hours']);
      expect(draft.workedOn).toBe('2026-09-03');
    },
  );

  it('keeps hours at the per-day ceiling', async () => {
    const draft = await readPng(readerReturning({ ...modelOutput, hours: '16' }));

    expect(draft.hours).toBe('16');
    expect(draft.uncertain).toEqual([]);
  });

  it.each(['2026-09-06', '2027-01-01', '2026-02-30', '3 September', '2026-9-3'])(
    'empties and highlights a date of %s',
    async (workedOn) => {
      const draft = await readPng(readerReturning({ ...modelOutput, workedOn }));

      expect(draft.workedOn).toBeNull();
      expect(draft.uncertain).toEqual(['workedOn']);
      expect(draft.hours).toBe('3.5');
    },
  );

  it('reads the date against the day it is in Kuala Lumpur', async () => {
    const stillYesterdayInUtc = Date.UTC(2026, 8, 5, 23, 30, 0);
    const draft = await readPng(
      readerReturning({ ...modelOutput, workedOn: '2026-09-06' }, stillYesterdayInUtc),
    );

    expect(draft.workedOn).toBe('2026-09-06');
  });

  it('empties a field the model itself flagged', async () => {
    const draft = await readPng(readerReturning({ ...modelOutput, uncertain: ['kind'] }));

    expect(draft.kind).toBeNull();
    expect(draft.uncertain).toEqual(['kind']);
    expect(draft.workedOn).toBe('2026-09-03');
  });

  it.each(['sunday', 'REST_DAY', 'holiday'])('empties a day kind of %s', async (kind) => {
    const draft = await readPng(readerReturning({ ...modelOutput, kind }));

    expect(draft.kind).toBeNull();
    expect(draft.uncertain).toEqual(['kind']);
  });

  it('flattens a rambling note and falls back when there is none', async () => {
    const rambling = await readPng(
      readerReturning({ ...modelOutput, note: `  Two lines\n\n  of note. ${'x'.repeat(300)}` }),
    );
    const missing = await readPng(readerReturning({ ...modelOutput, note: '   ' }));

    expect(rambling.note.length).toBeLessThanOrEqual(200);
    expect(rambling.note).not.toContain('\n');
    expect(rambling.note.startsWith('Two lines of note.')).toBe(true);
    expect(missing.note).toBe('Check these against your timesheet before you submit.');
  });

  const unusableImages: [string, TimesheetImage][] = [
    ['an unsupported type', { bytes: new Uint8Array([1]), mimeType: 'application/pdf' }],
    ['an empty image', { bytes: new Uint8Array(), mimeType: 'image/png' }],
    [
      'an oversized image',
      { bytes: new Uint8Array(10 * 1024 * 1024 + 1), mimeType: 'image/png' },
    ],
  ];

  it.each(unusableImages)('refuses %s without calling the model', async (_case, image) => {
    const generateContent = vi.fn(async () => ({ text: JSON.stringify(modelOutput) }));
    const reader = createGeminiTimesheetReader({
      client: { generateContent },
      model: MODEL,
      now: () => NOW,
    });

    await expect(reader.read(image)).resolves.toEqual(readFailed);
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe('createGoogleTimesheetReader', () => {
  const unconfigured: [string, { apiKey: string; model: string }][] = [
    ['the API key is unset', { apiKey: '   ', model: MODEL }],
    ['the model is unset', { apiKey: 'test-key', model: '  ' }],
  ];

  it.each(unconfigured)('reads to a flat sentence when %s', async (_case, options) => {
    await expect(readPng(createGoogleTimesheetReader(options))).resolves.toEqual(readFailed);
  });
});

const APP_ORIGIN = 'https://tali.example';
const EMPLOYEE = `0x${'a'.repeat(64)}`;
const PNG_BASE64 = Buffer.from(PNG_BYTES).toString('base64');

function analyzeRequest(body: unknown, origin = APP_ORIGIN): Request {
  return new Request('http://localhost/api/overtime/analyze', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function handlerReading(read: (image: TimesheetImage) => Promise<OvertimeDraft>) {
  return createAnalyzeTimesheetHandler({
    read,
    resolveIdentity: async () => EMPLOYEE,
    appOrigin: APP_ORIGIN,
  });
}

describe('POST /api/overtime/analyze', () => {
  it('forwards the decoded image and answers with the draft', async () => {
    const draft: OvertimeDraft = {
      workedOn: '2026-09-03',
      kind: 'rest_day',
      hours: '3.5',
      note: 'Read the rest day row for 3 September.',
      uncertain: [],
    };
    const read = vi.fn(async () => draft);

    const response = await handlerReading(read)(
      analyzeRequest({ imageBase64: PNG_BASE64, mimeType: 'image/png' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ draft });
    expect(read).toHaveBeenCalledWith({ bytes: PNG_BYTES, mimeType: 'image/png' });
  });

  it('accepts the data URL a file picker produces', async () => {
    const read = vi.fn(async () => readFailed);

    const response = await handlerReading(read)(
      analyzeRequest({
        imageBase64: `data:image/png;base64,${PNG_BASE64}`,
        mimeType: 'image/png',
      }),
    );

    expect(response.status).toBe(200);
    expect(read).toHaveBeenCalledWith({ bytes: PNG_BYTES, mimeType: 'image/png' });
  });

  it('answers 200 with the flat sentence when the model could not read it', async () => {
    const response = await handlerReading(async () => readFailed)(
      analyzeRequest({ imageBase64: PNG_BASE64, mimeType: 'image/png' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ draft: readFailed });
  });

  const unusableBodies: [number, unknown][] = [
    [415, { imageBase64: PNG_BASE64, mimeType: 'application/pdf' }],
    [415, { imageBase64: Buffer.from([0xff, 0xd8, 0xff]).toString('base64'), mimeType: 'image/png' }],
    [400, { imageBase64: 'not base64!!', mimeType: 'image/png' }],
    [400, { mimeType: 'image/png' }],
    [400, { imageBase64: '', mimeType: 'image/png' }],
  ];

  it.each(unusableBodies)('refuses an unusable body with %i', async (status, body) => {
    const read = vi.fn(async () => readFailed);

    const response = await handlerReading(read)(analyzeRequest(body));

    expect(response.status).toBe(status);
    expect(read).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON', async () => {
    const response = await handlerReading(async () => readFailed)(analyzeRequest('not json'));

    expect(response.status).toBe(400);
  });

  it('refuses another origin before reading the body', async () => {
    const read = vi.fn(async () => readFailed);

    const response = await handlerReading(read)(
      analyzeRequest(
        { imageBase64: PNG_BASE64, mimeType: 'image/png' },
        'https://evil.example',
      ),
    );

    expect(response.status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });

  it('refuses a request without a wallet session', async () => {
    const read = vi.fn(async () => readFailed);
    const handle = createAnalyzeTimesheetHandler({
      read,
      resolveIdentity: async () => {
        throw new ServerError(
          'authentication_required',
          401,
          'A valid wallet session is required',
        );
      },
      appOrigin: APP_ORIGIN,
    });

    const response = await handle(
      analyzeRequest({ imageBase64: PNG_BASE64, mimeType: 'image/png' }),
    );

    expect(response.status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });
});
