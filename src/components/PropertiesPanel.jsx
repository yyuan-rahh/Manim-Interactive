import React, { useState, useEffect } from 'react'
import './PropertiesPanel.css'
import DesmosMathField from './DesmosMathField'

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
  scene,
  onUpdateObject, 
  onDeleteObject,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack
}) {
  if (!object) {
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
    onUpdateObject(object.id, { [key]: value })
  }

  const handleNumberChange = (key, value) => {
    handleChange(key, value)
  }

  const transformCandidates = (scene?.objects || []).filter(o => o.id !== object.id)

  return (
    <div className="properties-panel">
      <div className="panel-header">
        <h3>Properties</h3>
        <button 
          className="delete-btn"
          onClick={() => onDeleteObject(object.id)}
          title="Delete Object"
        >
          🗑️
        </button>
      </div>
      
      <div className="properties-content">
        <div className="property-group">
          <label className="property-label">Type</label>
          <div className="property-value type-badge">{object.type}</div>
        </div>
        
        <div className="property-section-title">Layer Order</div>
        <div className="layer-controls">
          <button 
            className="layer-btn" 
            onClick={() => onBringToFront(object.id)}
            title="Bring to Front"
          >
            ⬆⬆
          </button>
          <button 
            className="layer-btn" 
            onClick={() => onBringForward(object.id)}
            title="Bring Forward"
          >
            ⬆
          </button>
          <button 
            className="layer-btn" 
            onClick={() => onSendBackward(object.id)}
            title="Send Backward"
          >
            ⬇
          </button>
          <button 
            className="layer-btn" 
            onClick={() => onSendToBack(object.id)}
            title="Send to Back"
          >
            ⬇⬇
          </button>
        </div>
        
        {object.type === 'rectangle' && (
          <div className="property-row">
            <div className="property-group">
              <label className="property-label">Width</label>
              <NumberInput
                value={object.width}
                onChange={(val) => handleNumberChange('width', val)}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Height</label>
              <NumberInput
                value={object.height}
                onChange={(val) => handleNumberChange('height', val)}
              />
            </div>
          </div>
        )}
        
        {(object.type === 'circle' || object.type === 'dot') && (
          <div className="property-group">
            <label className="property-label">Radius</label>
            <NumberInput
              value={object.radius}
              onChange={(val) => handleNumberChange('radius', val)}
            />
          </div>
        )}
        
        {object.type === 'triangle' && (
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
        
        {object.type === 'polygon' && (
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
              value={object.x || 0}
              onChange={(val) => handleNumberChange('x', val)}
            />
          </div>
          <div className="property-group">
            <label className="property-label">Position Y</label>
            <NumberInput
              value={object.y || 0}
              onChange={(val) => handleNumberChange('y', val)}
            />
          </div>
        </div>
        
        <div className="property-group">
          <label className="property-label">Rotation (°)</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => handleNumberChange('rotation', (object.rotation || 0) - 15)}
              style={{ padding: '4px 8px', cursor: 'pointer' }}
              title="Rotate -15°"
            >
              ↺ -15°
            </button>
            <NumberInput
              value={object.rotation || 0}
              onChange={(val) => handleNumberChange('rotation', val)}
              style={{ flex: 1 }}
            />
            <button
              onClick={() => handleNumberChange('rotation', (object.rotation || 0) + 15)}
              style={{ padding: '4px 8px', cursor: 'pointer' }}
              title="Rotate +15°"
            >
              ↻ +15°
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
            value={object.opacity ?? 1}
            onChange={(e) => handleNumberChange('opacity', parseFloat(e.target.value))}
          />
          <span className="range-value">{(object.opacity ?? 1).toFixed(1)}</span>
        </div>
        
        <div className="property-section-title">Appearance</div>
        
        {object.fill !== undefined && (
          <div className="property-group">
            <label className="property-label">Fill Color</label>
            <input
              type="color"
              value={object.fill || '#ffffff'}
              onChange={(e) => handleChange('fill', e.target.value)}
            />
          </div>
        )}
        
        {object.stroke !== undefined && (
          <>
            <div className="property-group">
              <label className="property-label">Stroke Color</label>
              <input
                type="color"
                value={object.stroke || '#ffffff'}
                onChange={(e) => handleChange('stroke', e.target.value)}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Stroke Width</label>
              <NumberInput
                value={object.strokeWidth || 2}
                onChange={(val) => handleNumberChange('strokeWidth', val)}
              />
            </div>
          </>
        )}
        
        <div className="property-group">
          <label className="property-label">Z-Index</label>
          <NumberInput
            value={object.zIndex || 0}
            onChange={(val) => handleNumberChange('zIndex', Math.round(val))}
          />
        </div>
        
        <div className="property-section-title">Animation</div>
        
        <div className="property-group">
          <label className="property-label">Animation Type</label>
          <select
            value={object.animationType || 'auto'}
            onChange={(e) => handleChange('animationType', e.target.value)}
            className="animation-select"
          >
            <option value="auto">Auto</option>
            <option value="Create">Create</option>
            <option value="FadeIn">Fade In</option>
            <option value="FadeOut">Fade Out</option>
            <option value="GrowFromCenter">Grow From Center</option>
            <option value="Write">Write</option>
            <option value="DrawBorderThenFill">Draw Border Then Fill</option>
            <option value="ShowCreation">Show Creation</option>
            <option value="SpinInFromNothing">Spin In</option>
            <option value="Uncreate">Uncreate</option>
            <option value="Unwrite">Unwrite</option>
          </select>
        </div>
        
        <div className="property-row">
          <div className="property-group">
            <label className="property-label">Run Time (s)</label>
            <NumberInput
              value={object.runTime || 1}
              onChange={(val) => handleNumberChange('runTime', Math.max(0.1, val))}
            />
          </div>
          <div className="property-group">
            <label className="property-label">Delay (s)</label>
            <NumberInput
              value={object.delay || 0}
              onChange={(val) => handleNumberChange('delay', Math.max(0, val))}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default PropertiesPanel

