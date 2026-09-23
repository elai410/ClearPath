import * as THREE from "three";

const cache = new Map();

function canvasTex(key, draw, repeatX = 8, repeatZ = 8) {
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  draw(canvas.getContext("2d"));
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatZ);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

export function tileMap(a, b, repeatX, repeatZ) {
  return canvasTex(`tile:${a}:${b}:${repeatX}:${repeatZ}`, (ctx) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = b;
    const s = 16;
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        if ((x + y) % 2 === 0) ctx.fillRect(x * s, y * s, s - 1, s - 1);
      }
    }
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    for (let i = 0; i <= 8; i += 1) {
      ctx.fillRect(i * s, 0, 1, 128);
      ctx.fillRect(0, i * s, 128, 1);
    }
  }, repeatX, repeatZ);
}

export function linoleumMap(a, b, repeatX, repeatZ) {
  return canvasTex(`lino:${a}:${b}:${repeatX}:${repeatZ}`, (ctx) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = b;
    for (let i = 0; i < 80; i += 1) {
      ctx.globalAlpha = 0.18;
      ctx.fillRect((i * 17) % 128, (i * 29) % 128, 3, 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, 0, 128, 4);
    ctx.fillRect(0, 62, 128, 3);
  }, repeatX, repeatZ);
}

export function grassMap(repeatX = 18, repeatZ = 14) {
  return canvasTex("grass", (ctx) => {
    ctx.fillStyle = "#8fa086";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#7d9174";
    for (let i = 0; i < 120; i += 1) {
      ctx.fillRect((i * 13) % 128, (i * 37) % 128, 2, 3);
    }
    ctx.fillStyle = "#9aab90";
    for (let i = 0; i < 60; i += 1) {
      ctx.fillRect((i * 23) % 128, (i * 41) % 128, 1, 2);
    }
  }, repeatX, repeatZ);
}

export function concreteMap(repeatX = 12, repeatZ = 8) {
  return canvasTex("concrete", (ctx) => {
    ctx.fillStyle = "#c5c0b6";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#bbb6ac";
    ctx.fillRect(0, 0, 128, 2);
    ctx.fillRect(0, 64, 128, 2);
    ctx.fillRect(0, 0, 2, 128);
    ctx.fillRect(64, 0, 2, 128);
    ctx.fillStyle = "rgba(80,70,60,0.08)";
    for (let i = 0; i < 40; i += 1) {
      ctx.fillRect((i * 19) % 128, (i * 47) % 128, 4, 3);
    }
  }, repeatX, repeatZ);
}
