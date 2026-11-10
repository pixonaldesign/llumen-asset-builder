/** Shared declarations for post-size instanced world-space bevel deformation. */
export const WORLD_BEVEL_VERTEX_DECLARATIONS = /* glsl */ `
attribute vec3 instanceSize;
attribute float instanceBevelRadius;
`;

/**
 * Replaces Three's `<begin_vertex>` body. RoundedBoxGeometry uses a canonical
 * 0.25 radius; this recovers its inset core and reapplies an isotropic radius
 * after the final per-instance dimensions are known.
 */
export const WORLD_BEVEL_BEGIN_VERTEX = /* glsl */ `
#include <begin_vertex>
{
  const float _templateRadius = 0.25;
  float _adaptiveFactor = collisionAwareAdaptiveScaleFactorFor( adaptiveScaleSize );
  vec3 _halfSize = max(
    instanceSize * _adaptiveFactor * 0.5,
    vec3( 0.0001 )
  );
  float _radius = clamp(
    instanceBevelRadius * _adaptiveFactor,
    0.0,
    min( _halfSize.x, min( _halfSize.y, _halfSize.z ) ) * 0.999
  );
  vec3 _core = position - normal * _templateRadius;
  vec3 _coreScale = max(
    _halfSize - vec3( _radius ),
    vec3( 0.0 )
  ) / _templateRadius;
  transformed = _core * _coreScale + normal * _radius;
  transformed.y += _halfSize.y;
}
`;
