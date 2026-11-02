/**
 * F20: the start and end positions of a library exercise, side by side at the top of its page.
 *
 * Pictures: RepDB free edition (catalog/pictures.ts, credited in Settings → About → Credits),
 * recoloured to the app's dark theme (R-280). A hold (plank) has one picture: one pane, "Hold".
 * Exercises without a matched picture render nothing, so their page looks exactly as before.
 * The member's own photo or video wins (nothing is shown then), as for the demo clip. An
 * exercise with an owner-approved moving clip shows the clip instead; these pictures are then
 * only its stand-in when the clip cannot be had (pass `asFallback`).
 */
import { Image, Text, View } from 'react-native';

import { color, radius, space, type } from '@/theme/tokens';

import { pictureChoice } from '../catalog/pictureChoice';

export function ExercisePictures({
  catalogKey,
  name,
  hidden = false,
  asFallback = false,
  marginBottom = 0,
}: {
  catalogKey: string | null | undefined;
  name: string;
  /** The member's own photo or video wins: nothing is shown then. */
  hidden?: boolean;
  /** Shown as the demo clip's stand-in (the clip could not be had). */
  asFallback?: boolean;
  /** Room under the pictures (none when nothing is shown, so the page is as before). */
  marginBottom?: number;
}) {
  const pictures = pictureChoice(catalogKey, { hidden, asFallback });
  if (!pictures) return null;
  const panes = pictures.end
    ? [
        { source: pictures.start, label: 'Start' /* member-words */, a11y: `Start position of ${name}` /* member-words */ },
        { source: pictures.end, label: 'End' /* member-words */, a11y: `End position of ${name}` /* member-words */ },
      ]
    : [{ source: pictures.start, label: 'Hold' /* member-words */, a11y: `Hold position of ${name}` /* member-words */ }];
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.sm, marginBottom }} testID="exercise-pictures">
      {panes.map((p) => (
        // One picture (a hold) keeps the size of one of the pair, centred.
        <View key={p.label} style={panes.length > 1 ? { flex: 1, gap: space.xs } : { width: '50%', gap: space.xs }}>
          <View
            style={{
              aspectRatio: 1,
              borderRadius: radius.md,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: color.border,
              // R-280: the drawings are recoloured onto color.surface, so the frame matches them edge to edge.
              backgroundColor: color.surface,
            }}
            accessible
            accessibilityRole="image"
            accessibilityLabel={p.a11y}
          >
            <Image source={p.source} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          </View>
          <Text
            style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted, textAlign: 'center' }}
            importantForAccessibility="no"
          >
            {p.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
