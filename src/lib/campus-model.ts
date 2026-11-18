export type Point3 = [number, number, number];

export interface CampusFace {
  points: Point3[];
  color: string;
  label?: string;
  layer?: number;
}

export function createCampusModel(): CampusFace[] {
  const faces: CampusFace[] = [];
  const cream = "#efdcc1";
  const red = "#a43b2a";
  const roof = "#b84b37";
  const railing = "#8b3326";

  function polygon(points: Point3[], color: string, label?: string) {
    faces.push({ points, color, label });
  }

  function box(x: number, y: number, z: number, width: number, height: number, depth: number, color: string) {
    const left = x - width / 2, right = x + width / 2;
    const bottom = y - height / 2, top = y + height / 2;
    const back = z - depth / 2, front = z + depth / 2;
    polygon([[left, bottom, front], [right, bottom, front], [right, top, front], [left, top, front]], color);
    polygon([[right, bottom, back], [left, bottom, back], [left, top, back], [right, top, back]], color);
    polygon([[right, bottom, front], [right, bottom, back], [right, top, back], [right, top, front]], color);
    polygon([[left, bottom, back], [left, bottom, front], [left, top, front], [left, top, back]], color);
    polygon([[left, top, front], [right, top, front], [right, top, back], [left, top, back]], color);
  }

  function cylinder(x: number, y: number, z: number, radius: number, height: number, color: string, sides = 7) {
    const top: Point3[] = [];
    for (let step = 0; step < sides; step++) {
      const a = step * Math.PI * 2 / sides;
      const b = (step + 1) * Math.PI * 2 / sides;
      const first: Point3 = [x + Math.cos(a) * radius, y + height, z + Math.sin(a) * radius];
      const second: Point3 = [x + Math.cos(b) * radius, y + height, z + Math.sin(b) * radius];
      polygon([[first[0], y, first[2]], [second[0], y, second[2]], second, first], color);
      top.push(first);
    }
    polygon(top, color);
  }

  function canopy(x: number, y: number, z: number, radius: number, color: string) {
    const sides = 8;
    const rows = 3;
    for (let row = 0; row < rows; row++) {
      const a = row * Math.PI / (2 * rows);
      const b = (row + 1) * Math.PI / (2 * rows);
      for (let side = 0; side < sides; side++) {
        const c = side * Math.PI * 2 / sides;
        const d = (side + 1) * Math.PI * 2 / sides;
        const point = (latitude: number, longitude: number): Point3 => [
          x + Math.cos(longitude) * Math.cos(latitude) * radius,
          y + Math.sin(latitude) * radius,
          z + Math.sin(longitude) * Math.cos(latitude) * radius,
        ];
        polygon([point(a, c), point(a, d), point(b, d), point(b, c)], color);
      }
    }
  }

  function pitchedRoof(x: number, y: number, z: number, width: number, depth: number, rise: number) {
    const l = x - width / 2, r = x + width / 2;
    const b = z - depth / 2, f = z + depth / 2;
    polygon([[l, y, f], [r, y, f], [r, y + rise, z], [l, y + rise, z]], roof);
    polygon([[r, y, b], [l, y, b], [l, y + rise, z], [r, y + rise, z]], roof);
    polygon([[l, y, b], [l, y, f], [l, y + rise, z]], cream);
    polygon([[r, y, f], [r, y, b], [r, y + rise, z]], cream);
    box(x, y + .01, f, width, .12, .12, railing);
    box(x, y + rise, z, width + .1, .1, .13, railing);
    for (let seam = l + .35; seam < r; seam += .5) {
      polygon([[seam, y + .025, f], [seam + .025, y + .025, f],
        [seam + .025, y + rise + .025, z], [seam, y + rise + .025, z]], "#c8664d");
    }
  }

  function windowPane(x: number, y: number, z: number, width: number, height: number) {
    box(x, y, z, width + .1, height + .1, .07, red);
    box(x, y, z + .05, width, height, .03, "#65736b");
    box(x, y, z + .09, .04, height, .025, cream);
    box(x, y, z + .09, width, .045, .025, cream);
  }

  function railings(x: number, y: number, z: number, width: number, height: number) {
    box(x, y + height, z, width, .065, .07, railing);
    box(x, y + .12, z, width, .055, .07, railing);
    for (let post = x - width / 2; post <= x + width / 2; post += .28) {
      box(post, y + height / 2, z, .035, height, .035, railing);
    }
  }

  function palm(x: number, z: number, height: number) {
    cylinder(x, .5, z, .105, height, "#a58860");
    for (let direction = 0; direction < 7; direction++) {
      const angle = direction * Math.PI * 2 / 7;
      const top: Point3 = [x, height + .65, z];
      const middle: Point3 = [x + Math.cos(angle) * .95, height + 1.08, z + Math.sin(angle) * .95];
      const end: Point3 = [x + Math.cos(angle) * 1.7, height + .3, z + Math.sin(angle) * 1.7];
      const offset: Point3 = [-Math.sin(angle) * .23, 0, Math.cos(angle) * .23];
      const left: Point3 = [middle[0] + offset[0], middle[1], middle[2] + offset[2]];
      const right: Point3 = [middle[0] - offset[0], middle[1], middle[2] - offset[2]];
      polygon([top, left, end, right], direction % 2 ? "#627a29" : "#7d9338");
    }
  }

  // Courtyard and shallow base of the architectural model.
  box(0, -.22, 1, 24, .44, 15, "#dfccac");
  box(0, .025, 2.1, 23.5, .05, 12, "#e5d8c3");
  for (let x = -11; x <= 11; x += 2.5) box(x, .057, 4.4, .018, .012, 7.8, "#cbbb9f");
  for (let z = .6; z < 8; z += 2) box(0, .057, z, 23.4, .012, .018, "#cbbb9f");
  faces.forEach((face) => { face.layer = -1; });

  // Taller entrance building and low classroom wing.
  box(-6.6, 2.8, -2.1, 6.2, 5.6, 5.8, cream);
  box(-6.6, .35, -2.1, 6.3, .7, 5.9, "#d8b79f");
  box(3.3, 1.5, -2.5, 13.6, 3, 4.9, cream);
  for (const level of [0, 2.8, 5.5]) box(-6.6, level + .1, -.7, 6.4, .14, 3.25, red);
  for (const x of [-9.6, -6.6, -3.6]) box(x, 2.8, .87, .13, 5.6, .16, red);
  railings(-6.6, 2.9, .94, 5.9, .8);
  for (const x of [-8.15, -5.05]) windowPane(x, 4.2, .84, 1.9, 1.1);
  for (let x = -2.3; x < 9.7; x += 2.25) {
    windowPane(x, 1.68, -.02, 1.45, 1.2);
    box(x - 1, 1.6, .18, .12, 3.2, .16, red);
  }
  pitchedRoof(-6.6, 5.65, -2.05, 6.9, 6.3, 1.2);
  pitchedRoof(3.3, 3.15, -2.45, 14.3, 5.6, 1.25);

  // Entrance gate, framed sign, and curved arch.
  railings(-6.5, .12, 1.55, 5.6, 2.55);
  box(-6.5, 1.45, 1.55, .075, 2.7, .1, "#493e31");
  for (const x of [-9.4, -3.6]) cylinder(x, .1, 1.55, .055, 4.35, "#493e31");
  for (let step = 0; step < 20; step++) {
    const a = step / 20 * Math.PI;
    const b = (step + 1) / 20 * Math.PI;
    polygon([
      [-6.5 + Math.cos(a) * 2.9, 4.3 + Math.sin(a) * .85, 1.55],
      [-6.5 + Math.cos(b) * 2.9, 4.3 + Math.sin(b) * .85, 1.55],
      [-6.5 + Math.cos(b) * 2.9, 4.37 + Math.sin(b) * .85, 1.55],
      [-6.5 + Math.cos(a) * 2.9, 4.37 + Math.sin(a) * .85, 1.55],
    ], "#493e31");
  }
  polygon([[-9.3, 3.55, 1.56], [-3.7, 3.55, 1.56], [-3.7, 4.25, 1.56], [-9.3, 4.25, 1.56]],
    "#9a642f", "Sto. Niño Catholic School");

  // Raised planting bed and tropical greenery.
  box(3.5, .35, 2.1, 12.5, .7, 1.5, "#bd8b70");
  box(3.5, .72, 2.1, 12.5, .08, 1.5, "#ac9b72");
  for (let x = -2; x <= 9; x += 1.4) {
    canopy(x, .8, 2.1, .5, "#718240");
    canopy(x, .8, 2.6, .36, "#7f8d40");
  }
  for (const x of [-1.6, 1.5, 4.6, 7.8]) {
    palm(x, 1.8, 3.5 + (x % 2) * .12);
    cylinder(x + .45, .8, 2.4, .045, .7, "#8b7952");
    canopy(x + .45, 1.1, 2.4, .62, "#627d34");
  }
  return faces;
}
