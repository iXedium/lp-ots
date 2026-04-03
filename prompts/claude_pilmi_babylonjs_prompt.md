# Claude Prompt: Implement PILMI Lightmapping for Babylon.js Scene

## Context for Claude

You are implementing a **Per-Instance Lightmap Indexing (PILMI)** system inside an existing
Babylon.js project. The project already loads a set of `.glb` files and inserts their meshes
into the scene. You are extending it to support unique, baked per-instance lighting while
keeping Babylon.js GPU instancing (`InstancedMesh`) active, meaning a single draw call per
unique mesh type.

**Do not rebuild the existing scene loading code.** Extend it with the PILMI system described
below.

---

## Asset Files

| File | Location | Purpose |
|---|---|---|
| `deli-int-shelves.glb` | `public/models/` | Master meshes. Each mesh has UV1 (diffuse) and UV2 (lightmap, normalized 0–1 per tile) |
| `deli-int-shelves_ao.png` | `public/textures/` | Ambient Occlusion map — 8-bit, shared atlas |
| `deli-int-shelves_lm.png` | `public/textures/` | Baked lightmap atlas — 8-bit combined lighting |
| `lightmap_data.json` | `public/json/` | Per-instance UV atlas coordinates (see structure below) |

---

## JSON Structure

`lightmap_data.json` maps every **Blender object name** to its rectangle in the lightmap atlas.
The keys will match the `.name` property of `InstancedMesh` objects created from the GLB.

```json
{
  "shelf-narrow_01": {
    "offset": [0.003865, 0.94981],
    "scale":  [0.13049,  0.04388]
  },
  "shelf-large_01": {
    "offset": [0.47631, 0.38996],
    "scale":  [0.24191, 0.08595]
  },
  "centre-piece": {
    "offset": [0.00491, 0.38933],
    "scale":  [0.47202, 0.46933]
  }
}
```

- `offset[0]` = U start of this instance's atlas tile (0–1)
- `offset[1]` = V start of this instance's atlas tile (0–1)
- `scale[0]`  = width of this instance's atlas tile (0–1)
- `scale[1]`  = height of this instance's atlas tile (0–1)

The UV transform in the shader is:
```
lightmapUV = uv2 * vec2(scale.x, scale.y) + vec2(offset.x, offset.y)
```

---

## Implementation Requirements

### 1. Loading

Load all three assets in parallel using `Promise.all`:

```ts
const [result, lmTexture, aoTexture, lmData] = await Promise.all([
  BABYLON.SceneLoader.ImportMeshAsync("", "public/models/", "deli-int-shelves.glb", scene),
  new Promise<BABYLON.Texture>(resolve => {
    const t = new BABYLON.Texture("public/textures/deli-int-shelves_lm.png", scene);
    t.coordinatesIndex = 1; // use UV2
    t.onLoadObservable.addOnce(() => resolve(t));
  }),
  new Promise<BABYLON.Texture>(resolve => {
    const t = new BABYLON.Texture("public/textures/deli-int-shelves_ao.png", scene);
    t.coordinatesIndex = 1; // use UV2
    t.onLoadObservable.addOnce(() => resolve(t));
  }),
  fetch("public/json/lightmap_data.json").then(r => r.json())
]);
```

### 2. Per-Instance Buffer Registration

For every root mesh loaded from the GLB, register a `Vector4` instanced buffer to carry
the per-instance lightmap atlas transform `(scaleX, scaleY, offsetX, offsetY)`:

```ts
mesh.registerInstancedBuffer("lmScaleOffset", 4); // vec4
// Default value (entire atlas = identity transform):
mesh.instancedBuffers.lmScaleOffset = new BABYLON.Vector4(1, 1, 0, 0);
```

Register the buffer **before** creating any instances. Then for each instance, look up its
name in `lmData` and assign:

```ts
const entry = lmData[instance.name];
if (entry) {
  instance.instancedBuffers.lmScaleOffset = new BABYLON.Vector4(
    entry.scale[0],   // scaleX
    entry.scale[1],   // scaleY
    entry.offset[0],  // offsetX
    entry.offset[1]   // offsetY
  );
} else {
  console.warn(`[PILMI] No lightmap data found for instance: "${instance.name}"`);
  instance.instancedBuffers.lmScaleOffset = new BABYLON.Vector4(1, 1, 0, 0);
}
```

### 3. Custom PBR Material with Shader Injection

**Do NOT use a plain PBRMaterial.** Use `PBRCustomMaterial` from
`@babylonjs/materials` because the standard PBR lightmapTexture reads UV2
directly without any per-instance transform. You must inject GLSL to intercept
the UV2 lookup.

