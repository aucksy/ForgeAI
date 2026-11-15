/**
 * R-572 (owner, 15 Nov 2026, option A): the member's own photo or video on the New exercise / Edit
 * exercise form. Nothing yet: one card "Add photo or video" with a round +; a tap opens a sheet with three
 * big rows (gallery, photo, video) and Cancel. Once set: the picture, "Change" (the same sheet) and
 * "Remove". Every tap area stays inside the card's own margin, clear of the feedback tab on the edge.
 */
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { GhostButton, Icon, Sheet } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';

import { Glyph } from '@/tracker/components/TrackerGlyph';
import type { PickedMedia } from '@/tracker/services/exerciseMedia';

import { mediaWords } from './formChoices';

type Words = ReturnType<typeof mediaWords>;

export function MediaCard({
  media,
  busy,
  words,
  onOpen,
  onRemove,
}: {
  media: PickedMedia | null;
  busy: boolean;
  words: Words;
  onOpen: () => void;
  onRemove: () => void;
}) {
  if (!media) {
    return (
      <View
        style={{
          borderRadius: radius.lg,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: color.borderStrong,
          backgroundColor: color.surfaceSunken,
          padding: space.sm,
          opacity: busy ? 0.6 : 1,
        }}
      >
        <Pressable
          testID="exercise-media-add"
          onPress={busy ? undefined : onOpen}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          accessibilityLabel={busy ? words.busy : `${words.add}. ${words.addLine}`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            padding: space.sm,
            borderRadius: radius.md,
            backgroundColor: pressed ? color.surface : 'transparent',
          })}
        >
          <View style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name="image" size={26} color={color.accent} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontFamily: type.bodyBold, fontSize: type.size.body, color: color.ink }}>{words.add}</Text>
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 18, color: color.inkMuted }}>
              {busy ? words.busy : words.addLine}
            </Text>
          </View>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: color.accent,
              backgroundColor: color.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="plus" size={20} color={color.accent} />
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.border,
        backgroundColor: color.surface,
        padding: space.md,
        opacity: busy ? 0.6 : 1,
      }}
    >
      {media.type === 'image' ? (
        <Image source={{ uri: media.uri }} style={{ width: 72, height: 72, borderRadius: radius.md }} contentFit="cover" />
      ) : (
        <View style={{ width: 72, height: 72, borderRadius: radius.md, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Glyph name="play" size={28} color={color.accent} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: type.bodyBold, fontSize: type.size.body, color: color.ink }}>{media.type === 'video' ? 'Your video' : 'Your photo'}</Text>
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>{busy ? words.busy : words.setLine}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl }}>
          <TextButton testID="exercise-media-change" label={words.change} spoken="Change photo or video" tone={color.accent} disabled={busy} onPress={onOpen} />
          <TextButton testID="exercise-media-remove" label={words.remove} spoken="Remove photo or video" tone={color.criticalText} disabled={busy} onPress={onRemove} />
        </View>
      </View>
    </View>
  );
}

function TextButton({
  testID,
  label,
  spoken,
  tone,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  spoken: string;
  tone: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      style={{ minHeight: 44, justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: tone }}>{label}</Text>
    </Pressable>
  );
}

export type MediaFrom = 'gallery' | 'photo' | 'video';

/** Gallery, photo or video, then Cancel. The caller closes it and opens the camera or the gallery. */
export function MediaSheet({
  visible,
  hasMedia,
  words,
  onPick,
  onClose,
}: {
  visible: boolean;
  hasMedia: boolean;
  words: Words;
  onPick: (from: MediaFrom) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible={visible}
      title={hasMedia ? words.changeTitle : words.sheetTitle}
      onClose={onClose}
      footer={<GhostButton label={words.cancel} onPress={onClose} />}
    >
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 19, color: color.inkSecondary }}>{words.sheetLine}</Text>
      <View style={{ gap: space.sm }}>
        <MediaOption
          from="gallery"
          title={words.gallery}
          line={words.galleryLine}
          icon={<Glyph name="image" size={20} color={color.accent} />}
          onPick={onPick}
        />
        <MediaOption from="photo" title={words.photo} line={words.photoLine} icon={<Icon name="camera" size={20} color={color.accent} />} onPick={onPick} />
        <MediaOption from="video" title={words.video} line={words.videoLine} icon={<Icon name="video" size={20} color={color.accent} />} onPick={onPick} />
      </View>
    </Sheet>
  );
}

function MediaOption({
  from,
  title,
  line,
  icon,
  onPick,
}: {
  from: MediaFrom;
  title: string;
  line: string;
  icon: ReactNode;
  onPick: (from: MediaFrom) => void;
}) {
  return (
    <Pressable
      testID={`exercise-media-${from}`}
      onPress={() => onPick(from)}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: 64,
        paddingVertical: space.md,
        paddingHorizontal: space.lg,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.border,
        backgroundColor: pressed ? color.surfaceSunken : color.surface,
      })}
    >
      <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: type.bodyBold, fontSize: type.size.body, color: color.ink }}>{title}</Text>
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>{line}</Text>
      </View>
    </Pressable>
  );
}
