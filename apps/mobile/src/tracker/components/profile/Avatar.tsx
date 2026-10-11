/**
 * Redesign R2 — the member's round photo, or the first letter of the name when there is none (or
 * the file is gone: a backup restored on another phone keeps only the path). Decorative to a
 * screen reader: the name next to it says who it is.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { color, type } from '@/theme/tokens';

/** "A" for "Aakash Pahuja"; "?" for no name. PURE. */
export function initialOf(name: string | null | undefined): string {
  const t = (name ?? '').trim();
  return t ? t[0].toUpperCase() : '?';
}

export function Avatar({ uri, name, size = 88 }: { uri: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => setFailed(null), [uri]);
  const shown = uri && failed !== uri ? uri : null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: color.surfaceRaised,
        borderWidth: 1,
        borderColor: color.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {shown ? (
        <Image
          source={{ uri: shown }}
          style={{ width: size, height: size }}
          contentFit="cover"
          cachePolicy="memory"
          onError={() => setFailed(shown)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text
          maxFontSizeMultiplier={1}
          style={{ fontFamily: type.display, fontSize: Math.round(size * 0.4), color: color.accent }}
        >
          {initialOf(name)}
        </Text>
      )}
    </View>
  );
}
