'use strict';
// Colonie Noire · post-traitement : halo lumineux (bloom), vignette et étalonnage des couleurs
const POST = { on: false, c: null };
POST.init = () => {
  if (!T.EffectComposer || !T.UnrealBloomPass) return;
  try {
    const rt = new T.WebGLRenderTarget(innerWidth, innerHeight, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat });
    rt.texture.encoding = T.sRGBEncoding;
    const c = new T.EffectComposer(renderer, rt);
    c.addPass(new T.RenderPass(scene, cam));
    const bloom = new T.UnrealBloomPass(new T.Vector2(innerWidth, innerHeight), .5, .45, .8);
    c.addPass(bloom);
    const grade = new T.ShaderPass({
      uniforms: { tDiffuse: { value: null }, uVig: { value: .9 }, uSat: { value: 1.08 }, uWarm: { value: new T.Vector3(1.02, 1, .97) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig, uSat; uniform vec3 uWarm; varying vec2 vUv;
        void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - .5; c.rgb *= 1. - dot(d, d) * uVig;
          float l = dot(c.rgb, vec3(.299, .587, .114)); c.rgb = mix(vec3(l), c.rgb, uSat) * uWarm; gl_FragColor = c; }`,
    });
    c.addPass(grade);
    Object.assign(POST, { c, bloom, grade });
  } catch (e) { POST.c = null; }
};
POST.resize = (w, h, pr) => { if (!POST.c) return; POST.c.setPixelRatio(pr); POST.c.setSize(w, h); };
POST.mood = cave => {
  if (!POST.c) return;
  POST.bloom.strength = cave ? .6 : .42; POST.bloom.threshold = cave ? .7 : .82; POST.bloom.radius = cave ? .6 : .4;
  POST.grade.uniforms.uVig.value = cave ? 1.6 : .8;
  POST.grade.uniforms.uWarm.value.set(cave ? 1.04 : 1.02, 1, cave ? .94 : .97);
};
