// Optional Chrome QA diagnostic, not an acceptance sampler. This function is
// serialized for injection: keep its helpers inside the function body.
export function installImpactShaderProbe(context = null) {
  const proto = WebGL2RenderingContext.prototype;
  const startedAt = performance.now();
  const maxLinks = 512, maxRetainedCodeUnits = 12 * 1024 * 1024;
  const sources = new WeakMap(), attachments = new WeakMap(), records = [];
  const replacements = [];
  let target = context, retainedCodeUnits = 0, droppedLinks = 0, finished = false;

  function isTarget(receiver) {
    if (target) return receiver === target;
    // Set on the game canvas by Three before it compiles the first material.
    // No getContext/createShader/driver-reflection interception is necessary.
    if (receiver instanceof WebGL2RenderingContext && receiver.canvas?.matches?.('canvas[data-engine]')) {
      target = receiver;
      return true;
    }
    return false;
  }

  function replace(name, build) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    const original = proto[name];
    if (typeof original !== 'function' || descriptor?.configurable === false) {
      throw new Error(`Cannot observe WebGL2 ${name}`);
    }
    const wrapped = build(original);
    Object.defineProperty(proto, name, {
      value: wrapped, writable: true, configurable: true, enumerable: descriptor?.enumerable ?? false,
    });
    replacements.push({ name, descriptor, wrapped });
  }

  function restore() {
    if (replacements.some(({ name, wrapped }) => proto[name] !== wrapped)) {
      throw new Error('Finish the later-installed WebGL probes first');
    }
    for (const { name, descriptor } of replacements.reverse()) {
      if (descriptor) Object.defineProperty(proto, name, descriptor);
      else delete proto[name];
    }
    replacements.length = 0;
  }

  try {
    replace('shaderSource', original => function (shader, source) {
      const observe = isTarget(this);
      const result = Reflect.apply(original, this, arguments);
      if (observe && shader && typeof source === 'string') {
        // Keep the existing immutable string, not a copy or hash.
        sources.set(shader, { source, t: performance.now() });
      }
      return result;
    });
    replace('attachShader', original => function (program, shader) {
      const result = Reflect.apply(original, this, arguments);
      if (isTarget(this) && program && shader) {
        const observed = attachments.get(program);
        if (!observed) attachments.set(program, [shader]);
        else if (!observed.includes(shader)) observed.push(shader);
      }
      return result;
    });
    replace('linkProgram', original => function (program) {
      if (!isTarget(this)) return Reflect.apply(original, this, arguments);
      const t = performance.now();
      try {
        return Reflect.apply(original, this, arguments);
      } finally {
        const end = performance.now();
        if (records.length >= maxLinks) droppedLinks++;
        else {
          const shaders = (attachments.get(program) ?? []).map(shader => sources.get(shader) ?? null);
          const size = shaders.reduce((sum, meta) => sum + (meta?.source.length ?? 0), 0);
          if (retainedCodeUnits + size > maxRetainedCodeUnits) droppedLinks++;
          else {
            retainedCodeUnits += size;
            records.push({ t, end, shaders });
          }
        }
      }
    });
    if (context && replacements.some(({ name, wrapped }) => context[name] !== wrapped)) {
      throw new Error('Gameplay WebGL context bypasses the shader probe prototype');
    }
  } catch (error) {
    restore();
    throw error;
  }

  function round(value) { return +value.toFixed(3); }
  function describe(source) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 0x01000193);
    const header = source.slice(0, 8192);
    const defines = Object.create(null);
    for (const [, name, value] of header.matchAll(/^[\t ]*#define[\t ]+([A-Za-z_]\w*)(?:[\t ]+([^\r\n]*))?$/gm)) {
      if (!Object.hasOwn(defines, name)) defines[name] = (value ?? '').trim().slice(0, 100);
    }
    const stage = /\b(?:pc_fragColor|gl_Frag(?:Color|Coord|Data|Depth))\b/.test(source) ? 'fragment'
      : /\bgl_Position\b/.test(source) ? 'vertex' : 'unknown';
    const main = /\bvoid\s+main\s*\(/.exec(source)?.index;
    const distinctive = [...new Set(source.match(/\b(?:aParticleSeed|vScorchUv|[a-zA-Z_]*[sS][dD][fF][a-zA-Z_]*|[a-zA-Z_]*[Tt]roika[a-zA-Z_]*|[a-zA-Z_]*[Gg]lyph[a-zA-Z_]*|[a-zA-Z_]*[Aa]tlas[a-zA-Z_]*|instanceMatrix|faceDirection|shadowMap|losslessNoise|linearToOutputTexel)\b/g) ?? [])].slice(0, 18);
    return {
      fingerprint: `fnv1a32-codeunits:${(hash >>> 0).toString(16).padStart(8, '0')}:${source.length}`,
      length: source.length, stage, type: defines.SHADER_TYPE ?? null, name: defines.SHADER_NAME || null, defines,
      distinctive, mainExcerpt: main === undefined ? null : source.slice(main, main + 340).replace(/\s+/g, ' ').trim(),
    };
  }

  return {
    finish() {
      if (finished) throw new Error('Shader probe already finished');
      const endedAt = performance.now();
      restore();
      finished = true;
      // No full GLSL, fingerprints, regex, or JSON serialization while timing
      // the frame. Deduplicate exact strings before making the compact report.
      const bySource = new Map(), shaders = [];
      const links = records.map(({ t, end, shaders: captured }) => {
        return { t: round(t), end: round(end), durationMs: round(end - t),
          shaderCount: captured.length,
          shaders: captured.map(meta => {
            if (!meta) return null;
            if (!bySource.has(meta.source)) {
              bySource.set(meta.source, shaders.length);
              shaders.push(describe(meta.source));
            }
            return { index: bySource.get(meta.source), sourceAtMs: round(meta.t) };
          }),
        };
      });
      records.length = 0;
      return { diagnosticOnly: true, startedAt: round(startedAt), endedAt: round(endedAt), foundGameplayContext: !!target,
        droppedLinks, retainedCodeUnits, links, shaders,
        notes: 'Host calls only, not GPU execution time or proof of causation. Attachment list describes observed attachShader calls in this Three build; absent sources can predate the probe. Fingerprints are non-cryptographic; shader references are exact-source deduplicated within this report.',
      };
    },
  };
}
