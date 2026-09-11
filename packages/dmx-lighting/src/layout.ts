/** Where a fixture sits on the stage, in whatever world units the rig is measured in. */
export interface Placement {
  position: [number, number, number]
  /** Euler XYZ in degrees; yaw (Y) is the one that matters for a top-down rig. */
  rotation: [number, number, number]
  /** Bounding size. A bar's pixels spread along local X across `size[0]`. */
  size: [number, number, number]
}

/** The rectangle spatial taps map onto, centred on the origin and viewed from above. */
export interface StageBounds {
  width: number
  depth: number
}

export const DEFAULT_STAGE: StageBounds = { width: 10, depth: 10 }

export const DEFAULT_PLACEMENT: Placement = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  size: [1, 0.1, 0.1],
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

/** Rotates a local offset by an Euler XYZ triple given in degrees. */
function rotate(
  x: number,
  y: number,
  z: number,
  rotation: [number, number, number],
): [number, number, number] {
  const [rx, ry, rz] = rotation.map(toRadians)

  const cx = Math.cos(rx)
  const sx = Math.sin(rx)
  let y1 = y * cx - z * sx
  let z1 = y * sx + z * cx

  const cy = Math.cos(ry)
  const sy = Math.sin(ry)
  let x1 = x * cy + z1 * sy
  z1 = -x * sy + z1 * cy

  const cz = Math.cos(rz)
  const sz = Math.sin(rz)
  const x2 = x1 * cz - y1 * sz
  y1 = x1 * sz + y1 * cz
  x1 = x2

  return [x1, y1, z1]
}

/**
 * World position of every pixel, spread evenly along the fixture's local X. Each pixel sits
 * at the centre of its share of the length, so a one-pixel fixture lands on its own centre.
 */
export function pixelWorldPositions(placement: Placement, pixels: number): Float32Array {
  const out = new Float32Array(Math.max(0, pixels) * 3)
  const length = placement.size[0]

  for (let p = 0; p < pixels; p++) {
    const t = pixels === 1 ? 0.5 : (p + 0.5) / pixels
    const localX = (t - 0.5) * length
    const [x, y, z] = rotate(localX, 0, 0, placement.rotation)
    out[p * 3] = placement.position[0] + x
    out[p * 3 + 1] = placement.position[1] + y
    out[p * 3 + 2] = placement.position[2] + z
  }

  return out
}

/** Normalises a world position onto the stage rectangle, looking down the Y axis. */
export function worldToUv(x: number, z: number, stage: StageBounds): [number, number] {
  const u = stage.width === 0 ? 0.5 : (x + stage.width / 2) / stage.width
  const v = stage.depth === 0 ? 0.5 : (z + stage.depth / 2) / stage.depth
  return [u, v]
}

/** Inverse of `worldToUv`, for dragging a fixture on the stage view. */
export function uvToWorld(u: number, v: number, stage: StageBounds): [number, number] {
  return [(u - 0.5) * stage.width, (v - 0.5) * stage.depth]
}

export function placementOf(placement: Placement | undefined): Placement {
  if (!placement) return DEFAULT_PLACEMENT
  return {
    position: placement.position ?? DEFAULT_PLACEMENT.position,
    rotation: placement.rotation ?? DEFAULT_PLACEMENT.rotation,
    size: placement.size ?? DEFAULT_PLACEMENT.size,
  }
}
