<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";
import { createCampusModel, type Point3 } from "@/lib/campus-model";

const surface = useTemplateRef<HTMLCanvasElement>("campus-canvas");
const angle = ref(-24);
const failed = ref(false);
const faces = createCampusModel();
let resizeObserver: ResizeObserver | undefined;
let frame = 0;
let width = 0;
let height = 0;
let drag: { id: number; x: number; angle: number } | undefined;

function surfaceColor(color: string, points: Point3[]) {
  const [a, b, c] = points;
  if (!a || !b || !c) return color;
  const u = b.map((value, index) => value - a[index]!) as Point3;
  const v = c.map((value, index) => value - a[index]!) as Point3;
  const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...normal) || 1;
  const light = (normal[0]! * -.3 + normal[1]! * .8 + normal[2]! * .4) / length;
  const brightness = .87 + Math.max(0, light) * .15;
  const channels = [1, 3, 5].map((start) => Math.round(parseInt(color.slice(start, start + 2), 16) * brightness));
  return `rgb(${channels.join(",")})`;
}

function rotate(degrees: number) {
  angle.value = Math.max(-65, Math.min(65, degrees));
  scheduleDraw();
}

function scheduleDraw() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(draw);
}

function draw() {
  const canvas = surface.value;
  const context = canvas?.getContext("2d");
  if (!canvas || !context || !width || !height) return;
  const yaw = angle.value * Math.PI / 180;
  const pitch = 42 * Math.PI / 180;
  const transform = ([x, y, z]: Point3) => {
    const side = x * Math.cos(yaw) + z * Math.sin(yaw);
    const depth = -x * Math.sin(yaw) + z * Math.cos(yaw);
    return { x: side, y: -y * Math.cos(pitch) + depth * Math.sin(pitch), depth: depth * Math.cos(pitch) + y * Math.sin(pitch) };
  };
  const projected = faces.map((face) => ({
    ...face, color: surfaceColor(face.color, face.points), points: face.points.map(transform),
  }));
  const points = projected.flatMap((face) => face.points);
  const left = Math.min(...points.map((point) => point.x));
  const right = Math.max(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const bottom = Math.max(...points.map((point) => point.y));
  const scale = Math.min((width - 28) / (right - left), (height - 35) / (bottom - top));
  const centerX = width / 2 - (right + left) / 2 * scale;
  const centerY = height / 2 - (top + bottom) / 2 * scale;

  // Per-pixel depth keeps small facade details visible over large wall faces
  // and handles intersecting roofs correctly throughout the rotation range.
  const ratio = canvas.width / width;
  const pixels = context.createImageData(canvas.width, canvas.height);
  const depths = new Float32Array(canvas.width * canvas.height).fill(-Infinity);
  for (const face of projected) {
    const vertices = face.points.map((point) => ({
      x: (point.x * scale + centerX) * ratio,
      y: (point.y * scale + centerY) * ratio,
      depth: point.depth,
    }));
    const channels = face.color.match(/\d+/g)!.map(Number);
    const a = vertices[0]!;
    for (let index = 1; index < vertices.length - 1; index++) {
      const b = vertices[index]!, c = vertices[index + 1]!;
      const area = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      if (Math.abs(area) < .001) continue;
      const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
      const maxX = Math.min(canvas.width - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
      const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
      const maxY = Math.min(canvas.height - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const first = ((b.y - c.y) * (x + .5 - c.x) + (c.x - b.x) * (y + .5 - c.y)) / area;
          const second = ((c.y - a.y) * (x + .5 - c.x) + (a.x - c.x) * (y + .5 - c.y)) / area;
          const third = 1 - first - second;
          if (first < -.00001 || second < -.00001 || third < -.00001) continue;
          const depth = first * a.depth + second * b.depth + third * c.depth;
          const position = y * canvas.width + x;
          if (depth < depths[position]!) continue;
          depths[position] = depth;
          const pixel = position * 4;
          pixels.data[pixel] = channels[0]!;
          pixels.data[pixel + 1] = channels[1]!;
          pixels.data[pixel + 2] = channels[2]!;
          pixels.data[pixel + 3] = 255;
        }
      }
    }
  }
  context.putImageData(pixels, 0, 0);
  for (const face of projected) {
    if (face.label && Math.abs(angle.value) < 58) {
      const [a, b, , d] = face.points;
      if (!a || !b || !d) continue;
      context.save();
      context.transform((b.x - a.x) * scale / 340, (b.y - a.y) * scale / 340,
        (a.x - d.x) * scale / 44, (a.y - d.y) * scale / 44, d.x * scale + centerX, d.y * scale + centerY);
      context.fillStyle = "#fff4da";
      context.font = "600 17px Georgia";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(face.label, 170, 22, 325);
      context.restore();
    }
  }
}

function pointerDown(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0) return;
  drag = { id: event.pointerId, x: event.clientX, angle: angle.value };
  surface.value?.setPointerCapture(event.pointerId);
}

function pointerMove(event: PointerEvent) {
  if (drag?.id === event.pointerId) rotate(drag.angle + (event.clientX - drag.x) * .3);
}

function pointerUp(event: PointerEvent) {
  if (drag?.id !== event.pointerId) return;
  drag = undefined;
  if (surface.value?.hasPointerCapture(event.pointerId)) surface.value.releasePointerCapture(event.pointerId);
}

onMounted(() => {
  const canvas = surface.value;
  if (!canvas || !canvas.getContext("2d")) {
    failed.value = true;
    return;
  }
  resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return;
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
    scheduleDraw();
  });
  resizeObserver.observe(canvas);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  cancelAnimationFrame(frame);
});
</script>

<template>
  <figure class="campus-model" aria-labelledby="campus-model-caption">
    <figcaption id="campus-model-caption">
      <strong>Explore the campus</strong>
      <span>Illustrated 3D model</span>
    </figcaption>
    <div v-if="!failed" class="campus-model-viewport">
    <canvas ref="campus-canvas" role="img"
      :aria-label="`Three-dimensional illustration of the white church, bell tower, red-roofed school buildings, and blue covered court. Viewing angle ${Math.round(angle)} degrees.`"
      aria-describedby="campus-model-help" @pointerdown="pointerDown" @pointermove="pointerMove"
      @pointerup="pointerUp" @pointercancel="pointerUp" @lostpointercapture="drag = undefined">
      Illustrated model of the church and school campus.
    </canvas>
    </div>
    <img v-else class="campus-model-fallback" src="/images/source-site/campus-aerial-reference.png"
      alt="Aerial view of the white church, bell tower, and Sto. Niño Catholic School campus" width="1523" height="862" />
    <div v-if="!failed" class="campus-model-controls">
      <p id="campus-model-help">Drag left or right to explore</p>
      <div class="campus-model-buttons" role="group" aria-label="Campus rotation">
        <button type="button" aria-label="Rotate campus left" :disabled="angle <= -65" @click="rotate(angle - 15)">←</button>
        <button type="button" @click="rotate(-24)">Reset view</button>
        <button type="button" aria-label="Rotate campus right" :disabled="angle >= 65" @click="rotate(angle + 15)">→</button>
      </div>
    </div>
  </figure>
</template>
