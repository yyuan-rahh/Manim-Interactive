import { describe, it, expect } from 'vitest'
import {
  snapToGrid,
  snapAngle,
  getVisibleObjectsAtTime,
  getObjectBounds,
  hypot,
  closestPointOnSegment,
} from '../components/canvas/constants'
import { snapPosition } from '../components/canvas/snapping'

describe('snapToGrid', () => {
  it('snaps to nearest 0.5 by default', () => {
    expect(snapToGrid(0.3)).toBe(0.5)
    expect(snapToGrid(0.7)).toBe(0.5)
    expect(snapToGrid(1.1)).toBe(1.0)
    expect(snapToGrid(1.8)).toBe(2.0)
  })

  it('snaps to custom grid size', () => {
    expect(snapToGrid(0.15, 0.25)).toBe(0.25)
    expect(snapToGrid(0.9, 1)).toBe(1)
  })
})

describe('snapAngle', () => {
  it('snaps to nearest 45 degrees', () => {
    expect(snapAngle(10)).toBe(0)
    expect(snapAngle(30)).toBe(45)
    expect(snapAngle(89)).toBe(90)
    expect(snapAngle(100)).toBe(90)
    expect(snapAngle(180)).toBe(180)
  })
})

describe('hypot', () => {
  it('calculates hypotenuse', () => {
    expect(hypot(3, 4)).toBe(5)
    expect(hypot(0, 0)).toBe(0)
  })
})

describe('closestPointOnSegment', () => {
  it('projects point onto horizontal segment', () => {
    const cp = closestPointOnSegment(0.5, 1, 0, 0, 1, 0)
    expect(cp.x).toBeCloseTo(0.5)
    expect(cp.y).toBeCloseTo(0)
  })

  it('clamps to segment endpoints', () => {
    const cp = closestPointOnSegment(5, 0, 0, 0, 1, 0)
    expect(cp.x).toBeCloseTo(1)
    expect(cp.y).toBeCloseTo(0)
  })
})

describe('getVisibleObjectsAtTime', () => {
  const objects = [
    { id: 'a', delay: 0, runTime: 2 },
    { id: 'b', delay: 1, runTime: 1 },
    { id: 'c', delay: 3, runTime: 1 },
  ]

  it('shows objects after their delay', () => {
    const vis = getVisibleObjectsAtTime(objects, 0.5)
    expect(vis.map(o => o.id)).toContain('a')
    expect(vis.map(o => o.id)).not.toContain('b')
  })

  it('hides objects after delay + runTime', () => {
    const vis = getVisibleObjectsAtTime(objects, 2.5)
    expect(vis.map(o => o.id)).not.toContain('a')
    expect(vis.map(o => o.id)).not.toContain('b')
    expect(vis.map(o => o.id)).not.toContain('c')
  })

  it('handles transform chains', () => {
    const objs = [
      { id: 'src', delay: 0, runTime: 1 },
      { id: 'tgt', delay: 1, runTime: 1, transformFromId: 'src' },
    ]
    const vis = getVisibleObjectsAtTime(objs, 1.5)
    expect(vis.map(o => o.id)).toContain('tgt')
    expect(vis.map(o => o.id)).not.toContain('src')
  })
})

describe('getObjectBounds', () => {
  it('computes rectangle bounds', () => {
    const b = getObjectBounds({ type: 'rectangle', x: 0, y: 0, width: 4, height: 2 })
    expect(b.minX).toBe(-2)
    expect(b.maxX).toBe(2)
    expect(b.minY).toBe(-1)
    expect(b.maxY).toBe(1)
  })

  it('computes circle bounds', () => {
    const b = getObjectBounds({ type: 'circle', x: 1, y: 2, radius: 3 })
    expect(b.minX).toBe(-2)
    expect(b.maxX).toBe(4)
    expect(b.minY).toBe(-1)
    expect(b.maxY).toBe(5)
  })
})

describe('snapPosition', () => {
  it('returns rounded values when snap disabled', () => {
    const pos = snapPosition(1.12345, 2.6789, false, [], 0)
    expect(pos.x).toBe(1.12)
    expect(pos.y).toBe(2.68)
  })

  it('snaps to grid when enabled', () => {
    const pos = snapPosition(0.48, 1.03, true, [], 0)
    expect(pos.x).toBe(0.5)
    expect(pos.y).toBe(1)
  })

  it('snaps to origin axes', () => {
    const pos = snapPosition(0.05, 0.05, true, [], 0)
    expect(pos.x).toBe(0)
    expect(pos.y).toBe(0)
  })
})
