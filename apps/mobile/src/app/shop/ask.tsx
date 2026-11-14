// R-319: "Ask about your workout"; since R-549 (14 Nov 2026) one "Message your gym" page, opened on "A trainer" (when the
// member may ask today, else "The gym"). A trainer's reply notification opens this address (deploy/hq/push.js ASK_ROUTE),
// and so does Settings -> What my gym can see; both keep working.
import { GymTalkScreen } from '@/shop/GymTalkScreen';

export default function AskRoute() {
  return <GymTalkScreen start="trainer" />;
}
