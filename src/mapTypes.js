/**
 * mapTypes.js – Comprehensive texture slot registry for autoMaterial.
 *
 * ORM channel convention (Unreal Engine / Substance Painter standard,
 * exactly matching BabylonJS PBRMaterial metallicTexture channel flags):
 *   R = Ambient Occlusion  → mat.useAmbientOcclusionFromMetallicTextureRed  = true
 *   G = Roughness          → mat.useRoughnessFromMetallicTextureGreen        = true
 *   B = Metallic           → mat.useMetallnessFromMetallicTextureBlue        = true
 *
 * When an ORM texture is found, it supersedes standalone 'roughness',
 * 'metallic', and 'ao' textures.
 *
 * Suffixes are stored UPPERCASE; probing tries both UPPER and lower variants.
 */

export const MAP_FAMILIES = [
  {
    slot: 'albedo',
    desc: 'Base colour / diffuse  →  mat.albedoTexture',
    suffixes: [
      'DIFFUSE', 'ALBEDO', 'COLOR', 'COL', 'BASECOLOR', 'BASE_COLOR',
      'BC', 'DIF', 'ALB', 'DIFF', 'D',
    ],
  },
  {
    slot: 'normal',
    desc: 'Tangent-space normal map (RGB)  →  mat.bumpTexture',
    // BUMP / BUMPMAP / BUMP_MAP are deliberately excluded: those are greyscale
    // height maps, not RGB normal maps, and would look wrong as mat.bumpTexture.
    suffixes: [
      'NORMAL', 'NORMALMAP', 'NORMAL_MAP', 'NRM', 'NOR', 'DDN', 'NM', 'N',
    ],
  },
  {
    slot: 'orm',
    desc: 'Packed ORM: R=AO  G=Roughness  B=Metallic  →  mat.metallicTexture (+channel flags)',
    // "COMBINE" is used by some Blender exporters and older pipelines for a packed PBR map.
    // "ARM"/"MAR"/"AOR"/"MRAO" are alternative name orderings for the same packing.
    suffixes: [
      'ORM', 'ARM', 'COMBINE', 'PACKED', 'METALROUGHAO',
      'AOR', 'MAR', 'MRAO', 'ORMASK',
    ],
  },
  {
    slot: 'roughness',
    desc: 'Standalone roughness (grayscale)  →  mat.metallicTexture (G-channel only)',
    suffixes: ['ROUGHNESS', 'ROUGH', 'RGH'],
  },
  {
    slot: 'metallic',
    desc: 'Standalone metallic / metalness (grayscale)  →  mat.metallicTexture (B-channel only)',
    suffixes: ['METALLIC', 'METALNESS', 'METAL', 'MTL', 'MET'],
  },
  {
    slot: 'ao',
    desc: 'Standalone ambient occlusion  →  mat.ambientTexture',
    suffixes: ['AO', 'AMBIENTOCCLUSION', 'AMBIENT_OCCLUSION', 'OCCLUSION', 'OCC'],
  },
  {
    slot: 'emissive',
    desc: 'Emissive / self-illumination  →  mat.emissiveTexture',
    suffixes: ['EMISSIVE', 'EMISSION', 'EMIT', 'EMI', 'GLOW'],
  },
  {
    slot: 'opacity',
    desc: 'Opacity / alpha mask  →  mat.opacityTexture',
    suffixes: ['OPACITY', 'ALPHA', 'TRANSPARENCY', 'MASK', 'OPAC', 'ALPHAMAP'],
  },
  {
    slot: 'lightmap',
    desc: 'Baked lightmap or shadowmap  →  mat.lightmapTexture',
    suffixes: ['LM', 'LIGHTMAP', 'SHADOWMAP', 'BAKED', 'LIGHT_MAP'],
  },
  {
    slot: 'specular',
    desc: 'Specular reflectance (legacy / gloss workflows)  →  mat.reflectivityTexture',
    suffixes: ['SPECULAR', 'SPEC', 'SPECF', 'SPECMAP', 'GLOSS', 'GLOSSINESS', 'REFLECTIVITY'],
  },
]

/**
 * Pre-built O(1) lookup: SUFFIX_UPPERCASE → slot name.
 * Built once at module-load time.
 */
export const SUFFIX_TO_SLOT = (() => {
  const map = Object.create(null)
  for (const family of MAP_FAMILIES) {
    for (const suffix of family.suffixes) {
      map[suffix] = family.slot  // suffixes already UPPERCASE
    }
  }
  return map
})()

/**
 * Flat ordered list of all suffixes (UPPERCASE) across all families.
 * Used to iterate probe candidates in definition order.
 */
export const ALL_SUFFIXES = MAP_FAMILIES.flatMap(f => f.suffixes)
