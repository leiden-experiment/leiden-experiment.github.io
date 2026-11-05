/* Regression checks for Level Designer conversion, legacy media references and
 * the Track loading paths. Run with `npm run test:levels` (requires TypeScript). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function loadTypeScript(filePath, mocked = {}) {
  const filename = path.join(root, filePath);
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  const diagnostics = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.equal(diagnostics.length, 0, `Invalid TypeScript: ${filePath}`);
  const local = { exports: {} };
  const resolver = name => Object.hasOwn(mocked, name) ? mocked[name] : require(name);
  new Function('require', 'module', 'exports', result.outputText)(resolver, local, local.exports);
  return local.exports;
}
const { LevelConverter } = loadTypeScript('src/ts/util/levelConverter.ts');
const design = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/designer-export.json'), 'utf8'));
assert(LevelConverter.validateOriginalFormat(design));
const converted = LevelConverter.convert(design);
assert.equal(converted.displayName, 'Unified-format regression sample');
assert.deepEqual(converted.bpm, [100, 125, 150]);
assert.equal(converted.layers.length, 3);
assert.equal(converted.layers[0].id, 'drums');
assert.deepEqual(converted.layers[0].soundLoopKeys, ['beat']);
assert(converted.layers.slice(1).every(layer => layer.playable && layer.nodes.length > 0 && layer.soundLoopKeys.length === 0));
const [chords, melody] = converted.layers.slice(1);
assert.equal(chords.nodes.length, 2, 'Trigger/support chord should become one target');
assert.deepEqual(chords.nodes[0].programmaticChord.pitches, [60, 64]);
assert.equal(chords.nodes[0].finger, 'middle');
assert.deepEqual(chords.nodes[0].normalizedPosition, [0.32, 0.67]);
assert.deepEqual(chords.nodes[1].timePosition, { bar: 2, step: 2, tick: 0 });
assert.equal(melody.nodes.length, 1);
assert(melody.nodes[0].programmaticSequenceChord, 'Staggered support notes become an audio sequence');
assert(melody.backgroundLayers.includes(chords.id), 'Previously played track backs subsequent tracks');
assert.equal(converted.timeSignatureNumerator, 4);
// A 6/8 bar is 3 MIDI quarter-note beats (not 6 quarter-note beats).
const compoundMeter = structuredClone(design);
compoundMeter.music.timeSignature = '6/8';
compoundMeter.music.tracks.Chords[2].startTime = 3;
const convertedCompound = LevelConverter.convert(compoundMeter);
assert.equal(convertedCompound.layers[1].nodes[1].timePosition.bar, 2);
const retimed = structuredClone(converted);
const originalChordDuration = retimed.layers[1].nodes[0].programmaticChord.duration;
const originalSequenceDuration = retimed.layers[2].nodes[0].programmaticSequenceChord.totalDuration;
const { retimeProgrammaticLevel } = loadTypeScript('src/ts/util/retimeProgrammaticLevel.ts');
retimeProgrammaticLevel(retimed, 200);
assert.equal(retimed.bpm[0], 200);
assert.equal(retimed.layers[1].nodes[0].programmaticChord.duration, originalChordDuration / 2);
assert.equal(retimed.layers[2].nodes[0].programmaticSequenceChord.totalDuration, originalSequenceDuration / 2);

const oldDesigner = structuredClone(design);
oldDesigner.music.timeSignature = { numerator: 3, denominator: 4 };
oldDesigner.music.tracks = Object.entries(oldDesigner.music.tracks).map(([name, notes]) => ({ name, id: name, notes }));
const convertedOldDesigner = LevelConverter.convert(oldDesigner);
assert.equal(convertedOldDesigner.timeSignatureNumerator, 3);
assert.equal(convertedOldDesigner.layers.length, 3);
assert(!LevelConverter.validateOriginalFormat({ project: { name: 'Bad' }, music: { bpm: 0, tracks: [] } }));
assert.throws(() => LevelConverter.convert({ project: { name: 'Empty' }, music: { bpm: 100, tracks: {} } }));
const invalidNotes = structuredClone(design);
invalidNotes.music.tracks.Chords[0].pitch = 140;
assert.throws(() => LevelConverter.convert(invalidNotes));

// Regression: the actual STRUM3 Level Editor export contains 70 MIDI notes
// but only 17 note onsets. Each simultaneous chord is ONE playable target.
const strum = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/STRUM3_ed.json'), 'utf8'));
const strumConverted = LevelConverter.convert(strum);
const strumLayer = strumConverted.layers.find(layer => layer.playable);
assert.equal(strumLayer.nodes.length, 17, 'STRUM3 must not have stacked chord targets');
assert.equal(strumLayer.nodes[0].programmaticChord.pitches.length, 4);
assert(strumLayer.backgroundLayers.includes('drums'));
assert(fs.existsSync(path.join(root, 'src/assets/sounds/beat.wav')));
// Earlier published versions store overlapping individual targets and no
// drum layer. Repair on load without requiring a researcher to re-upload.
const { restoreDesignerLevel } = loadTypeScript('src/ts/util/restoreDesignerLevel.ts');
const older = JSON.parse(JSON.stringify(strumConverted));
older.layers.shift();
older.layers[0].backgroundLayers = [];
const originalChord = structuredClone(older.layers[0].nodes[0]);
older.layers[0].nodes.splice(0, 1, ...originalChord.programmaticChord.pitches.map((pitch, i) => ({
  ...structuredClone(originalChord), soundKey: `old-${i}`,
  programmaticNote: { pitch, duration: originalChord.programmaticChord.duration },
  programmaticChord: undefined,
})));
const repaired = restoreDesignerLevel(older);
assert.equal(repaired.layers[0].id, 'drums');
assert.equal(repaired.layers[1].nodes.length, 17);
assert.equal(repaired.layers[1].nodes[0].programmaticChord.pitches.length, 4);
restoreDesignerLevel(repaired);
assert.equal(repaired.layers.length, 2, 'Repair must be idempotent');

const legacyNames = JSON.parse(fs.readFileSync(path.join(root, 'src/levels/list.json'), 'utf8'));
assert.deepEqual(legacyNames.slice(0, 3), ['Birthday Vibes', 'Cheerful Bliss', 'Slow Elegance']);
assert.deepEqual(legacyNames.slice(3), ['Tryout', 'Trained', 'Untrained', 'Nosound']);
let oldLoopCount = 0;
let oldNodeCount = 0;
for (const name of legacyNames) {
  const folder = path.join(root, 'src/levels', name);
  const data = JSON.parse(fs.readFileSync(path.join(folder, 'info.json'), 'utf8'));
  assert(fs.existsSync(path.join(folder, 'preview.mp4')), `Missing ${name} preview`);
  assert(fs.existsSync(path.join(folder, 'background.png')), `Missing ${name} background`);
  assert(data.layers.some(layer => layer.playable), `Missing playable layer: ${name}`);
  for (const layer of data.layers) {
    for (const key of layer.soundLoopKeys) {
      assert(fs.existsSync(path.join(folder, layer.id, `${key}.mp3`)), `${name}/${layer.id}/${key}.mp3`);
      oldLoopCount++;
    }
    if (layer.playable) for (const node of layer.nodes) {
      assert(fs.existsSync(path.join(folder, layer.id, `${node.soundKey}.mp3`)), `${name}/${layer.id}/${node.soundKey}.mp3`);
      oldNodeCount++;
    }
  }
}

const loadedSounds = [];
const loadedFiles = [];
class NoteGeneratorStub {
  createPhaserAudioSource(scene, key) { loadedSounds.push(key); scene.cache.audio.add(key, {}); }
  createPhaserChordSource(scene, key) { loadedSounds.push(key); scene.cache.audio.add(key, {}); }
  createPhaserSequenceChordSource(scene, key) { loadedSounds.push(key); scene.cache.audio.add(key, {}); }
}
const common = {
  absPath: x => x,
  assert: (value, message) => assert(value, message),
};
const config = {
  levelDir: 'levels/', levelJsonFileName: 'info.json', soundFileExtension: '.mp3',
  undefinedText: '-', barLength: 4, ticksPerBar: 16, minuteInMilliseconds: 60000,
};
const { Track } = loadTypeScript('src/ts/level/track.ts', {
  '../core/common': common,
  '../core/config': config,
  '../managers/storageManager': { config: { playableBackingTracksEnabled: true, unplayableBackingTracksEnabled: true } },
  '../util/noteGenerator': { NoteGenerator: NoteGeneratorStub },
  '../util/restoreDesignerLevel': { restoreDesignerLevel: x => x },
});
function fakeScene(key, data) {
  const sounds = new Map();
  const json = new Map([[key, data]]);
  return {
    cache: {
      json: { exists: k => json.has(k), get: k => json.get(k) },
      audio: { exists: k => sounds.has(k), add: (k, v) => sounds.set(k, v), remove: k => sounds.delete(k) },
    },
    load: {
      json: (...args) => loadedFiles.push(['json', ...args]),
      audio: (...args) => loadedFiles.push(['audio', ...args]),
    },
  };
}
const legacy = JSON.parse(fs.readFileSync(path.join(root, 'src/levels/Cheerful Bliss/info.json'), 'utf8'));
const legacyScene = fakeScene('Cheerful Bliss', legacy);
new Track(legacyScene, 'Cheerful Bliss').preload(legacyScene);
assert(loadedFiles.some(item => item[0] === 'audio' && item[2] === 'levels/Cheerful Bliss/drums/loop90.mp3'));
assert(loadedFiles.some(item => item[0] === 'audio' && item[2].includes('levels/Cheerful Bliss/chords/chord1.mp3')));
const legacyCount = loadedFiles.length;
const generatedScene = fakeScene('temp_level_test', converted);
generatedScene.cache.audio.add('designerDrumBeat', {});
generatedScene.sound = { add: (key, opts) => ({key, opts, setRate(rate){this.rate=rate;}, setVolume(volume){this.volume=volume;}}) };
const drumTrack = new Track(generatedScene, 'temp_level_test');
drumTrack.data = converted;
const drums = drumTrack.addBackgroundAudioTracks(generatedScene, {loop:true, volume:1}, 0, layer => layer.id === 'drums');
assert.equal(drums.length, 1);
assert.equal(drums[0].key, 'designerDrumBeat');
assert.equal(drums[0].rate, 100/90);
assert.equal(drums[0].volume, 0.3);
new Track(generatedScene, 'temp_level_test').preload(generatedScene);
assert.equal(loadedFiles.length, legacyCount, 'Dynamic levels must use shared drum cache, not request nonexistent MP3s');
assert.equal(loadedSounds.length, chords.nodes.length + melody.nodes.length, 'Every programmatic target must have generated audio');
// Firebase RTDB removes empty arrays when writing stored JSON. A published
// programmatic level must preload without a soundLoopKeys property.
const firestoreStyle = JSON.parse(JSON.stringify(converted, (k, v) =>
  Array.isArray(v) && v.length === 0 ? undefined : v));
assert(!Object.prototype.hasOwnProperty.call(firestoreStyle.layers[1], 'soundLoopKeys'));
const missingLoopsScene = fakeScene('temp_level_rtdb', firestoreStyle);
const beforeRtdb = loadedFiles.length;
new Track(missingLoopsScene, 'temp_level_rtdb').preload(missingLoopsScene);
assert.equal(loadedFiles.length, beforeRtdb, 'Firebase-serialized programmatic levels must not fetch MP3 files');
assert.throws(() => {
  const brokenLegacy = structuredClone(legacy);
  delete brokenLegacy.layers[0].soundLoopKeys;
  const badScene = fakeScene('broken_legacy', brokenLegacy);
  new Track(badScene, 'broken_legacy').preload(badScene);
}, /Missing audio loops/, 'A corrupted legacy recording should not be silently treated as programmatic');


let checkedTypeScriptFiles = 0;
function scan(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (entry.name.endsWith('.ts')) {
      const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      assert.equal(source.parseDiagnostics.length, 0, `Invalid TS syntax: ${file}`);
      checkedTypeScriptFiles++;
    }
  }
}
scan(path.join(root, 'src/ts'));
console.log(`PASS: ${legacyNames.length} bundled legacy levels, ${oldLoopCount} MP3 loops, ${oldNodeCount} MP3 targets; two Designer JSON shapes, 6/8 meter, chord/sequence conversion, tempo retiming, audio loading; ${checkedTypeScriptFiles} TS source files parse.`);
