// Gameplay tuning constants

// Tank movement
export const TANK_SPEED = 8; // dry cruising speed, units/second
export const TANK_ROTATION_SPEED = 2.5; // radians/second

// Projectile (for Plan 02)
export const PROJECTILE_SPEED = 25; // units/second
export const PROJECTILE_MAX_LIFETIME = 3.0; // seconds

// Roads
export const ROAD_GRID_SPACING = 8; // matches file layout spacing

// Camera
export const CAMERA_OFFSET = [0, 4.2, 6.8] as const; // [x, y, z] behind and above
export const CAMERA_LERP_SPEED = 6; // smoothing factor