```ts
import { PBRCustomMaterial } from "@babylonjs/materials/custom/pbrCustomMaterial";

const mat = new PBRCustomMaterial("pilmiMat", scene);

// --- Textures ---
mat.lightmapTexture = lmTexture;
mat.useLightmapAsShadowmap = true; // treat lightmap as a pure shadow/lighting term
mat.ambientTexture = aoTexture;    // AO in the ambient slot
mat.ambientTextureStrength = 1.0;
mat.metallic = 0.0;
mat.roughness = 1.0;

// --- Vertex shader: declare lmScaleOffset attribute + compute transformed UV ---
mat.Vertex_Definitions(`
  attribute vec4 lmScaleOffset;
  varying vec2 vPilmiUV;
`);

mat.Vertex_After_WorldPosComputed(`
  // uv2 is Babylon's built-in second UV set varying (set via coordinatesIndex = 1)
  vPilmiUV = uv2 * lmScaleOffset.xy + lmScaleOffset.zw;
`);

// --- Fragment shader: declare the varying and override the lightmap sample ---
mat.Fragment_Definitions(`
  varying vec2 vPilmiUV;
`);

// Replace the lightmap UV lookup to use per-instance transformed coords:
mat.Fragment_Custom_Diffuse(`
  // Override: sample lightmap using per-instance UV instead of raw uv2
  #ifdef LIGHTMAP
    vec4 pilmiLM = texture2D(lightmapSampler, vPilmiUV);
    shadow = pilmiLM.rgb;
  #endif
`);
```

> **Note for Claude:** Check the exact GLSL injection point names for the
> version of `@babylonjs/materials` installed in the project. The injection
> hooks are `Vertex_Definitions`, `Vertex_After_WorldPosComputed`,
> `Fragment_Definitions`, and `Fragment_Custom_Diffuse`. If the installed
> version uses different names, adapt accordingly. Refer to:
> https://doc.babylonjs.com/features/featuresDeepDive/materials/using/customMaterials

### 4. Apply Material to All Loaded Meshes

After GLB load, iterate the loaded meshes, assign the custom material, and flag
that they can receive instances:

```ts
for (const mesh of result.meshes) {
  if (mesh instanceof BABYLON.Mesh && mesh.getTotalVertices() > 0) {
    mesh.material = mat;
    mesh.makeGeometryUnique(); // ensure UV2 is not shared if needed
  }
}
```

### 5. Name Matching Strategy

Blender object names survive in Babylon.js as `mesh.name`. If the GLB was
exported with the hierarchy intact, the names will match the JSON keys directly.
If there is a prefix/suffix mismatch (e.g., `"deli-int-shelves_shelf-narrow_01"`
vs `"shelf-narrow_01"`), implement a normalisation helper:

```ts
function normaliseName(fullName: string, jsonData: Record<string, unknown>): string | null {
  if (jsonData[fullName]) return fullName;
  // Try stripping common prefixes
  const parts = fullName.split("_");
  for (let i = 1; i < parts.length; i++) {
    const candidate = parts.slice(i).join("_");
    if (jsonData[candidate]) return candidate;
  }
  return null;
}
```

### 6. Encapsulate in a Loader Class

Wrap the whole system in a `PilmiShelvesLoader` class with this interface:

```ts
class PilmiShelvesLoader {
  constructor(private scene: BABYLON.Scene) {}

  async load(): Promise<void>  // loads all assets, creates material, assigns buffers
  dispose(): void              // disposes textures and material
}
```

---

## What NOT to Do

- Do NOT use a plain `PBRMaterial` — it cannot inject per-instance UV transforms.
- Do NOT use `ShaderMaterial` from scratch — too much to rebuild (shadows, PBR pipeline).
- Do NOT set `lightmapTexture.uOffset` / `vOffset` on the texture object — those are
  per-material uniforms, not per-instance.
- Do NOT skip the `registerInstancedBuffer` call before creating instances — Babylon.js
  requires the buffer to be declared on the root mesh first.
- Do NOT rotate UV islands in UVPackmaster when baking — the shader uses a simple
  scale+offset transform that cannot handle rotation.

---

## Reference Links

- Babylon.js PBRCustomMaterial docs:
  https://doc.babylonjs.com/features/featuresDeepDive/materials/using/customMaterials
- Babylon.js registerInstancedBuffer API:
  https://doc.babylonjs.com/typedoc/classes/BABYLON.Mesh#registerInstancedBuffer
- Babylon.js lightmapTexture on PBRMaterial:
  https://doc.babylonjs.com/typedoc/classes/BABYLON.PBRMaterial#lightmapTexture
- Forum thread on per-instance UV2 with registerInstancedBuffer:
  https://forum.babylonjs.com/t/use-registerinstancedbuffer-for-uv2/24045
- Forum thread on custom UV per instance with PBRCustomMaterial injection:
  https://forum.babylonjs.com/t/how-to-change-uv-for-instance/55907
- KTX2 compressed textures in Babylon.js:
  https://doc.babylonjs.com/features/featuresDeepDive/materials/using/ktx2Compression

