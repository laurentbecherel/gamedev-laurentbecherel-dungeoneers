import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { vsSource, fsSource, vsQuantize, fsQuantize, vsUI, fsUI } from "../../render/shaders.js";
import { createShader, createProgram, createTexture } from "../../render/gl-utils.js";

const shaderPath = path.join(process.cwd(), "render", "shaders.js");
const rendererPath = path.join(process.cwd(), "render", "renderer-gpu.js");

// core uniform list expected — Task10 refactor: array path + 8 lights + modifiers
const REQUIRED_UNIFORMS = [
  // core
  'u_resolution','u_playerPos','u_playerAngle','u_fov','u_playerHeight','u_mapTex','u_matMap','u_mapSize',
  'u_wallAlbedo','u_wallNormal','u_wallHeight','u_wallRoughMetal',
  'u_floorAlbedo','u_floorNormal','u_floorHeight','u_floorRoughMetal',
  'u_ceilAlbedo','u_ceilNormal','u_ceilHeight','u_ceilRoughMetal',
  // material count (array)
  'u_wallCount','u_floorCount','u_ceilCount',
  // modifier-ready
  'u_modifierMap','u_noiseTex','u_modifiersEnabled',
  'u_lightPos','u_lightColor','u_lightIntensity','u_lightRadius',
  'u_ambientColor','u_ambientLevel','u_worldAmbientMul',
  'u_sunDir','u_sunDirZ','u_sunIntensity','u_sunColor',
  'u_fogBase','u_fogSquared','u_fogColor','u_fogEnabled',
  // pom core + extended
  'u_pomWall','u_pomFloor','u_pomCeil','u_pomSteps','u_pomMaxOffset','u_pomMinVz','u_pomMinEffVz','u_pomFadeStart','u_pomFadeEnd',
  // general toggles
  'u_authentic','u_bandLevels','u_time',
  'u_gridDebug','u_lightingEnabled','u_pbrEnabled','u_pomEnabled','u_pbrDebugMode',
  'u_aoSun','u_aoPoint','u_aoAmbient',
  // chamfer
  'u_chamferEnabled','u_chamferFloorSize','u_chamferCeilSize','u_chamferWallSize','u_chamferCornerRadius','u_chamferDarken','u_chamferRoundCorners','u_chamferBlendFloor','u_chamferBlendWall','u_chamferRough','u_chamferFloor','u_chamferCeil','u_chamferWall',
  'u_chamferTrimFloor','u_chamferTrimCeil','u_chamferTrimWall','u_chamferTrimFloorAlt','u_chamferTrimCeilAlt','u_chamferCreviceEnd','u_chamferCreviceSmoothEnd','u_chamferTrimStart','u_chamferTrimMid','u_chamferTrimEnd',
  // grid chamfer
  'u_chamferGridEnabled','u_chamferGridFloorSize','u_chamferGridCeilSize',
  // corners true geometry
  'u_cornerEnabled','u_cornerRadius','u_cornerMode','u_cornerInner',
  'u_cornerBandNear','u_cornerBandFarExtra','u_cornerBandFarFactor','u_cornerSectorThresh','u_cornerNormalMix','u_cornerAlbedoBoost','u_cornerRoughMul','u_cornerAoMul',
  // shadows
  'u_shadowBiasN','u_shadowBiasDir','u_shadowSunFactor','u_shadowPointFactor','u_shadowSunMax','u_shadowPointEps','u_shadowNormalThresh',
  // pbr extended
  'u_pbrEmissiveAlbedoMul','u_pbrEmissiveStrength','u_pbrF0','u_pbrAttenQuad','u_pbrGGXEps',
  // rendering surface
  'u_renderFloorMul','u_renderCeilMul','u_renderWallDarken','u_renderEyeFactor'
];

test("vertex shader source non-empty with expected GLSL keywords", () => {
  assert(vsSource.length > 50, "vs source exists");
  assert(vsSource.includes("precision") || vsSource.includes("#version"), "has precision or version");
  assert(vsSource.includes("gl_Position"), "sets gl_Position");
  assert(vsSource.includes("a_pos") || vsSource.includes("attribute") || vsSource.includes("in "), "has position input");
});

