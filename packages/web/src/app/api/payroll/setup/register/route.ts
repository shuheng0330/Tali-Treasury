// Compatibility alias for the setup UI. Registration has one canonical handler
// so both paths enforce the same authorization, verification and persistence rules.
import { POST as registerPayroll } from '../../register/route';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  return registerPayroll(request);
}
