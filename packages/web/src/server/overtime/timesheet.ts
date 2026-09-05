import { GoogleGenAI } from '@google/genai';
import {
  OVERTIME_KIND_LABEL,
  fromCentihours,
  toCentihours,
  type OvertimeKind,
} from '@tali/shared';
import { z } from 'zod';

import type { GeminiModelClient } from '../receipts/gemini';
import { isReceiptMimeType, MAX_RECEIPT_IMAGE_BYTES } from '../receipts/hash';

export interface TimesheetImage {
  bytes: Uint8Array;
  mimeType: string;
}

/**
 * What the model read, before a human has agreed with any of it.
 *
 * Never a claim and never a decision: the employee confirms or corrects every
 * field, the server computes the pay from `overtimePay` once the claim is
 * submitted, and nothing here is worth anything until both have happened.
 */
export interface OvertimeDraft {
  workedOn: string | null;
  kind: OvertimeKind | null;
  hours: string | null;
  /** One plain sentence to the employee. Never a score. */
  note: string;
  /** Field names to highlight for a second look. */
  uncertain: string[];
}

export interface TimesheetReader {
  read(image: TimesheetImage): Promise<OvertimeDraft>;
}

/** The same ceiling a receipt photo gets. One camera, one limit. */
export const MAX_TIMESHEET_IMAGE_BYTES = MAX_RECEIPT_IMAGE_BYTES;

const DRAFT_FIELDS = ['workedOn', 'kind', 'hours'] as const;

type DraftField = (typeof DRAFT_FIELDS)[number];

const OVERTIME_KINDS = Object.keys(OVERTIME_KIND_LABEL) as OvertimeKind[];

/** The per-day ceiling `checkOvertimeClaim` blocks a submission on. */
const MAX_CENTIHOURS = 1_600n;

const READ_FAILED_NOTE = "Couldn't read this timesheet. Enter the details manually.";
const CONFIRM_NOTE = 'Check these against your timesheet before you submit.';
const MAX_NOTE_LENGTH = 200;

const nullableString = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
} as const;

export const timesheetDraftJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    workedOn: {
      ...nullableString,
      description: 'The day worked, in YYYY-MM-DD format, or null when unclear.',
    },
    kind: {
      anyOf: [{ type: 'string', enum: OVERTIME_KINDS }, { type: 'null' }],
      description: 'What the sheet says the day was, or null when it does not say.',
    },
    hours: {
      ...nullableString,
      description:
        'Overtime hours beyond the normal working day, decimal with at most two places, or null.',
    },
    note: {
      type: 'string',
      maxLength: MAX_NOTE_LENGTH,
    },
    uncertain: {
      type: 'array',
      uniqueItems: true,
      maxItems: DRAFT_FIELDS.length,
      items: { type: 'string', enum: DRAFT_FIELDS },
    },
  },
  required: ['workedOn', 'kind', 'hours', 'note', 'uncertain'],
} as const;

const TIMESHEET_PROMPT = `Read this timesheet, roster, or clock-in export into the
required JSON structure. Report one day only: the most recent day whose row shows
overtime, and say in note which day you took when the sheet holds several.

Hours are the overtime worked beyond the normal eight-hour working day, not the
length of the shift. Where the sheet shows only a clock-in and a clock-out,
subtract the normal working day and any unpaid break; where it does not show
enough to do that, leave hours null.

Use rest_day or public_holiday only where the sheet says so in words. The weekly
rest day differs by state, so never infer one from the day of the week.

Do not invent a value. Use null for anything unclear and name that field in
uncertain. Write note as one plain sentence to the employee about what the sheet
shows.`;

const modelDraftSchema = z.object({
  workedOn: z.string().nullish(),
  kind: z.string().nullish(),
  hours: z.union([z.string(), z.number()]).nullish(),
  note: z.string().nullish(),
  uncertain: z.array(z.string()).nullish(),
});

/**
 * Today in Kuala Lumpur, not today in UTC.
 *
 * An employee photographing last night's sheet at seven in the morning is still
 * on the previous UTC day, and the hours they actually worked would come back
 * emptied for being in the future.
 */
function todayInMalaysia(nowMs: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(
    new Date(nowMs),
  );
}

function readWorkedOn(value: string, todayIso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  return iso > todayIso ? null : iso;
}

function readHours(value: string): string | null {
  let centihours: bigint;
  try {
    centihours = toCentihours(value);
  } catch {
    return null;
  }
  if (centihours <= 0n || centihours > MAX_CENTIHOURS) return null;
  return fromCentihours(centihours);
}

