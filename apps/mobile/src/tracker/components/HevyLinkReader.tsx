/**
 * v0.29.0 — opens a Hevy share page in a hidden in-app browser and reads its routines off the
 * screen (`routineLink.READ_PAGE_JS`). Nothing is shown; the page asks for English so the words
 * ("3 sets · 9-12 reps", "Rest 3m 0s") are the ones the reader knows. No Hevy account or key.
 */
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

import { parsePageMessage, READ_PAGE_JS, type PageRead } from '../services/routineLink';

/** A slow phone or network gets this long; the page script itself gives up after 20 s. */
const GIVE_UP_MS = 35_000;

export function HevyLinkReader({ url, onRead }: { url: string; onRead: (read: PageRead | null) => void }) {
  const done = useRef(false);
  const finish = (r: PageRead | null): void => {
    if (done.current) return;
    done.current = true;
    onRead(r);
  };

  useEffect(() => {
    const t = setTimeout(() => finish({ nodes: [], expected: 0, notFound: false, timedOut: true }), GIVE_UP_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <WebView
        source={{ uri: url, headers: { 'Accept-Language': 'en-US,en;q=0.9' } }}
        injectedJavaScript={READ_PAGE_JS}
        onMessage={(e) => finish(parsePageMessage(e.nativeEvent.data))}
        onError={() => finish(null)}
        onHttpError={(e) => finish(e.nativeEvent.statusCode === 404 ? { nodes: [], expected: 0, notFound: true, timedOut: false } : null)}
        // Only the share page itself: no app links, pop-ups or downloads.
        onShouldStartLoadWithRequest={(req) => /^https:\/\/(www\.)?hevy\.com\//.test(req.url) || req.url.startsWith('about:')}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        mediaPlaybackRequiresUserAction
        cacheEnabled={false}
        incognito
        style={{ width: 360, height: 640 }}
      />
    </View>
  );
}
