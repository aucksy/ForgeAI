import {Config} from '@remotion/cli/config';

// Render settings tuned for this Windows box (see colorcloset-reel notes):
//  - concurrency 1: the machine has very little free RAM; the default 4x makes
//    headless Chrome OOM mid-render.
//  - angle GL: the default OpenGL renderer times out headless on this box.
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setConcurrency(1);
Config.setChromiumOpenGlRenderer('angle');
