/**
 * F148: "Watch your trainer" on the exercise page, when the member's gym trainer gave this exercise a video
 * link (in a workout plan or today's workout of the day). Opens the link in YouTube (or the browser). Draws
 * nothing when there is none, so the page is exactly as before. The link is checked again at the tap: only an
 * https YouTube link is ever opened (shop/trainerVideo.ts).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { tell } from '@/lib/tell';
import { videoUrlOk, type TrainerVideo } from '@/shop/trainerVideo';
import { color, radius, space, type } from '@/theme/tokens';

import { trainerVideoFor } from '../services/trainerVideos';

export function TrainerVideoLink({ catalogKey, name, marginBottom = 0 }: { catalogKey: string | null; name: string; marginBottom?: number }) {
  const [video, setVideo] = useState<TrainerVideo | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void trainerVideoFor({ catalogKey, name }).then((v) => {
        if (alive) setVideo(v);
      });
      return () => {
        alive = false;
      };
    }, [catalogKey, name]),
  );

  if (!video) return null;

  const open = (): void => {
    if (!videoUrlOk(video.url)) {
      console.warn('[ForgeErr] trainer video: a link that is not YouTube was not opened');
      return;
    }
    Linking.openURL(video.url).catch((e: unknown) => {
      console.warn('[ForgeErr] trainer video: could not open the link', e);
      void tell('Couldn’t open the video', 'Check your internet, then try again.');
    });
  };

  return (
    <Pressable
      onPress={open}
      accessibilityRole="link"
      accessibilityLabel={`Watch your trainer do ${name}. Opens YouTube`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: 56,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        marginBottom,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.border,
        backgroundColor: color.surface,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name="video" size={22} color={color.accent} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}>Watch your trainer</Text>
        <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>
          {video.byName ? `A video from ${video.byName} on YouTube` : 'A video from your gym on YouTube'}
        </Text>
      </View>
      <Icon name="chevron-right" size={18} color={color.inkMuted} />
    </Pressable>
  );
}
