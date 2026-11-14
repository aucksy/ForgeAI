// Gym tab -> "Message your gym" (owner request 12 Nov 2026; 0069), opened on "The gym". A gym reply's notification opens
// it too (route /shop/message). R-549: the same page also asks a trainer (/shop/ask opens it on "A trainer").
import { GymTalkScreen } from '@/shop/GymTalkScreen';

export default function MessageRoute() {
  return <GymTalkScreen start="gym" />;
}
