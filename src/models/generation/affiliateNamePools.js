// Flavor name generation for the 200 minor-league affiliate clubs (50
// parent clubs x 4 levels) — minor-leagues.md's "mixed grounded to
// gloriously absurd, Rocket City Trash Pandas / Montgomery Biscuits
// energy" naming tone, contrasted deliberately against the majors staying
// grounded. City/nickname pairs are drawn independently per club and don't
// correspond to real geography or the 50 real MLB cities (models/seed/
// leagueSeed.js) — a placeholder, same status as that doc's own unrun
// market-size population algorithm.

import { ROOKIE_REGIONAL_HUBS } from '../constants.js';

export const AFFILIATE_CITY_POOL = Object.freeze([
  'Springhaven', 'Millbrook', 'Cedar Falls', 'Redstone', 'Pinehurst', 'Ashford',
  'Ridgeview', 'Elm Grove', 'Harborview', 'Stonebridge', 'Fairhaven', 'Ironwood',
  'Brookfield', 'Silver Creek', 'Maple Ridge', 'Sunset Valley', 'Westfield',
  'Eastport', 'Northgate', 'Southlake', 'Rockford Springs', 'Lakeview',
  'Riverside Heights', 'Copper Hill', 'Golden Valley', 'Cross Timbers',
  'Bluewater', 'Willow Creek', 'Amber Falls', 'Granite Bend', 'Foxhollow',
  'Meadowbrook', 'Prairie City', 'Timber Falls', 'Highlands Junction',
  'Blackstone', 'Colton Mills', 'Piedmont Flats', 'Deer Park', 'Sable Hollow',
]);

export const AFFILIATE_NICKNAME_POOL = Object.freeze([
  // Grounded half — plain, local-industry-flavored, matching the majors' tone.
  'Anchors', 'Miners', 'Foresters', 'Ironhorses', 'Rail Splitters', 'Millhands',
  'Harvesters', 'Timberwolves', 'Quarrymen', 'Wranglers', 'Drillers', 'Loggers',
  'Tanners', 'Smelters', 'Coopers', 'Wildcats', 'Rangers', 'Pioneers', 'Ridgerunners',
  // Wacky half — real-MiLB-style gloriously absurd.
  'Biscuits', 'Mudcats', 'Yard Goats', 'Rubber Ducks', 'Trash Pandas', 'Sod Poodles',
  'Fried Pickles', 'Flying Squirrels', 'Baby Cakes', 'Hot Rods', 'Space Cowboys',
  'Rumble Ponies', 'Chihuahuas', 'Isotopes', 'Mud Hens', 'Sea Dogs', 'Jumbo Shrimp',
]);

/**
 * Round-robin assignment of the 50 parent clubs across rookie-league.md's
 * four regional hubs — exact per-club geography is an open follow-up task
 * in that doc, so an even round-robin is a fine placeholder.
 * @param {number} parentIndex - 0-based index of the parent club, stable
 *   iteration order across the 50 teams.
 * @returns {string} one of ROOKIE_REGIONAL_HUBS
 */
export function assignRegionalHub(parentIndex) {
  return ROOKIE_REGIONAL_HUBS[parentIndex % ROOKIE_REGIONAL_HUBS.length];
}