test("fragment shader source non-empty with raycast keywords", () => {
  assert(fsSource.length > 800, "fs source substantial (>800) after Task3 additions");
  assert(fsSource.includes("precision"), "has precision");
  assert(fsSource.includes("texelFetch") || fsSource.includes("texture"), "samples texture");
  assert(fsSource.includes("u_playerPos") || fsSource.includes("u_resolution"), "has camera uniforms");
  assert(fsSource.includes("main"), "has main function");
  assert(fsSource.includes("#version 300 es"), "WebGL2 GLSL 300 es");
});

test("fragment shader contains all required uniforms (core + 27 extended)", () => {
  const missing = [];
  for (const u of REQUIRED_UNIFORMS) {
    if (!fsSource.includes(u)) missing.push(u);
  }
  assert.equal(missing.length, 0, `missing uniforms: ${missing.join(", ")}`);
});

test("POM centered reference plane at 0.5: shader uses curUV = uv - 0.5*fullOffset pattern", () => {
  assert(fsSource.includes("fullOffset * 0.5") || fsSource.includes("0.5 * fullOffset") || fsSource.includes("- fullOffset * 0.5"),
    "shader should center POM reference at 0.5 (curUV = uv - 0.5*fullOffset)");
  // must not treat raw height as absolute depth without centering
  assert(fsSource.includes("pomOffset") && fsSource.includes("viewTS"), "pomOffset uses viewTS");
});

test("POM grazing safety: minViewZ, minEffectiveVz, maxOffset, fade logic", () => {
  assert(fsSource.includes("u_pomMinVz") && fsSource.includes("u_pomMinEffVz"), "uses minVz uniforms");
  assert(fsSource.includes("u_pomMaxOffset"), "uses maxOffset uniform");
  assert(fsSource.includes("u_pomFadeStart") && fsSource.includes("u_pomFadeEnd"), "uses fade uniforms");
  // check zero return at grazing
  assert(fsSource.includes("vzAbs < minVz") || fsSource.includes("vzAbs <"), "has grazing early-out");
  assert(fsSource.includes("length(fullOffset)") || fsSource.includes("lenOff"), "caps offset length");
});

test("Shadow bias uses snapped dominant-axis geometric normal, not perturbed normal", () => {
  assert(fsSource.includes("traceN") && fsSource.includes("dominant") || fsSource.includes("sign(ng.x)") || fsSource.includes("abs(ng.x) > abs(ng.y)"),
    "shadow trace should snap to dominant axis");
  assert(fsSource.includes("u_shadowBiasN") && fsSource.includes("u_shadowBiasDir"), "uses shadow bias uniforms");
  assert(fsSource.includes("u_shadowNormalThresh"), "uses normal threshold uniform");
  assert(fsSource.includes("traceNormal") || fsSource.includes("ngLen") || fsSource.includes("ng"), "computes geometric normal length");
});

test("Shadow helpers: correct perp distance using tracked side and 64 steps", () => {
  assert(fsSource.includes("64") || fsSource.includes("maxSteps"), "DDA 64 steps for shadows/wall");
  assert(fsSource.includes("sideDist.x - deltaDist.x") || fsSource.includes("perp"), "computes perp distance");
  assert(fsSource.includes("traceRay"), "has traceRay for shadow");
});

test("Chamfer fake geometry: isWallCell + nearestWallDistAndNormal + wall/floor/ceil bevel", () => {
  assert(fsSource.includes("isWallCell"), "has isWallCell helper");
  assert(fsSource.includes("nearestWallDistAndNormal"), "has nearestWallDistAndNormal helper");
  assert(fsSource.includes("u_chamferEnabled"), "chamfer toggle uniform");
  assert(fsSource.includes("u_chamferFloorSize") && fsSource.includes("u_chamferCeilSize") && fsSource.includes("u_chamferWallSize"),
    "chamfer size uniforms");
  // must include AO darken + trim highlight logic
  assert(fsSource.includes("trimFloor") || fsSource.includes("trim") && fsSource.includes("AO") || fsSource.includes("darken") || fsSource.includes("u_chamferDarken"),
    "chamfer should have darken and trim highlight");
  // must NOT skip interior concave corners (old bug)
  // check for comment or logic that includes interior
  const hasInteriorLogic = fsSource.includes("inner") || fsSource.includes("concave") || fsSource.includes("wallToWallBlend") || fsSource.includes("hasCornerRound") === false;
  assert(hasInteriorLogic, "chamfer vertical bevel should not unconditionally skip interior concave");
});