function readKind(value: string): OvertimeKind | null {
  const kind = value.trim() as OvertimeKind;
  return OVERTIME_KINDS.includes(kind) ? kind : null;
}

function readNote(value: string | null | undefined): string | null {
  const note = value?.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_LENGTH).trim();
  return note ? note : null;
}

/**
 * Nothing read at all: the flat sentence and empty fields, as DESIGN.md has it.
 *
 * No field is highlighted here. Highlighting all three when none of them was
 * read says the same thing three times over a sentence that already said it.
 */
function failedDraft(): OvertimeDraft {
  return {
    workedOn: null,
    kind: null,
    hours: null,
    note: READ_FAILED_NOTE,
    uncertain: [],
  };
}

/**
 * A field the model flagged is dropped rather than shown flagged.
 *
 * A wrong date the employee has to notice is worse than an empty one they have
 * to fill, and this is the only screen in the flow where a machine gets to put
 * a number in front of a person.
 */
function toDraft(fields: z.infer<typeof modelDraftSchema>, todayIso: string): OvertimeDraft {
  const flagged = new Set(fields.uncertain ?? []);
  const read = <T>(field: DraftField, raw: unknown, parse: (value: string) => T | null) =>
    flagged.has(field) || typeof raw !== 'string' ? null : parse(raw);

  const workedOn = read('workedOn', fields.workedOn, (value) =>
    readWorkedOn(value, todayIso),
  );
  const kind = read('kind', fields.kind, readKind);
  const hours = read(
    'hours',
    typeof fields.hours === 'number' ? String(fields.hours) : fields.hours,
    readHours,
  );

  if (workedOn === null && kind === null && hours === null) return failedDraft();

  const uncertain: string[] = [];
  if (workedOn === null) uncertain.push('workedOn');
  if (kind === null) uncertain.push('kind');
  if (hours === null) uncertain.push('hours');

  return {
    workedOn,
    kind,
    hours,
    note: readNote(fields.note) ?? CONFIRM_NOTE,
    uncertain,
  };
}

function parseTimesheetResponse(text: string | undefined, todayIso: string): OvertimeDraft {
  if (!text?.trim()) return failedDraft();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return failedDraft();
  }

  const fields = modelDraftSchema.safeParse(parsed);
  return fields.success ? toDraft(fields.data, todayIso) : failedDraft();
}

function isReadableImage(image: TimesheetImage): boolean {
  return (
    isReceiptMimeType(image.mimeType) &&
    image.bytes.byteLength > 0 &&
    image.bytes.byteLength <= MAX_TIMESHEET_IMAGE_BYTES
  );
}

/**
 * `read` resolves whatever happens to the model.
 *
 * One that is down, refusing, or answering in prose leaves the employee typing
 * three fields they already know. It must never leave them on an error screen
 * holding a photograph of hours they worked.
 */
export function createGeminiTimesheetReader(options: {
  client: GeminiModelClient;
  model: string;
  now?: () => number;
}): TimesheetReader {
  const model = options.model.trim();

  return {
    async read(image): Promise<OvertimeDraft> {
      if (!model || !isReadableImage(image)) return failedDraft();

      try {
        const response = await options.client.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                { text: TIMESHEET_PROMPT },
                {
                  inlineData: {
                    data: Buffer.from(image.bytes).toString('base64'),
                    mimeType: image.mimeType,
                  },
                },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: timesheetDraftJsonSchema,
          },
        });

        return parseTimesheetResponse(
          response.text,
          todayInMalaysia(options.now?.() ?? Date.now()),
        );
      } catch {
        return failedDraft();
      }
    },
  };
}

function unavailableTimesheetReader(): TimesheetReader {
  return { read: async () => failedDraft() };
}

export function createGoogleTimesheetReader(options: {
  apiKey: string;
  model: string;
  now?: () => number;
}): TimesheetReader {
  const apiKey = options.apiKey.trim();
  const model = options.model.trim();
  if (!apiKey || !model) return unavailableTimesheetReader();

  let client: GoogleGenAI;
  try {
    client = new GoogleGenAI({ apiKey });
  } catch {
    return unavailableTimesheetReader();
  }

  return createGeminiTimesheetReader({
    client: { generateContent: (request) => client.models.generateContent(request) },
    model,
    now: options.now,
  });
}

let reader: TimesheetReader | undefined;

export function getTimesheetReader(): TimesheetReader {
  reader ??= createGoogleTimesheetReader({
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
  });
  return reader;
}
