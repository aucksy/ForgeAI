/**
 * A product's picture (S2): the gym's own photo when it has one, else our drawing (ProductArt).
 * The photo fills the same rounded box as the drawing (cover fit), on the drawing's neutral tile
 * while it loads; if it cannot load (no internet, a removed file), the drawing takes its place.
 * Decorative, like the drawing: the product's name is always written next to it.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';

import { color, radius } from '@/theme/tokens';

import { ProductArt, type ProductArtProps } from './ProductArt';

export interface ProductPictureProps extends ProductArtProps {
  /** The photo's https link (Product.imageUrl); absent = the drawing. */
  imageUrl?: string;
}

export function ProductPicture({ imageUrl, ...art }: ProductPictureProps) {
  // Keyed by the link, so a new photo gets a fresh try after an old one failed.
  return imageUrl ? <Photo key={imageUrl} imageUrl={imageUrl} {...art} /> : <ProductArt {...art} />;
}

function Photo({ imageUrl, ...art }: ProductArtProps & { imageUrl: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <ProductArt {...art} />;
  const h = art.height ?? art.size;
  const tile = art.tile ?? true;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: art.size,
        height: h,
        borderRadius: tile ? radius.md : 0,
        overflow: 'hidden',
        backgroundColor: color.surfaceRaised,
      }}
    >
      <Image
        source={{ uri: imageUrl }}
        style={{ width: art.size, height: h }}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
        accessible={false}
        onError={() => setFailed(true)}
      />
    </View>
  );
}
