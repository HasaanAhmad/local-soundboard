const fs = require("fs");
const path = require("path");

const soundsDir = path.join(__dirname, "..", "sounds");
const dataDir = path.join(__dirname, "..", "data");

fs.mkdirSync(soundsDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

function writeWav(filename, samples, sampleRate = 44100) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE((clamped * 32767) | 0, 44 + i * 2);
  }

  fs.writeFileSync(path.join(soundsDir, filename), buffer);
}

function tone(freq, duration, sampleRate = 44100, gain = 0.35, type = "sine") {
  const n = Math.floor(sampleRate * duration);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t * 40) * Math.min(1, (duration - t) * 12);
    let wave;
    const phase = 2 * Math.PI * freq * t;
    if (type === "square") wave = Math.sign(Math.sin(phase));
    else if (type === "saw") wave = 2 * ((freq * t) % 1) - 1;
    else if (type === "noise") wave = Math.random() * 2 - 1;
    else wave = Math.sin(phase);
    samples[i] = wave * gain * env;
  }
  return samples;
}

function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function airhorn() {
  const a = tone(220, 0.18, 44100, 0.4, "saw");
  const b = tone(180, 0.22, 44100, 0.45, "saw");
  const c = tone(240, 0.35, 44100, 0.5, "saw");
  return concat(a, b, c);
}

function rimshot() {
  const click = tone(1800, 0.04, 44100, 0.5, "noise");
  const body = tone(180, 0.12, 44100, 0.35, "sine");
  return concat(click, body);
}

function crowd() {
  const parts = [];
  for (let i = 0; i < 8; i++) {
    parts.push(tone(400 + Math.random() * 800, 0.08, 44100, 0.12, "noise"));
    parts.push(tone(200 + Math.random() * 100, 0.06, 44100, 0.2, "sine"));
  }
  return concat(...parts);
}

function fail() {
  return concat(
    tone(420, 0.18, 44100, 0.35, "square"),
    tone(300, 0.22, 44100, 0.3, "square"),
    tone(180, 0.4, 44100, 0.28, "saw")
  );
}

function victory() {
  return concat(
    tone(523, 0.12, 44100, 0.3),
    tone(659, 0.12, 44100, 0.3),
    tone(784, 0.12, 44100, 0.3),
    tone(1046, 0.28, 44100, 0.35)
  );
}

function boom() {
  const n = Math.floor(44100 * 0.55);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / 44100;
    const env = Math.exp(-t * 6);
    const noise = (Math.random() * 2 - 1) * 0.25;
    const thump = Math.sin(2 * Math.PI * (70 - t * 50) * t);
    samples[i] = (thump * 0.55 + noise) * env;
  }
  return samples;
}

const demos = [
  { id: "airhorn", name: "Airhorn", color: "#ff5a36", file: "airhorn.wav", samples: airhorn() },
  { id: "rimshot", name: "Rimshot", color: "#f4c430", file: "rimshot.wav", samples: rimshot() },
  { id: "crowd", name: "Crowd Cheer", color: "#2dd4a8", file: "crowd.wav", samples: crowd() },
  { id: "fail", name: "Fail", color: "#ff4d6d", file: "fail.wav", samples: fail() },
  { id: "victory", name: "Victory", color: "#4cc9f0", file: "victory.wav", samples: victory() },
  { id: "boom", name: "Bass Drop", color: "#c77dff", file: "boom.wav", samples: boom() },
];

const manifest = demos.map(({ id, name, color, file }) => {
  writeWav(file, demos.find((d) => d.id === id).samples);
  return {
    id,
    name,
    color,
    file,
    createdAt: new Date().toISOString(),
  };
});

fs.writeFileSync(
  path.join(dataDir, "sounds.json"),
  JSON.stringify(manifest, null, 2)
);

console.log(`Generated ${manifest.length} demo sounds in /sounds`);
