export const ADAPTIVE_SCALE_VERTEX_DECLARATIONS = /* glsl */ `
attribute float adaptiveScaleSize;
uniform float uAdaptiveScaleEnabled;
uniform float uAdaptiveMetersPerPixel;
uniform float uAdaptiveMinPixels;
uniform float uAdaptiveMaxPixels;

float adaptiveScaleFactorFor( float sizeMeters ) {
  if ( uAdaptiveScaleEnabled < 0.5 ) return 1.0;
  float projectedPixels = max(
    sizeMeters / max( uAdaptiveMetersPerPixel, 0.000001 ),
    0.000001
  );
  float clampedPixels = clamp(
    projectedPixels,
    uAdaptiveMinPixels,
    uAdaptiveMaxPixels
  );
  return clampedPixels / projectedPixels;
}
`;

export const ADAPTIVE_POINT_COLLISION_DECLARATIONS = /* glsl */ `
attribute float adaptiveScaleCap;
uniform float uCollisionAwareEnabled;

float collisionAwareAdaptiveScaleFactorFor( float sizeMeters ) {
  float factor = adaptiveScaleFactorFor( sizeMeters );
  if ( uCollisionAwareEnabled < 0.5 ) return factor;
  return min( factor, max( adaptiveScaleCap, 1.0 ) );
}
`;

export const ADAPTIVE_POINT_BEGIN_VERTEX = /* glsl */ `
#include <begin_vertex>
transformed *= collisionAwareAdaptiveScaleFactorFor( adaptiveScaleSize );
`;

export const ADAPTIVE_AREA_BEGIN_VERTEX = /* glsl */ `
#include <begin_vertex>
transformed.y *= adaptiveScaleFactorFor( adaptiveScaleSize );
`;

export const ADAPTIVE_AREA_BEGIN_NORMAL = /* glsl */ `
#include <beginnormal_vertex>
objectNormal.y /= max(
  adaptiveScaleFactorFor( adaptiveScaleSize ),
  0.000001
);
objectNormal = normalize( objectNormal );
`;
