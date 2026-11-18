export type Point3 = [number, number, number];

export interface CampusFace {
  points: Point3[];
  color: string;
  label?: string;
}

export function createCampusModel(): CampusFace[] {
  const faces: CampusFace[] = [];
  const cream = "#e6e2d6";
  const white = "#f5f2e9";
  const stone = "#d7d2c7";
  const red = "#983a43";
  const roof = "#a0444c";
  const railing = "#a54a4e";

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

  function pitchedRoof(x: number, y: number, z: number, width: number, depth: number, rise: number, color = roof) {
    const l = x - width / 2, r = x + width / 2;
    const b = z - depth / 2, f = z + depth / 2;
    polygon([[l, y, f], [r, y, f], [r, y + rise, z], [l, y + rise, z]], color);
    polygon([[r, y, b], [l, y, b], [l, y + rise, z], [r, y + rise, z]], color);
    polygon([[l, y, b], [l, y, f], [l, y + rise, z]], cream);
    polygon([[r, y, f], [r, y, b], [r, y + rise, z]], cream);
    box(x, y + .01, f, width, .12, .12, railing);
    box(x, y + rise, z, width + .1, .1, .13, railing);
    for (let seam = l + .35; seam < r; seam += .5) {
      polygon([[seam, y + .025, f], [seam + .025, y + .025, f],
        [seam + .025, y + rise + .025, z], [seam, y + rise + .025, z]], "#b55f66");
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

  function archedOpening(x: number, bottom: number, z: number, width: number, height: number, color: string, trim = .12) {
    const radius = width / 2;
    const spring = bottom + height - radius;
    const opening: Point3[] = [[x - radius, bottom, z], [x + radius, bottom, z]];
    for (let step = 0; step <= 12; step++) {
      const angle = step / 12 * Math.PI;
      opening.push([x + Math.cos(angle) * radius, spring + Math.sin(angle) * radius, z]);
    }
    polygon(opening, color);
    for (let step = 0; step < 12; step++) {
      const a = step / 12 * Math.PI;
      const b = (step + 1) / 12 * Math.PI;
      polygon([
        [x + Math.cos(a) * radius, spring + Math.sin(a) * radius, z + .035],
        [x + Math.cos(b) * radius, spring + Math.sin(b) * radius, z + .035],
        [x + Math.cos(b) * (radius + trim), spring + Math.sin(b) * (radius + trim), z + .035],
        [x + Math.cos(a) * (radius + trim), spring + Math.sin(a) * (radius + trim), z + .035],
      ], white);
    }
    box(x - radius - trim / 2, (bottom + spring) / 2, z + .03, trim, spring - bottom, .12, white);
    box(x + radius + trim / 2, (bottom + spring) / 2, z + .03, trim, spring - bottom, .12, white);
  }

  function cross(x: number, y: number, z: number, height: number) {
    box(x, y + height / 2, z, .13, height, .13, white);
    box(x, y + height * .69, z, height * .65, .13, .13, white);
  }

  function statue(x: number, y: number, z: number, size = 1) {
    box(x, y, z, .47 * size, .13 * size, .36 * size, stone);
    polygon([[x - .22 * size, y + .06, z + .17], [x + .22 * size, y + .06, z + .17],
      [x + .11 * size, y + .68 * size, z + .17], [x - .1 * size, y + .68 * size, z + .17]], white);
    cylinder(x, y + .68 * size, z + .1, .11 * size, .19 * size, white, 8);
  }

  function tree(x: number, z: number, height: number, radius: number) {
    cylinder(x, .05, z, .14, height, "#7e6b52");
    canopy(x, height - radius * .55, z, radius, "#506440");
    canopy(x + radius * .35, height - radius * .25, z + .25, radius * .8, "#5b7145");
  }

  function classroomBlock(x: number, z: number, width: number, depth: number, height: number) {
    box(x, height / 2, z, width, height, depth, cream);
    const front = z + depth / 2 + .045;
    for (const level of [1.15, 3.15, 5.15]) {
      for (let windowX = x - width / 2 + .8; windowX < x + width / 2 - .35; windowX += 1.55) {
        windowPane(windowX, level, front, .98, .9);
      }
      box(x, level - .72, front + .08, width, .12, .32, white);
      railings(x, level - .62, front + .23, width - .1, .5);
    }
    pitchedRoof(x, height + .12, z, width + .65, depth + .6, .7);
  }

  function churchRoof(x: number, y: number, z: number, width: number, depth: number, rise: number) {
    const left = x - width / 2;
    const right = x + width / 2;
    const front = z + depth / 2;
    const back = z - depth / 2;
    polygon([[left, y, front], [x, y + rise, front], [x, y + rise, back], [left, y, back]], roof);
    polygon([[x, y + rise, front], [right, y, front], [right, y, back], [x, y + rise, back]], roof);
    polygon([[left, y, back], [x, y + rise, back], [right, y, back]], cream);
    for (let rib = back; rib < front; rib += .45) {
      polygon([[x, y + rise + .02, rib], [right, y + .02, rib],
        [right, y + .02, rib + .025], [x, y + rise + .02, rib + .025]], "#ad5660");
    }
  }

  // Approximate arrangement from the supplied aerial photograph.
  box(0, -.25, -1.5, 29.5, .5, 28, "#d7c5a9");
  box(0, .035, -1.5, 29.15, .07, 27.6, "#c9ccbf");
  box(-3, .1, 10.1, 18.5, .13, 4.3, "#bb7964");
  box(11.25, .11, .2, 5.3, .06, 23.7, "#b2b0a7");
  for (let z = -9; z < 10; z += 2.2) box(12.9, .15, z, 2.1, .018, .04, white);

  // Rear school wing and perpendicular building on the right.
  classroomBlock(-1.5, -12.4, 24, 3.5, 6.5);
  classroomBlock(10.8, -8.7, 4.4, 9.6, 6.5);
  polygon([[-11, 6.95, -11.55], [7.5, 6.95, -11.55], [7.5, 7.3, -12.15], [-11, 7.3, -12.15]],
    roof, "STO. NIÑO CATHOLIC SCHOOL");

  // Blue arched roof over the court behind the church.
  for (const x of [.5, 8.5]) {
    for (const z of [-8, -2.5]) cylinder(x, .15, z, .055, 3.9, "#858b83");
  }
  for (let segment = 0; segment < 12; segment++) {
    const a = segment / 12 * Math.PI;
    const b = (segment + 1) / 12 * Math.PI;
    polygon([
      [4.5 + Math.cos(a) * 4.3, 3.75 + Math.sin(a) * .9, -2.15],
      [4.5 + Math.cos(b) * 4.3, 3.75 + Math.sin(b) * .9, -2.15],
      [4.5 + Math.cos(b) * 4.3, 3.75 + Math.sin(b) * .9, -8.35],
      [4.5 + Math.cos(a) * 4.3, 3.75 + Math.sin(a) * .9, -8.35],
    ], segment < 6 ? "#9ccbd7" : "#b9e0e6");
  }

  // Church nave, stepped red roof, and broad white front facade.
  box(-4, 2.4, 1.6, 10.5, 4.8, 12.2, cream);
  churchRoof(-4, 4.95, 1.6, 11.2, 12.8, 2.5);
  box(-4, 3.1, 8.05, 14.5, 6.2, .65, white);
  box(-4, 6.9, 8.06, 7.6, 1.5, .75, white);
  polygon([[-7.8, 7.6, 8.46], [-.2, 7.6, 8.46], [-4, 9.6, 8.46]], white);
  polygon([[-7.25, 7.85, 8.49], [-.75, 7.85, 8.49], [-4, 9.22, 8.49]], stone);
  polygon([[-6.85, 7.97, 8.52], [-1.15, 7.97, 8.52], [-4, 9.02, 8.52]], white);
  box(-4, 7.65, 8.14, 7.95, .22, .95, white);
  box(-4, 6.16, 8.13, 14.9, .23, .9, white);
  box(-4, 5.92, 8.18, 14.6, .1, .95, stone);
  box(-4, 3.05, 8.2, 14.7, .21, 1.02, white);
  for (const x of [-10.75, -9.9, -7.75, -.25, 1.9, 2.75]) {
    box(x, 2.85, 8.49, .21, 5.5, .2, stone);
    box(x, 2.85, 8.61, .12, 5.35, .19, white);
    box(x, .25, 8.61, .42, .3, .34, white);
    box(x, 5.72, 8.61, .42, .2, .35, white);
  }

  // Three entry portals with projecting columns.
  box(-4, 1.4, 8.55, 7.1, 2.8, .7, stone);
  for (const x of [-6.25, -4, -1.75]) archedOpening(x, .12, 8.93, 1.62, 2.55, "#403b36", .14);
  for (const x of [-7.3, -5.2, -2.8, -.7]) {
    box(x, 1.4, 9.05, .2, 2.8, .4, white);
    box(x, .24, 9.08, .48, .3, .55, white);
    box(x, 2.69, 9.08, .44, .16, .55, white);
  }
  box(-4, 2.95, 8.74, 7.7, .23, 1.6, white);
  for (const x of [-8.75, .75]) {
    for (const y of [1.15, 3.8]) {
      archedOpening(x, y, 8.43, .65, 1.2, "#b7b4aa", .1);
      statue(x, y + .06, 8.58, .9);
    }
  }
  for (const x of [-6.65, -4, -1.35]) {
    archedOpening(x, 6.43, 8.49, .75, 1.18, "#b6b5ac", .1);
    statue(x, 6.48, 8.61, .85);
  }
  for (const x of [-7.7, -5.65, -2.35, -.3]) box(x, 6.98, 8.55, .14, 1.32, .2, stone);
  for (const x of [-10.7, 2.7]) {
    box(x, 6.4, 8.15, .6, .25, .6, white);
    statue(x, 6.54, 8.14, .85);
  }
  cylinder(-4, 9.57, 8.1, .12, .65, white, 8);
  cross(-4, 10.05, 8.1, .9);

  // Right bell tower with arched belfry and a faceted white dome.
  const towerX = 5.3;
  box(towerX, 3.9, 7.4, 2.75, 7.8, 2.7, white);
  for (const y of [.2, 3.6, 6.4, 7.9]) box(towerX, y, 7.4, 3.1, .22, 3.05, white);
  for (const x of [towerX - 1.15, towerX + 1.15]) box(x, 3.9, 8.83, .19, 7.5, .18, stone);
  archedOpening(towerX, .25, 8.79, 1.35, 2.8, "#969b94", .12);
  archedOpening(towerX, 4.05, 8.79, 1.22, 2.05, "#8c918c", .16);
  statue(towerX, 4.15, 8.92, 1.3);
  cylinder(towerX, 8.03, 7.4, 1.35, .3, white, 12);
  canopy(towerX, 8.28, 7.4, 1.34, white);
  cylinder(towerX, 9.55, 7.4, .2, .38, white, 8);
  cross(towerX, 9.86, 7.4, 1.22);

  // Trees screen the sides and connect the church with the school courtyard.
  for (const [x, z, h, r] of [
    [-12, -7, 5.2, 2], [-11, -2, 5.3, 2.1], [-12, 3.4, 4, 1.7],
    [-6, -8.4, 4.2, 1.8], [-1.6, -8.9, 4, 1.6], [8.1, -1.2, 3.8, 1.7],
    [8.8, 3.4, 3.6, 1.3], [-12, 9.2, 2.2, 1.3],
  ]) tree(x!, z!, h!, r!);
  box(5.3, 1.45, -.1, 3.8, 2.8, 2.4, "#bfc7ba");
  pitchedRoof(5.3, 2.95, -.1, 4.3, 2.8, .55, "#60796d");

  // Parking row seen along the right edge of the reference.
  for (let z = -1.5; z <= 7; z += 2.3) {
    box(12, .38, z, 1.6, .65, .88, "#e3e1d7");
    box(12, .79, z, .88, .3, .78, "#626b6b");
  }
  return faces;
}