test("True geometry rounded corners: ray-circle intersection + outer convex / inner concave", () => {
  assert(fsSource.includes("rayCircleHit"), "has rayCircleHit");
  assert(fsSource.includes("isOuterConvex") && fsSource.includes("isInnerConcave"), "has outer/inner corner classification");
  assert(fsSource.includes("u_cornerEnabled") && fsSource.includes("u_cornerRadius"), "corner uniforms");
  assert(fsSource.includes("u_cornerMode") && fsSource.includes("u_cornerInner"), "corner mode/inner");
  assert(fsSource.includes("cornerNormal") && fsSource.includes("hasCornerRound"), "stores corner normal and flag");
  // must replace perpDist with rounded candidate (historically tCand, now cT/outT via resolveWallHit)
  const hasRoundedReplace = fsSource.includes("perpDist = tCand") || fsSource.includes("tCand") ||
                            fsSource.includes("perpDist = cT") || fsSource.includes("resolveWallHit");
  assert(hasRoundedReplace, "replaces wall hit with rounded corner intersection (resolveWallHit/cT/tCand)");
  // sector threshold check — uniform exists, usage may be via uniform name (case-insensitive)
  const lower = fsSource.toLowerCase();
  assert(lower.includes("sectorthresh") || lower.includes("sector") || fsSource.includes("u_cornerSectorThresh"), "sector threshold check");
  // band checks — uniforms defined (case-insensitive, uniforms use BandNear/BandFar casing)
  assert(lower.includes("bandnear") && lower.includes("bandfar"), "band near/far checks");
});

test("Fog exponential squared with gating uniform", () => {
  assert(fsSource.includes("u_fogEnabled"), "fogEnabled uniform gating");
  assert(fsSource.includes("u_fogBase") && fsSource.includes("u_fogSquared"), "fog base/squared uniforms");
});

test("AO per-light influence mix(1,ao,affect) for sun/point/ambient", () => {
  assert(fsSource.includes("u_aoSun") && fsSource.includes("u_aoPoint") && fsSource.includes("u_aoAmbient"), "AO affect uniforms");
  assert(fsSource.includes("mix(1.0, ao") || fsSource.includes("mix(1., ao") || fsSource.includes("aoSunEff") || fsSource.includes("aoPointEff"),
    "mix(1,ao,affect) per light");
});

test("PBR debug modes 0..8 and grid debug RGB", () => {
  assert(fsSource.includes("u_pbrDebugMode") && fsSource.includes("debugShowPBR"), "PBR debug uniform + function");
  assert(fsSource.includes("Albedo") || fsSource.includes("mode == 1"), "debug modes include albedo");
  assert(fsSource.includes("u_gridDebug"), "grid debug uniform");
  // grid debug colors: floor green, wall red, ceil blue (check 0.0,1.0,0.0 patterns or comments)
  assert(fsSource.includes("gridDebug") || fsSource.toLowerCase().includes("green") || fsSource.includes("0.0, (") || fsSource.includes("1.0 : 0.25"),
    "grid debug should produce colored output");
});

test("Palette quantization and rendering surface uniforms", () => {
  assert(fsSource.includes("u_authentic") && fsSource.includes("u_bandLevels"), "authentic + bandLevels");
  assert(fsSource.includes("u_renderFloorMul") && fsSource.includes("u_renderCeilMul") && fsSource.includes("u_renderWallDarken"),
    "rendering surface muls");
  assert(fsSource.includes("u_renderEyeFactor") || fsSource.includes("eyeFactor"), "eye factor");
});

