import React from 'react';
import { Composition, Folder, Still } from 'remotion';
import { Film } from './Film';
import { Feed } from './Feed';
import { PROGRESS_ID, Progress } from './Progress';
import { SPECS } from './ads';
import { timing } from './timing';
import { FPS, H, W } from './theme';

export const RemotionRoot: React.FC = () => (
  <>
    {SPECS.map((spec) => (
      <Folder key={spec.id} name={`ad-${spec.id}`}>
        <Composition id={spec.id} component={Film} defaultProps={{ id: spec.id }} durationInFrames={timing(spec.id).total} fps={FPS} width={W} height={H} />
        <Still id={`${spec.id}-1x1`} component={Feed} defaultProps={{ id: spec.id, h: 1080 }} width={1080} height={1080} />
        <Still id={`${spec.id}-4x5`} component={Feed} defaultProps={{ id: spec.id, h: 1350 }} width={1080} height={1350} />
      </Folder>
    ))}
    <Folder name={`ad-${PROGRESS_ID}`}>
      <Composition id={PROGRESS_ID} component={Progress} durationInFrames={timing(PROGRESS_ID).total} fps={FPS} width={W} height={H} />
      <Still id={`${PROGRESS_ID}-1x1`} component={Feed} defaultProps={{ id: PROGRESS_ID, h: 1080 }} width={1080} height={1080} />
      <Still id={`${PROGRESS_ID}-4x5`} component={Feed} defaultProps={{ id: PROGRESS_ID, h: 1350 }} width={1080} height={1350} />
    </Folder>
  </>
);
