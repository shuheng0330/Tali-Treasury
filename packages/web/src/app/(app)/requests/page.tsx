import { redirect } from 'next/navigation';

/**
 * The section opens on the screen its sub-navigation already leads with.
 *
 * A hub page listing the three kinds of request would be a menu whose every
 * entry is one tap away in the strip above it, charging a tap to say what the
 * strip says.
 */
export default function RequestsPage() {
  redirect('/requests/expense');
}
