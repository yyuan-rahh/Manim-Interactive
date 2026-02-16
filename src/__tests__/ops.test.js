import { describe, it, expect } from 'vitest'
import { normalizeObjectProps, applyAgentOps } from '../agent/ops'
import { createEmptyProject } from '../project/schema'

describe('normalizeObjectProps', () => {
  it('maps fillColor to fill', () => {
    const result = normalizeObjectProps({ fillColor: '#ff0000' })
    expect(result.fill).toBe('#ff0000')
    expect(result.fillColor).toBeUndefined()
  })

  it('maps color to fill', () => {
    const result = normalizeObjectProps({ color: '#00ff00' })
    expect(result.fill).toBe('#00ff00')
    expect(result.color).toBeUndefined()
  })

  it('maps strokeColor to stroke', () => {
    const result = normalizeObjectProps({ strokeColor: '#0000ff' })
    expect(result.stroke).toBe('#0000ff')
    expect(result.strokeColor).toBeUndefined()
  })

  it('normalises CSS colour names to hex', () => {
    const result = normalizeObjectProps({ fill: 'red' })
    expect(result.fill).toBe('#ef4444')
  })

  it('does not overwrite existing fill with color alias', () => {
    const result = normalizeObjectProps({ fill: '#000000', fillColor: '#ffffff' })
    expect(result.fill).toBe('#000000')
  })

  it('returns null/undefined input as-is', () => {
    expect(normalizeObjectProps(null)).toBeNull()
    expect(normalizeObjectProps(undefined)).toBeUndefined()
  })
})

describe('applyAgentOps', () => {
  it('adds an object to a scene', () => {
    const project = createEmptyProject()
    const sceneId = project.scenes[0].id

    const ops = [
      {
        type: 'addObject',
        sceneId,
        object: {
          id: 'test-circle',
          type: 'circle',
          x: 0,
          y: 0,
          radius: 1,
          fill: '#3b82f6',
        },
      },
    ]

    const { project: result, warnings } = applyAgentOps(project, ops)
    expect(result.scenes[0].objects.length).toBe(1)
    expect(result.scenes[0].objects[0].type).toBe('circle')
    expect(warnings.length).toBe(0)
  })

  it('uses defaultSceneId when op has no sceneId', () => {
    const project = createEmptyProject()
    const sceneId = project.scenes[0].id

    const ops = [
      {
        type: 'addObject',
        object: {
          id: 'rect-1',
          type: 'rectangle',
          x: 0,
          y: 0,
          width: 2,
          height: 1,
        },
      },
    ]

    const { project: result } = applyAgentOps(project, ops, { defaultSceneId: sceneId })
    expect(result.scenes[0].objects.length).toBe(1)
  })

  it('updates an existing object', () => {
    const project = createEmptyProject()
    const sceneId = project.scenes[0].id
    project.scenes[0].objects = [
      { id: 'obj-1', type: 'circle', x: 0, y: 0, radius: 1 },
    ]

    const ops = [
      {
        type: 'updateObject',
        sceneId,
        objectId: 'obj-1',
        updates: { radius: 3, fill: '#ff0000' },
      },
    ]

    const { project: result } = applyAgentOps(project, ops)
    expect(result.scenes[0].objects[0].radius).toBe(3)
    expect(result.scenes[0].objects[0].fill).toBe('#ff0000')
  })

  it('deletes an object', () => {
    const project = createEmptyProject()
    const sceneId = project.scenes[0].id
    project.scenes[0].objects = [
      { id: 'obj-1', type: 'circle', x: 0, y: 0, radius: 1 },
      { id: 'obj-2', type: 'dot', x: 1, y: 1, radius: 0.08 },
    ]

    const ops = [{ type: 'deleteObject', sceneId, objectId: 'obj-1' }]
    const { project: result } = applyAgentOps(project, ops)
    expect(result.scenes[0].objects.length).toBe(1)
    expect(result.scenes[0].objects[0].id).toBe('obj-2')
  })

  it('warns on non-array ops', () => {
    const project = createEmptyProject()
    const { warnings } = applyAgentOps(project, 'not-an-array')
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('warns on unknown op type', () => {
    const project = createEmptyProject()
    const ops = [{ type: 'unknownOp' }]
    const { warnings } = applyAgentOps(project, ops)
    expect(warnings.some(w => w.includes('Skipped'))).toBe(true)
  })
})