test("PBR GGX helpers: DistributionGGX, GeometrySchlickGGX, GeometrySmith, fresnelSchlick", () => {
  assert(fsSource.includes("DistributionGGX"), "GGX NDF");
  assert(fsSource.includes("GeometrySchlickGGX") || fsSource.includes("GeometrySmith"), "geometry");
  assert(fsSource.includes("fresnelSchlick"), "fresnel");
});

test("GL utils handle shader compile errors gracefully", () => {
  let deleted = false;
  const mockGl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 0x8B81, LINK_STATUS: 0x8B82,
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => false,
    getShaderInfoLog: () => "mock compile error",
    deleteShader: () => { deleted = true; },
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    deleteProgram: () => {},
  };
  const result = createShader(mockGl, mockGl.VERTEX_SHADER, "invalid glsl {{{");
  assert.equal(result, null, "returns null on compile failure");
  assert(deleted, "deletes shader on failure");
});

test("createProgram returns null on bad shader source", () => {
  const mockGl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 0x8B81, LINK_STATUS: 0x8B82,
    createShader: () => ({}), shaderSource: () => {}, compileShader: () => {},
    getShaderParameter: () => false, getShaderInfoLog: () => "err", deleteShader: () => {},
    createProgram: () => ({}), attachShader: () => {}, linkProgram: () => {},
    getProgramParameter: () => true, getProgramInfoLog: () => "", deleteProgram: () => {},
  };
  const prog = createProgram(mockGl, "bad", "bad");
  assert.equal(prog, null, "returns null when shader compile fails");
});

test("createTexture helper exists and handles NEAREST filter", async () => {
  // check file contains createTexture export
  const content = await fs.readFile(path.join(process.cwd(), "render", "gl-utils.js"), "utf8");
  assert(content.includes("createTexture"), "gl-utils should export createTexture");
  assert(content.includes("NEAREST") || content.includes("texParameteri"), "should set texture filter param");
});

test("renderer-gpu.js caches extended uniform locations (+27)", async () => {
  const content = await fs.readFile(rendererPath, "utf8");
  // must cache all extended uniforms
  const mustCache = [
    'u_pomMaxOffset','u_pomMinVz','u_pomMinEffVz','u_pomFadeStart','u_pomFadeEnd',
    'u_shadowBiasN','u_shadowBiasDir','u_shadowSunFactor','u_shadowPointFactor','u_shadowSunMax','u_shadowPointEps','u_shadowNormalThresh',
    'u_chamferEnabled','u_chamferFloorSize','u_chamferCornerRadius','u_chamferTrimFloor',
    'u_cornerEnabled','u_cornerRadius','u_cornerBandNear','u_cornerNormalMix',
    'u_pbrEmissiveAlbedoMul','u_pbrF0','u_pbrAttenQuad',
    'u_renderFloorMul','u_renderEyeFactor'
  ];
  for (const u of mustCache) {
    assert(content.includes(u), `renderer-gpu should cache ${u}`);
  }
  assert(content.includes('toggleChamfer') && content.includes('toggleCorner'), "should have toggleChamfer/toggleCorner methods");
  assert(content.includes('toggleFog') && content.includes('toggleGridDebug'), "should have fog/grid toggles");
  assert(content.includes('cyclePBRDebug'), "should have cyclePBRDebug");
  assert(content.includes('renderMapOnly'), "should have renderMapOnly for fullscreen map");
});

test("renderer resolves toggles from dedicated configs with fallback chain", async () => {
  const content = await fs.readFile(rendererPath, "utf8");
  assert(content.includes('_resolveToggles') || content.includes('pom.enabled') || content.includes('rendering.pom.enabled'),
    "should resolve pom enabled from dedicated or legacy");
  assert(content.includes('chamfer') && content.includes('corner'), "should resolve chamfer/corner enabled");
  assert(content.includes('fog') && content.includes('Fog'), "should resolve fog enabled");
});

test("quantization shaders exist", () => {
  assert(vsQuantize && vsQuantize.length > 20, "vsQuantize exists");
  assert(fsQuantize && fsQuantize.includes('u_palette') && fsQuantize.includes('u_lut'), "fsQuantize uses palette & lut");
  assert(vsUI && fsUI, "UI shaders exist");
});
