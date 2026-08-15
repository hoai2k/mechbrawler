// Barrel: the 19 mech designs, one file each in ./designs/.
import { titanus } from './designs/titanus.js';
import { vulcan } from './designs/vulcan.js';
import { viper } from './designs/viper.js';
import { rhino } from './designs/rhino.js';
import { tempest } from './designs/tempest.js';
import { fenrir } from './designs/fenrir.js';
import { colossus } from './designs/colossus.js';
import { wraith } from './designs/wraith.js';
import { inferno } from './designs/inferno.js';
import { glacier } from './designs/glacier.js';
import { cranky } from './designs/cranky.js';
import { saurion } from './designs/saurion.js';
import { frogger } from './designs/frogger.js';
import { jerry } from './designs/jerry.js';
import { nullbot, nullbotGlbDress } from './designs/nullbot.js';
import { konga } from './designs/konga.js';
import { tritone } from './designs/tritone.js';

export const DESIGNS = {
  titanus, vulcan, viper, rhino,
  tempest, fenrir, colossus, wraith, inferno, glacier,
  cranky, saurion, frogger, jerry, nullbot,
  konga, tritone,
};

// Per-mech dressing applied on top of manifest GLB models (glow shards,
// signature lights — anything the baked model texture can't carry).
export const GLB_DRESS = { nullbot: nullbotGlbDress };
