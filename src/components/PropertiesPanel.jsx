import React, { useState, useEffect } from 'react'
import './PropertiesPanel.css'
import DesmosMathField from './DesmosMathField'
import { getObjectFullLabel, getObjectDisplayName } from '../utils/objectLabel'
import { getLinkingStatus as getLinkingStatusHelper } from '../utils/linking'
import { mathParser } from '../utils/mathParser'

// Controlled number input that allows editing
function NumberInput({ value, onChange, step = 0.1, min, max, ...props }) {
  const [localValue, setLocalValue] = useState(String(value ?? ''))
  
  // Sync with external value changes
  useEffect(() => {
    setLocalValue(String(value ?? ''))
  }, [value])
  
  const handleChange = (e) => {
    const val = e.target.value
    setLocalValue(val)
    
    // Only propagate valid numbers
    if (val === '' || val === '-') return
    const num = parseFloat(val)
    if (!isNaN(num)) {
      onChange(num)
    }
  }
  
  const handleBlur = () => {
    // On blur, reset to valid value if empty
    if (localValue === '' || localValue === '-') {
      setLocalValue(String(value ?? 0))
    }
  }
  
  return (
    <input
      type="text"
      inputMode="decimal"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      {...props}
    />
  )
}

function PropertiesPanel({ 
  object, 
  selectedObjects = [],
  scene,
  onUpdateObject, 
  onDeleteObject,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onSelectObjects
}) {
  const numSelected = selectedObjects?.length || 0
  const isMultiSelect = numSelected > 1
  
  if (!object && numSelected === 0) {
    return (
      <div className="properties-panel">
        <div className="panel-header">
          <h3>Properties</h3>
        </div>
        <div className="panel-empty">
          Select an object to edit its properties
        </div>
      </div>
    )
  }

  const handleChange = (key, value) => {
    if (isMultiSelect) {
      // Apply change to all selected objects
      selectedObjects.forEach(obj => {
        onUpdateObject(obj.id, { [key]: value })
      })
    } else {
      onUpdateObject(object.id, { [key]: value })
    }
  }

  const handleNumberChange = (key, value) => {
    handleChange(key, value)
  }

  const transformCandidates = (scene?.objects || []).filter(o => o.id !== object?.id)
  
  // For multi-select, check if all objects are the same type
  const allSameType = isMultiSelect ? selectedObjects.every(obj => obj.type === selectedObjects[0].type) : true
  const commonType = allSameType ? (isMultiSelect ? selectedObjects[0].type : object?.type) : null
  
  // Get linking status for warnings (only for single select)
  const linkingStatus = !isMultiSelect && object ? getLinkingStatusHelper(object) : { needsLink: false, missingLinks: [], eligibleTargets: [] }
  
  // Formula validation (only for single select)
  const [formulaValidation, setFormulaValidation] = useState({ valid: true, error: null })
  useEffect(() => {
    if (!isMultiSelect && object?.formula) {
      const validation = mathParser.validate(object.formula)
      setFormulaValidation(validation)
    } else {
      setFormulaValidation({ valid: true, error: null })
    }
  }, [object?.formula, isMultiSelect])
  
  // Check for discontinuity at cursor x0
  const [discontinuityWarning, setDiscontinuityWarning] = useState(null)
  useEffect(() => {
    if (object?.type === 'graphCursor' && object.graphId && object.x0 !== undefined) {
      const graph = (scene?.objects || []).find(o => o.id === object.graphId)
      if (graph?.formula) {
        const x0 = object.x0
        const y = mathParser.evaluate(graph.formula, x0)
        if (isNaN(y) || !isFinite(y)) {
          setDiscontinuityWarning(`Function undefined at x = ${x0.toFixed(2)}`)
        } else {
          // Check if it's near a known discontinuity (e.g., division by zero)
          const testNearby = [
            mathParser.evaluate(graph.formula, x0 + 0.0001),
            mathParser.evaluate(graph.formula, x0 - 0.0001)
          ]
          if (testNearby.some(val => isNaN(val) || !isFinite(val))) {
            setDiscontinuityWarning(`Function may be discontinuous near x = ${x0.toFixed(2)}`)
          } else {
            setDiscontinuityWarning(null)
          }
        }
      } else {
        setDiscontinuityWarning(null)
      }
    } else {
      setDiscontinuityWarning(null)
    }
  }, [object?.type, object?.graphId, object?.x0, scene?.objects])

  return (
    <div className="properties-panel">
      <div className="panel-header">
        <h3>{isMultiSelect ? `${numSelected} Objects Selected` : 'Properties'}</h3>
        <button 
          className="delete-btn"
          onClick={() => {
            if (isMultiSelect) {
              selectedObjects.forEach(obj => onDeleteObject(obj.id))
            } else {
              onDeleteObject(object.id)
            }
          }}
          title={isMultiSelect ? "Delete All Selected Objects" : "Delete Object"}
        >
          Delete {isMultiSelect ? `(${numSelected})` : ''}
        </button>
      </div>
      
      <div className="properties-content">
        {isMultiSelect && (
          <div className="panel-section" style={{ marginBottom: '16px', padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '4px' }}>
            <div style={{ fontSize: '13px', color: '#888', marginBottom: '8px' }}>
              Editing {numSelected} objects: {selectedObjects.map(obj => obj.type).join(', ')}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              Changes will apply to all selected objects
            </div>
          </div>
        )}
        
        {!isMultiSelect && (
          <div className="property-group">
            <label className="property-label">Type</label>
            <div className="property-value type-badge">{object.type}</div>
          </div>
        )}
        
        <div className="property-section-title">Layer Order</div>
        <div className="layer-controls">
          <button 
            className="layer-btn" 
            onClick={() => {
              if (isMultiSelect) {
                selectedObjects.forEach(obj => onBringToFront(obj.id))
              } else {
                onBringToFront(object.id)
              }
            }}
            title="Bring to Front"
          >
            Front
          </button>
          <button 
            className="layer-btn" 
            onClick={() => {
              if (isMultiSelect) {
                selectedObjects.forEach(obj => onBringForward(obj.id))
              } else {
                onBringForward(object.id)
              }
            }}
            title="Bring Forward"
          >
            Up
          </button>
          <button 
            className="layer-btn" 
            onClick={() => {
              if (isMultiSelect) {
                selectedObjects.forEach(obj => onSendBackward(obj.id))
              } else {
                onSendBackward(object.id)
              }
            }}
            title="Send Backward"
          >
            Down
          </button>
          <button 
            className="layer-btn" 
            onClick={() => {
              if (isMultiSelect) {
                selectedObjects.forEach(obj => onSendToBack(obj.id))
              } else {
                onSendToBack(object.id)
              }
            }}
            title="Send to Back"
          >
            Back
          </button>
        </div>
        
        {/* Common properties for all objects or same-type multi-select */}
        {(commonType === 'rectangle' || (!allSameType && !isMultiSelect && object?.type === 'rectangle')) && (
          <div className="property-row">
            <div className="property-group">
              <label className="property-label">Width</label>
              <NumberInput
                value={isMultiSelect ? selectedObjects[0].width : object.width}
                onChange={(val) => handleNumberChange('width', val)}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Height</label>
              <NumberInput
                value={isMultiSelect ? selectedObjects[0].height : object.height}
                onChange={(val) => handleNumberChange('height', val)}
              />
            </div>
          </div>
        )}
        
        {((commonType === 'circle' || commonType === 'dot') || (!allSameType && !isMultiSelect && (object?.type === 'circle' || object?.type === 'dot'))) && (
          <div className="property-group">
            <label className="property-label">Radius</label>
            <NumberInput
              value={isMultiSelect ? selectedObjects[0].radius : object.radius}
              onChange={(val) => handleNumberChange('radius', val)}
            />
          </div>
        )}
        
        {/* Hide complex type-specific properties for multi-select */}
        {!isMultiSelect && object?.type === 'triangle' && (
          <>
            <div className="property-section-title">Vertices (relative to center)</div>
            {(object.vertices || []).map((vertex, idx) => {
              // Calculate side length to next vertex
              const nextIdx = (idx + 1) % object.vertices.length
              const nextVertex = object.vertices[nextIdx]
              const sideLength = Math.sqrt(
                Math.pow(nextVertex.x - vertex.x, 2) + 
                Math.pow(nextVertex.y - vertex.y, 2)
              ).toFixed(2)
              
              return (
                <div key={idx}>
                  <div className="property-row">
                    <div className="property-group">
                      <label className="property-label">V{idx + 1} X</label>
                      <NumberInput
                        value={vertex.x}
                        onChange={(val) => {
                          const newVerts = [...(object.vertices || [])]
                          newVerts[idx] = { ...newVerts[idx], x: val }
                          handleChange('vertices', newVerts)
                        }}
                      />
                    </div>
                    <div className="property-group">
                      <label className="property-label">V{idx + 1} Y</label>
                      <NumberInput
                        value={vertex.y}
                        onChange={(val) => {
                          const newVerts = [...(object.vertices || [])]
                          newVerts[idx] = { ...newVerts[idx], y: val }
                          handleChange('vertices', newVerts)
                        }}
                      />
                    </div>
                  </div>
                  <div className="property-info">
                    Side {idx + 1}-{nextIdx + 1}: {sideLength} units
                  </div>
                </div>
              )
            })}
          </>
        )}
        
        {!isMultiSelect && object?.type === 'polygon' && (
          <>
            <div className="property-group">
              <label className="property-label">Sides</label>
              <NumberInput
                value={object.sides || (object.vertices?.length || 5)}
                onChange={(val) => {
                  const numSides = Math.max(3, Math.round(val))
                  // Generate new regular polygon vertices
                  const radius = object.radius || 1
                  const newVerts = []
                  for (let i = 0; i < numSides; i++) {
                    const angle = (i / numSides) * Math.PI * 2 - Math.PI / 2
                    newVerts.push({
                      x: parseFloat((Math.cos(angle) * radius).toFixed(2)),
                      y: parseFloat((Math.sin(angle) * radius).toFixed(2))
                    })
                  }
                  handleChange('vertices', newVerts)
                  handleChange('sides', numSides)
                }}
              />
            </div>
            <div className="property-section-title">Vertices (relative to center)</div>
            {(object.vertices || []).map((vertex, idx) => {
              // Calculate side length to next vertex
              const nextIdx = (idx + 1) % object.vertices.length
              const nextVertex = object.vertices[nextIdx]
              const sideLength = Math.sqrt(
                Math.pow(nextVertex.x - vertex.x, 2) + 
                Math.pow(nextVertex.y - vertex.y, 2)
              ).toFixed(2)
              
              return (
                <div key={idx}>
                  <div className="property-row">
                    <div className="property-group">
                      <label className="property-label">V{idx + 1} X</label>
                      <NumberInput
                        value={vertex.x}
                        onChange={(val) => {
                          const newVerts = [...(object.vertices || [])]
                          newVerts[idx] = { ...newVerts[idx], x: val }
                          handleChange('vertices', newVerts)
                        }}
                      />
                    </div>
                    <div className="property-group">
                      <label className="property-label">V{idx + 1} Y</label>
                      <NumberInput
                        value={vertex.y}
                        onChange={(val) => {
                          const newVerts = [...(object.vertices || [])]
                          newVerts[idx] = { ...newVerts[idx], y: val }
                          handleChange('vertices', newVerts)
                        }}
                      />
                    </div>
                  </div>
                  <div className="property-info">
                    Side {idx + 1}-{(nextIdx === 0 ? object.vertices.length : nextIdx + 1)}: {sideLength} units
                  </div>
                </div>
              )
            })}
          </>
        )}
        
        {(object.type === 'line' || object.type === 'arrow') && (
          <div className="property-row">
            <div className="property-group">
              <label className="property-label">End X</label>
              <NumberInput
                value={object.x2}
                onChange={(val) => handleNumberChange('x2', val)}
              />
            </div>
            <div className="property-group">
              <label className="property-label">End Y</label>
              <NumberInput
                value={object.y2}
                onChange={(val) => handleNumberChange('y2', val)}
              />
            </div>
          </div>
        )}

        {object.type === 'arc' && (
          <>
            <div className="property-section-title">Arc</div>
            <div className="property-row">
              <div className="property-group">
                <label className="property-label">End X</label>
                <NumberInput value={object.x2} onChange={(val) => handleNumberChange('x2', val)} />
              </div>
              <div className="property-group">
                <label className="property-label">End Y</label>
                <NumberInput value={object.y2} onChange={(val) => handleNumberChange('y2', val)} />
              </div>
            </div>
            <div className="property-row">
              <div className="property-group">
                <label className="property-label">Control X</label>
                <NumberInput value={object.cx} onChange={(val) => handleNumberChange('cx', val)} />
              </div>
              <div className="property-group">
                <label className="property-label">Control Y</label>
                <NumberInput value={object.cy} onChange={(val) => handleNumberChange('cy', val)} />
              </div>
            </div>
          </>
        )}
        
        {object.type === 'text' && (
          <>
            <div className="property-group">
              <label className="property-label">Text</label>
              <input
                type="text"
                value={object.text || ''}
                onChange={(e) => handleChange('text', e.target.value)}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Font Size</label>
              <NumberInput
                value={object.fontSize || 48}
                onChange={(val) => handleNumberChange('fontSize', Math.round(val))}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Width</label>
              <NumberInput
                value={object.width || 2}
                onChange={(val) => handleNumberChange('width', Math.max(0.2, val))}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Height</label>
              <NumberInput
                value={object.height || 0.8}
                onChange={(val) => handleNumberChange('height', Math.max(0.2, val))}
              />
            </div>
          </>
        )}
        
        {object.type === 'latex' && (
          <div className="property-group">
            <label className="property-label">LaTeX</label>
            <DesmosMathField
              value={object.latex || ''}
              onChange={(latex) => handleChange('latex', latex)}
              placeholder="Type LaTeX…"
            />
          </div>
        )}

        {object.type === 'axes' && (
          <>
            <div className="property-section-title">Axes</div>
            <div className="property-row">
              <div className="property-group">
                <label className="property-label">X Length</label>
                <NumberInput value={object.xLength || 8} onChange={(val) => handleNumberChange('xLength', Math.max(0.5, val))} />
              </div>
              <div className="property-group">
                <label className="property-label">Y Length</label>
                <NumberInput value={object.yLength || 4} onChange={(val) => handleNumberChange('yLength', Math.max(0.5, val))} />
              </div>
            </div>
            <div className="property-row">
              <div className="property-group">
                <label className="property-label">X Min</label>
                <NumberInput
                  value={object.xRange?.min ?? -5}
                  onChange={(val) => handleChange('xRange', { ...object.xRange, min: val, max: object.xRange?.max ?? 5, step: object.xRange?.step ?? 1 })}
                />
              </div>
              <div className="property-group">
                <label className="property-label">X Max</label>
                <NumberInput
                  value={object.xRange?.max ?? 5}
                  onChange={(val) => handleChange('xRange', { ...object.xRange, min: object.xRange?.min ?? -5, max: val, step: object.xRange?.step ?? 1 })}
                />
              </div>
            </div>
            <div className="property-row">
              <div className="property-group">
                <label className="property-label">Y Min</label>
                <NumberInput
                  value={object.yRange?.min ?? -3}
                  onChange={(val) => handleChange('yRange', { ...object.yRange, min: val, max: object.yRange?.max ?? 3, step: object.yRange?.step ?? 1 })}
                />
              </div>
              <div className="property-group">
                <label className="property-label">Y Max</label>
                <NumberInput
                  value={object.yRange?.max ?? 3}
                  onChange={(val) => handleChange('yRange', { ...object.yRange, min: object.yRange?.min ?? -3, max: val, step: object.yRange?.step ?? 1 })}
                />
              </div>
            </div>
            <div className="property-group">
              <label className="property-label">
                <input
                  type="checkbox"
                  checked={object.showTicks ?? true}
                  onChange={(e) => handleChange('showTicks', e.target.checked)}
                />
                Show Ticks
              </label>
            </div>
            <div className="property-row">
              <div className="property-group">
                <label className="property-label">X-Axis Label</label>
                <input
                  type="text"
                  value={object.xLabel || 'x'}
                  onChange={(e) => handleChange('xLabel', e.target.value)}
                  placeholder="x"
                />
              </div>
              <div className="property-group">
                <label className="property-label">Y-Axis Label</label>
                <input
                  type="text"
                  value={object.yLabel || 'y'}
                  onChange={(e) => handleChange('yLabel', e.target.value)}
                  placeholder="y"
                />
              </div>
            </div>
          </>
        )}

        {object.type === 'graph' && (
          <>
            <div className="property-section-title">Linking</div>
            <div className="property-group">
              <label className="property-label">Link to Axes</label>
              <select
                value={object.axesId || ''}
                onChange={(e) => handleChange('axesId', e.target.value || null)}
                className="animation-select"
              >
                <option value="">(none - creates own axes)</option>
                {(scene?.objects || [])
                  .filter(o => o.type === 'axes' && o.id !== object.id)
                  .map(axes => {
                    const label = getObjectFullLabel(axes, scene?.objects || [])
                    return (
                      <option key={axes.id} value={axes.id}>
                        {label}
                      </option>
                    )
                  })
                }
              </select>
              {object.axesId && (
                <div className="property-info" style={{ color: '#4ade80', marginTop: '4px' }}>
                  ✓ Linked to axes. Moving this graph shifts it relative to the axes origin.
                </div>
              )}
              {!object.axesId && (
                <div className="property-info" style={{ color: '#fbbf24', marginTop: '4px' }}>
                  ⚠ Graph will create its own axes when rendered. Link to existing axes to use only one set.
                </div>
              )}
            </div>
            
            <div className="property-section-title">Math</div>
            <div className="property-group">
              <label className="property-label">Function f(x)</label>
              <DesmosMathField
                value={object.formula || 'x^2'}
                onChange={(latex) => handleChange('formula', latex)}
                placeholder="Enter function: x^2, sin(x), etc."
              />
              {formulaValidation.valid ? (
                <div className="property-info" style={{ color: '#4ade80' }}>
                  ✓ Valid
                </div>
              ) : (
                <div className="property-info" style={{ color: '#ef4444' }}>
                  ✗ Invalid: {formulaValidation.error}
                </div>
              )}
              <div className="property-info">
                Examples: x^2, sin(x), cos(x), exp(x), sqrt(x), x^3 - 2*x
              </div>
            </div>
            <div className="property-row">
              <div className="property-group">
                <label className="property-label">X Min</label>
                <NumberInput
                  value={object.xRange?.min ?? -5}
                  onChange={(val) => handleChange('xRange', { ...object.xRange, min: val, max: object.xRange?.max ?? 5 })}
                />
              </div>
              <div className="property-group">
                <label className="property-label">X Max</label>
                <NumberInput
                  value={object.xRange?.max ?? 5}
                  onChange={(val) => handleChange('xRange', { ...object.xRange, min: object.xRange?.min ?? -5, max: val })}
                />
              </div>
            </div>
            <div className="property-row">
              <div className="property-group">
                <label className="property-label">Y Min</label>
                <NumberInput
                  value={object.yRange?.min ?? -3}
                  onChange={(val) => handleChange('yRange', { ...object.yRange, min: val, max: object.yRange?.max ?? 3 })}
                />
              </div>
              <div className="property-group">
                <label className="property-label">Y Max</label>
                <NumberInput
                  value={object.yRange?.max ?? 3}
                  onChange={(val) => handleChange('yRange', { ...object.yRange, min: object.yRange?.min ?? -3, max: val })}
                />
              </div>
            </div>
            <div className="property-section-title">Linking</div>
            <div className="property-group">
              <label className="property-label">Link to Axes (optional)</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select
                  value={object.axesId || ''}
                  onChange={(e) => handleChange('axesId', e.target.value || null)}
                  className="animation-select"
                  style={{ flex: 1 }}
                >
                  <option value="">(none - independent)</option>
                  {(scene?.objects || [])
                    .filter(o => o.type === 'axes' && o.id !== object.id)
                    .map(axes => (
                      <option key={axes.id} value={axes.id}>
                        {getObjectFullLabel(axes, scene?.objects || [])}
                      </option>
                    ))
                  }
                </select>
                {object.axesId && onSelectObjects && (
                  <button
                    onClick={() => onSelectObjects([object.axesId])}
                    title="Jump to linked axes"
                    style={{ padding: '4px 8px', fontSize: '12px' }}
                  >
                    →
                  </button>
                )}
              </div>
              <div className="property-info">
                Link to an axes object to automatically use its range and position
              </div>
            </div>
          </>
        )}

        {object.type === 'graphCursor' && (
          <>
            <div className="property-section-title">Linking</div>
            {linkingStatus.needsLink && linkingStatus.missingLinks.includes('graphId') && (
              <div className="property-warning" style={{ background: '#fef3c7', color: '#92400e', padding: '8px', borderRadius: '4px', marginBottom: '12px' }}>
                ⚠ Select a Graph to activate this tool. Use link mode on canvas or select from dropdown below.
              </div>
            )}
            <div className="property-group">
              <label className="property-label">Link to Graph</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select
                  value={object.graphId || ''}
                  onChange={(e) => handleChange('graphId', e.target.value || null)}
                  className="animation-select"
                  style={{ flex: 1 }}
                >
                  <option value="">(none - select a graph)</option>
                  {(scene?.objects || [])
                    .filter(o => o.type === 'graph' && o.id !== object.id)
                    .map(graph => (
                      <option key={graph.id} value={graph.id}>
                        {getObjectFullLabel(graph, scene?.objects || [])}
                      </option>
                    ))
                  }
                </select>
                {object.graphId && onSelectObjects && (
                  <button
                    onClick={() => onSelectObjects([object.graphId])}
                    title="Jump to linked graph"
                    style={{ padding: '4px 8px', fontSize: '12px' }}
                  >
                    →
                  </button>
                )}
              </div>
            </div>
            <div className="property-group">
              <label className="property-label">Link to Axes (optional)</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select
                  value={object.axesId || ''}
                  onChange={(e) => handleChange('axesId', e.target.value || null)}
                  className="animation-select"
                  style={{ flex: 1 }}
                >
                  <option value="">(none)</option>
                  {(scene?.objects || [])
                    .filter(o => o.type === 'axes' && o.id !== object.id)
                    .map(axes => (
                      <option key={axes.id} value={axes.id}>
                        {getObjectFullLabel(axes, scene?.objects || [])}
                      </option>
                    ))
                  }
                </select>
                {object.axesId && onSelectObjects && (
                  <button
                    onClick={() => onSelectObjects([object.axesId])}
                    title="Jump to linked axes"
                    style={{ padding: '4px 8px', fontSize: '12px' }}
                  >
                    →
                  </button>
                )}
              </div>
            </div>
            {discontinuityWarning && (
              <div className="property-warning" style={{ background: '#fee2e2', color: '#991b1b', padding: '8px', borderRadius: '4px', marginBottom: '12px' }}>
                ⚠ {discontinuityWarning}
              </div>
            )}
            <div className="property-section-title">Math</div>
            <div className="property-group">
              <label className="property-label">X Position (x0)</label>
              <NumberInput
                value={object.x0 ?? 0}
                onChange={(val) => handleChange('x0', val)}
                step={0.1}
              />
            </div>
            <div className="property-section-title">Appearance</div>
            <div className="property-group">
              <label className="property-label">
                <input
                  type="checkbox"
                  checked={object.showCrosshair ?? true}
                  onChange={(e) => handleChange('showCrosshair', e.target.checked)}
                />
                Show Crosshair
              </label>
            </div>
            <div className="property-group">
              <label className="property-label">
                <input
                  type="checkbox"
                  checked={object.showDot ?? true}
                  onChange={(e) => handleChange('showDot', e.target.checked)}
                />
                Show Dot
              </label>
            </div>
            <div className="property-group">
              <label className="property-label">
                <input
                  type="checkbox"
                  checked={object.showLabel ?? false}
                  onChange={(e) => handleChange('showLabel', e.target.checked)}
                />
                Show Label
              </label>
            </div>
          </>
        )}

        {object.type === 'tangentLine' && (
          <>
            <div className="property-section-title">Tangent Line</div>
            {linkingStatus.needsLink && (
              <div className="property-warning" style={{ background: '#fef3c7', color: '#92400e', padding: '8px', borderRadius: '4px', marginBottom: '12px' }}>
                ⚠ Link to a Graph Cursor (preferred) or Graph to activate. Use link mode on canvas or select below.
              </div>
            )}
            <div className="property-group">
              <label className="property-label">Link to Graph</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select
                  value={object.graphId || ''}
                  onChange={(e) => handleChange('graphId', e.target.value || null)}
                  className="animation-select"
                  style={{ flex: 1 }}
                >
                  <option value="">(none - select a graph)</option>
                  {(scene?.objects || [])
                    .filter(o => o.type === 'graph' && o.id !== object.id)
                    .map(graph => (
                      <option key={graph.id} value={graph.id}>
                        {getObjectFullLabel(graph, scene?.objects || [])}
                      </option>
                    ))
                  }
                </select>
                {object.graphId && onSelectObjects && (
                  <button
                    onClick={() => onSelectObjects([object.graphId])}
                    title="Jump to linked graph"
                    style={{ padding: '4px 8px', fontSize: '12px' }}
                  >
                    →
                  </button>
                )}
              </div>
            </div>
            <div className="property-group">
              <label className="property-label">Link to Cursor (preferred)</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select
                  value={object.cursorId || ''}
                  onChange={(e) => handleChange('cursorId', e.target.value || null)}
                  className="animation-select"
                  style={{ flex: 1 }}
                >
                  <option value="">(none - use direct x0)</option>
                  {(scene?.objects || [])
                    .filter(o => o.type === 'graphCursor' && o.id !== object.id)
                    .map(cursor => (
                      <option key={cursor.id} value={cursor.id}>
                        {getObjectFullLabel(cursor, scene?.objects || [])}
                      </option>
                    ))
                  }
                </select>
                {object.cursorId && onSelectObjects && (
                  <button
                    onClick={() => onSelectObjects([object.cursorId])}
                    title="Jump to linked cursor"
                    style={{ padding: '4px 8px', fontSize: '12px' }}
                  >
                    →
                  </button>
                )}
              </div>
            </div>
            <div className="property-group">
              <label className="property-label">Link to Axes (optional)</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select
                  value={object.axesId || ''}
                  onChange={(e) => handleChange('axesId', e.target.value || null)}
                  className="animation-select"
                  style={{ flex: 1 }}
                >
                  <option value="">(none)</option>
                  {(scene?.objects || [])
                    .filter(o => o.type === 'axes' && o.id !== object.id)
                    .map(axes => (
                      <option key={axes.id} value={axes.id}>
                        {getObjectFullLabel(axes, scene?.objects || [])}
                      </option>
                    ))
                  }
                </select>
                {object.axesId && onSelectObjects && (
                  <button
                    onClick={() => onSelectObjects([object.axesId])}
                    title="Jump to linked axes"
                    style={{ padding: '4px 8px', fontSize: '12px' }}
                  >
                    →
                  </button>
                )}
              </div>
            </div>
            {!object.cursorId && (
              <div className="property-group">
                <label className="property-label">X Position (x0)</label>
                <NumberInput
                  value={object.x0 ?? 0}
                  onChange={(val) => handleChange('x0', val)}
                  step={0.1}
                />
              </div>
            )}
            <div className="property-group">
              <label className="property-label">Derivative Step (h)</label>
              <NumberInput
                value={object.derivativeStep ?? 0.001}
                onChange={(val) => handleChange('derivativeStep', val)}
                step={0.0001}
                min={0.0001}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Visible Span</label>
              <NumberInput
                value={object.visibleSpan ?? 2}
                onChange={(val) => handleChange('visibleSpan', val)}
                step={0.1}
                min={0.1}
              />
            </div>
            <div className="property-group">
              <label className="property-label">
                <input
                  type="checkbox"
                  checked={object.showSlopeLabel ?? true}
                  onChange={(e) => handleChange('showSlopeLabel', e.target.checked)}
                />
                Show Slope Label
              </label>
            </div>
          </>
        )}

        {object.type === 'limitProbe' && (
          <>
            <div className="property-section-title">Limit Probe</div>
            <div className="property-group">
              <label className="property-label">Link to Graph</label>
              <select
                value={object.graphId || ''}
                onChange={(e) => handleChange('graphId', e.target.value || null)}
                className="animation-select"
              >
                <option value="">(none - select a graph)</option>
                {(scene?.objects || [])
                  .filter(o => o.type === 'graph' && o.id !== object.id)
                  .map(graph => (
                    <option key={graph.id} value={graph.id}>
                      Graph: {graph.formula || 'f(x)'}
                    </option>
                  ))
                }
              </select>
            </div>
            <div className="property-group">
              <label className="property-label">Link to Cursor (optional)</label>
              <select
                value={object.cursorId || ''}
                onChange={(e) => handleChange('cursorId', e.target.value || null)}
                className="animation-select"
              >
                <option value="">(none - use direct x0)</option>
                {(scene?.objects || [])
                  .filter(o => o.type === 'graphCursor' && o.id !== object.id)
                  .map(cursor => (
                    <option key={cursor.id} value={cursor.id}>
                      Cursor at x={cursor.x0 ?? 0}
                    </option>
                  ))
                }
              </select>
            </div>
            <div className="property-group">
              <label className="property-label">Link to Axes (optional)</label>
              <select
                value={object.axesId || ''}
                onChange={(e) => handleChange('axesId', e.target.value || null)}
                className="animation-select"
              >
                <option value="">(none)</option>
                {(scene?.objects || [])
                  .filter(o => o.type === 'axes' && o.id !== object.id)
                  .map(axes => (
                    <option key={axes.id} value={axes.id}>
                      Axes at ({axes.x}, {axes.y})
                    </option>
                  ))
                }
              </select>
            </div>
            {!object.cursorId && (
              <div className="property-group">
                <label className="property-label">X Position (x0)</label>
                <NumberInput
                  value={object.x0 ?? 0}
                  onChange={(val) => handleChange('x0', val)}
                  step={0.1}
                />
              </div>
            )}
            <div className="property-group">
              <label className="property-label">Direction</label>
              <select
                value={object.direction || 'both'}
                onChange={(e) => handleChange('direction', e.target.value)}
                className="animation-select"
              >
                <option value="left">Left only</option>
                <option value="right">Right only</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div className="property-group">
              <label className="property-label">
                <input
                  type="checkbox"
                  checked={object.showPoints ?? true}
                  onChange={(e) => handleChange('showPoints', e.target.checked)}
                />
                Show Points
              </label>
            </div>
            <div className="property-group">
              <label className="property-label">
                <input
                  type="checkbox"
                  checked={object.showArrow ?? true}
                  onChange={(e) => handleChange('showArrow', e.target.checked)}
                />
                Show Arrows
              </label>
            </div>
            <div className="property-group">
              <label className="property-label">
                <input
                  type="checkbox"
                  checked={object.showReadout ?? true}
                  onChange={(e) => handleChange('showReadout', e.target.checked)}
                />
                Show Readout
              </label>
            </div>
          </>
        )}

        {object.type === 'valueLabel' && (
          <>
            <div className="property-section-title">Value Label</div>
            <div className="property-group">
              <label className="property-label">Link to Graph (optional)</label>
              <select
                value={object.graphId || ''}
                onChange={(e) => handleChange('graphId', e.target.value || null)}
                className="animation-select"
              >
                <option value="">(none)</option>
                {(scene?.objects || [])
                  .filter(o => o.type === 'graph' && o.id !== object.id)
                  .map(graph => (
                    <option key={graph.id} value={graph.id}>
                      Graph: {graph.formula || 'f(x)'}
                    </option>
                  ))
                }
              </select>
            </div>
            <div className="property-group">
              <label className="property-label">Link to Cursor (optional)</label>
              <select
                value={object.cursorId || ''}
                onChange={(e) => handleChange('cursorId', e.target.value || null)}
                className="animation-select"
              >
                <option value="">(none)</option>
                {(scene?.objects || [])
                  .filter(o => o.type === 'graphCursor' && o.id !== object.id)
                  .map(cursor => (
                    <option key={cursor.id} value={cursor.id}>
                      Cursor at x={cursor.x0 ?? 0}
                    </option>
                  ))
                }
              </select>
            </div>
            <div className="property-group">
              <label className="property-label">Value Type</label>
              <select
                value={object.valueType || 'slope'}
                onChange={(e) => handleChange('valueType', e.target.value)}
                className="animation-select"
              >
                <option value="slope">Slope</option>
                <option value="x">X Value</option>
                <option value="y">Y Value</option>
                <option value="custom">Custom Expression</option>
              </select>
            </div>
            {object.valueType === 'custom' && (
              <div className="property-group">
                <label className="property-label">Custom Expression</label>
                <input
                  type="text"
                  value={object.customExpression || ''}
                  onChange={(e) => handleChange('customExpression', e.target.value)}
                  placeholder="Enter custom text"
                />
              </div>
            )}
            <div className="property-group">
              <label className="property-label">Label Prefix</label>
              <input
                type="text"
                value={object.labelPrefix || ''}
                onChange={(e) => handleChange('labelPrefix', e.target.value)}
                placeholder="m = "
              />
            </div>
            <div className="property-group">
              <label className="property-label">Label Suffix</label>
              <input
                type="text"
                value={object.labelSuffix || ''}
                onChange={(e) => handleChange('labelSuffix', e.target.value)}
                placeholder=""
              />
            </div>
            <div className="property-group">
              <label className="property-label">Font Size</label>
              <NumberInput
                value={object.fontSize ?? 24}
                onChange={(val) => handleChange('fontSize', val)}
                step={2}
                min={8}
                max={72}
              />
            </div>
            <div className="property-group">
              <label className="property-label">
                <input
                  type="checkbox"
                  checked={object.showBackground ?? false}
                  onChange={(e) => handleChange('showBackground', e.target.checked)}
                />
                Show Background
              </label>
            </div>
          </>
        )}
        
        {/* Transform linking (timeline snap) */}
        {object.transformFromId && (
          <>
            <div className="property-section-title">Transform</div>

            <div className="property-group">
              <label className="property-label">From</label>
              <select
                value={object.transformFromId || ''}
                onChange={(e) => handleChange('transformFromId', e.target.value || null)}
                className="animation-select"
              >
                <option value="">(none)</option>
                {transformCandidates.map(src => (
                  <option key={src.id} value={src.id}>
                    {src.type}{src.text ? `: ${src.text}` : src.latex ? `: ${src.latex}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="property-group">
              <label className="property-label">Transform Type</label>
              <select
                value={object.transformType || 'Transform'}
                onChange={(e) => handleChange('transformType', e.target.value)}
                className="animation-select"
              >
                <option value="Transform">Transform</option>
                <option value="ReplacementTransform">ReplacementTransform</option>
                <option value="TransformMatchingShapes">TransformMatchingShapes</option>
                <option value="FadeTransform">FadeTransform</option>
              </select>
              <div className="property-info">
                Drag a clip onto another row and release near the end to link. This clip will then morph from the chosen source at its start time.
              </div>
            </div>

            <div className="property-group">
              <button
                className="action-btn cancel-btn"
                onClick={() => {
                  onUpdateObject?.(object.id, { transformFromId: null, transformType: undefined })
                }}
              >
                ✕ Unlink Transform
              </button>
            </div>
          </>
        )}

        <div className="property-section-title">Transform</div>
        
        <div className="property-row">
          <div className="property-group">
            <label className="property-label">Position X</label>
            <NumberInput
              value={isMultiSelect ? (selectedObjects[0].x || 0) : (object.x || 0)}
              onChange={(val) => handleNumberChange('x', val)}
            />
          </div>
          <div className="property-group">
            <label className="property-label">Position Y</label>
            <NumberInput
              value={isMultiSelect ? (selectedObjects[0].y || 0) : (object.y || 0)}
              onChange={(val) => handleNumberChange('y', val)}
            />
          </div>
        </div>
        
        <div className="property-group">
          <label className="property-label">Rotation (°)</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => {
                const currentRot = isMultiSelect ? (selectedObjects[0].rotation || 0) : (object.rotation || 0)
                handleNumberChange('rotation', currentRot - 15)
              }}
              style={{ padding: '4px 8px', cursor: 'pointer' }}
              title="Rotate -15°"
            >
              -15°
            </button>
            <NumberInput
              value={isMultiSelect ? (selectedObjects[0].rotation || 0) : (object.rotation || 0)}
              onChange={(val) => handleNumberChange('rotation', val)}
              style={{ flex: 1 }}
            />
            <button
              onClick={() => {
                const currentRot = isMultiSelect ? (selectedObjects[0].rotation || 0) : (object.rotation || 0)
                handleNumberChange('rotation', currentRot + 15)
              }}
              style={{ padding: '4px 8px', cursor: 'pointer' }}
              title="Rotate +15°"
            >
              +15°
            </button>
          </div>
        </div>
        
        <div className="property-group">
          <label className="property-label">Opacity</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={isMultiSelect ? (selectedObjects[0].opacity ?? 1) : (object.opacity ?? 1)}
            onChange={(e) => handleNumberChange('opacity', parseFloat(e.target.value))}
          />
          <span className="range-value">{(isMultiSelect ? (selectedObjects[0].opacity ?? 1) : (object.opacity ?? 1)).toFixed(1)}</span>
        </div>
        
        <div className="property-section-title">Appearance</div>
        
        {(isMultiSelect ? selectedObjects.some(obj => obj.fill !== undefined) : object.fill !== undefined) && (
          <div className="property-group">
            <label className="property-label">Fill Color</label>
            <input
              type="color"
              value={isMultiSelect ? (selectedObjects.find(obj => obj.fill !== undefined)?.fill || '#ffffff') : (object.fill || '#ffffff')}
              onChange={(e) => handleChange('fill', e.target.value)}
            />
          </div>
        )}
        
        {(isMultiSelect ? selectedObjects.some(obj => obj.stroke !== undefined) : object.stroke !== undefined) && (
          <>
            <div className="property-group">
              <label className="property-label">Stroke Color</label>
              <input
                type="color"
                value={isMultiSelect ? (selectedObjects.find(obj => obj.stroke !== undefined)?.stroke || '#ffffff') : (object.stroke || '#ffffff')}
                onChange={(e) => handleChange('stroke', e.target.value)}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Stroke Width</label>
              <NumberInput
                value={isMultiSelect ? (selectedObjects.find(obj => obj.strokeWidth !== undefined)?.strokeWidth || 2) : (object.strokeWidth || 2)}
                onChange={(val) => handleNumberChange('strokeWidth', val)}
              />
            </div>
          </>
        )}
        
        <div className="property-group">
          <label className="property-label">Z-Index</label>
          <NumberInput
            value={isMultiSelect ? (selectedObjects[0].zIndex || 0) : (object.zIndex || 0)}
            onChange={(val) => handleNumberChange('zIndex', Math.round(val))}
          />
        </div>
        
        <div className="property-section-title">Animation</div>
        
        <div className="property-group">
          <label className="property-label">Entry Animation</label>
          <select
            value={isMultiSelect ? (selectedObjects[0].animationType || 'auto') : (object.animationType || 'auto')}
            onChange={(e) => handleChange('animationType', e.target.value)}
            className="animation-select"
          >
            <option value="auto">Auto</option>
            <option value="Create">Create</option>
            <option value="FadeIn">Fade In</option>
            <option value="GrowFromCenter">Grow From Center</option>
            <option value="Write">Write</option>
            <option value="DrawBorderThenFill">Draw Border Then Fill</option>
          </select>
        </div>
        
        <div className="property-group">
          <label className="property-label">Exit Animation</label>
          <select
            value={isMultiSelect ? (selectedObjects[0].exitAnimationType || 'FadeOut') : (object.exitAnimationType || 'FadeOut')}
            onChange={(e) => handleChange('exitAnimationType', e.target.value)}
            className="animation-select"
          >
            <option value="FadeOut">Fade Out</option>
            <option value="Uncreate">Uncreate</option>
            <option value="Unwrite">Unwrite</option>
            <option value="ShrinkToCenter">Shrink To Center</option>
          </select>
          <div className="property-info">
            Objects will automatically exit after their duration ends
          </div>
        </div>
        
        <div className="property-row">
          <div className="property-group">
            <label className="property-label">Run Time (s)</label>
            <NumberInput
              value={isMultiSelect ? (selectedObjects[0].runTime || 1) : (object.runTime || 1)}
              onChange={(val) => handleNumberChange('runTime', Math.max(0.1, val))}
            />
          </div>
          <div className="property-group">
            <label className="property-label">Delay (s)</label>
            <NumberInput
              value={isMultiSelect ? (selectedObjects[0].delay || 0) : (object.delay || 0)}
              onChange={(val) => handleNumberChange('delay', Math.max(0, val))}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default PropertiesPanel

