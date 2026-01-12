import React, { useState, useEffect } from 'react'
import './PropertiesPanel.css'

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
        
        {(object.type === 'circle' || object.type === 'dot' || object.type === 'polygon') && (
          <div className="property-group">
            <label className="property-label">Radius</label>
            <NumberInput
              value={object.radius}
              onChange={(val) => handleNumberChange('radius', val)}
            />
          </div>
        )}
        
        {object.type === 'polygon' && (
          <div className="property-group">
            <label className="property-label">Sides</label>
            <NumberInput
              value={object.sides}
              onChange={(val) => handleNumberChange('sides', Math.round(val))}
            />
          </div>
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
          </>
        )}
        
        {object.type === 'latex' && (
          <div className="property-group">
            <label className="property-label">LaTeX</label>
            <input
              type="text"
              value={object.latex || ''}
              onChange={(e) => handleChange('latex', e.target.value)}
              placeholder="\frac{a}{b}"
            />
          </div>
        )}
        
        {object.type === 'function' && (
          <>
            <div className="property-group">
              <label className="property-label">Formula</label>
              <input
                type="text"
                value={object.formula || 'x^2'}
                onChange={(e) => handleChange('formula', e.target.value)}
                placeholder="x^2, sin(x), x^3 - 2*x + 1"
              />
            </div>
            <div className="property-row">
              <div className="property-group">
                <label className="property-label">Domain Min</label>
                <NumberInput
                  value={object.domain?.min ?? -5}
                  onChange={(val) => handleChange('domain', { 
                    ...object.domain, 
                    min: val,
                    max: object.domain?.max ?? 5
                  })}
                />
              </div>
              <div className="property-group">
                <label className="property-label">Domain Max</label>
                <NumberInput
                  value={object.domain?.max ?? 5}
                  onChange={(val) => handleChange('domain', { 
                    ...object.domain, 
                    min: object.domain?.min ?? -5,
                    max: val
                  })}
                />
              </div>
            </div>
            <div className="property-group">
              <label className="property-label">Color</label>
              <input
                type="color"
                value={object.color || '#60a5fa'}
                onChange={(e) => handleChange('color', e.target.value)}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Stroke Width</label>
              <NumberInput
                value={object.strokeWidth || 2}
                onChange={(val) => handleNumberChange('strokeWidth', val)}
              />
            </div>
            <div className="property-group">
              <label className="property-label">
                <input
                  type="checkbox"
                  checked={object.showDerivative || false}
                  onChange={(e) => handleChange('showDerivative', e.target.checked)}
                />
                Show Derivative (f')
              </label>
            </div>
            <div className="property-group">
              <label className="property-label">
                <input
                  type="checkbox"
                  checked={object.showSecondDerivative || false}
                  onChange={(e) => handleChange('showSecondDerivative', e.target.checked)}
                />
                Show Second Derivative (f'')
              </label>
            </div>
          </>
        )}
        
        {object.type === 'tangent' && (
          <>
            <div className="property-group">
              <label className="property-label">Function</label>
              <select
                value={object.functionId || ''}
                onChange={(e) => handleChange('functionId', e.target.value || null)}
                className="animation-select"
              >
                <option value="">Select a function...</option>
                {scene?.objects
                  ?.filter(o => o.type === 'function')
                  .map(func => (
                    <option key={func.id} value={func.id}>
                      {func.formula || 'f(x)'}
                    </option>
                  ))}
              </select>
            </div>
            <div className="property-group">
              <label className="property-label">Point X</label>
              <NumberInput
                value={object.pointX || 0}
                onChange={(val) => handleNumberChange('pointX', val)}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Length</label>
              <NumberInput
                value={object.length || 2}
                onChange={(val) => handleNumberChange('length', val)}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Color</label>
              <input
                type="color"
                value={object.color || '#f59e0b'}
                onChange={(e) => handleChange('color', e.target.value)}
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
        
        {object.type === 'riemann_sum' && (
          <>
            <div className="property-group">
              <label className="property-label">Function</label>
              <select
                value={object.functionId || ''}
                onChange={(e) => handleChange('functionId', e.target.value || null)}
                className="animation-select"
              >
                <option value="">Select a function...</option>
                {scene?.objects
                  ?.filter(o => o.type === 'function')
                  .map(func => (
                    <option key={func.id} value={func.id}>
                      {func.formula || 'f(x)'}
                    </option>
                  ))}
              </select>
            </div>
            <div className="property-row">
              <div className="property-group">
                <label className="property-label">Interval A</label>
                <NumberInput
                  value={object.interval?.a ?? 0}
                  onChange={(val) => handleChange('interval', { 
                    ...object.interval, 
                    a: val,
                    b: object.interval?.b ?? 2
                  })}
                />
              </div>
              <div className="property-group">
                <label className="property-label">Interval B</label>
                <NumberInput
                  value={object.interval?.b ?? 2}
                  onChange={(val) => handleChange('interval', { 
                    ...object.interval, 
                    a: object.interval?.a ?? 0,
                    b: val
                  })}
                />
              </div>
            </div>
            <div className="property-group">
              <label className="property-label">Number of Rectangles (n)</label>
              <NumberInput
                value={object.n || 4}
                onChange={(val) => handleNumberChange('n', Math.max(1, Math.round(val)))}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Method</label>
              <select
                value={object.method || 'left'}
                onChange={(e) => handleChange('method', e.target.value)}
                className="animation-select"
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
                <option value="midpoint">Midpoint</option>
                <option value="trapezoid">Trapezoid</option>
              </select>
            </div>
            <div className="property-group">
              <label className="property-label">Fill Color</label>
              <input
                type="color"
                value={object.fillColor || '#8b5cf6'}
                onChange={(e) => handleChange('fillColor', e.target.value)}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Stroke Color</label>
              <input
                type="color"
                value={object.strokeColor || '#ffffff'}
                onChange={(e) => handleChange('strokeColor', e.target.value)}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Stroke Width</label>
              <NumberInput
                value={object.strokeWidth || 1}
                onChange={(val) => handleNumberChange('strokeWidth', val)}
              />
            </div>
          </>
        )}
        
        {object.type === 'accumulation' && (
          <>
            <div className="property-group">
              <label className="property-label">Function</label>
              <select
                value={object.functionId || ''}
                onChange={(e) => handleChange('functionId', e.target.value || null)}
                className="animation-select"
              >
                <option value="">Select a function...</option>
                {scene?.objects
                  ?.filter(o => o.type === 'function')
                  .map(func => (
                    <option key={func.id} value={func.id}>
                      {func.formula || 'f(x)'}
                    </option>
                  ))}
              </select>
            </div>
            <div className="property-group">
              <label className="property-label">Start Point (c)</label>
              <NumberInput
                value={object.startPoint || 0}
                onChange={(val) => handleNumberChange('startPoint', val)}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Current X</label>
              <NumberInput
                value={object.currentX || 2}
                onChange={(val) => handleNumberChange('currentX', val)}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Fill Color</label>
              <input
                type="color"
                value={object.fillColor || '#60a5fa'}
                onChange={(e) => handleChange('fillColor', e.target.value)}
              />
            </div>
          </>
        )}
        
        {object.type === 'taylor_series' && (
          <>
            <div className="property-group">
              <label className="property-label">Function</label>
              <select
                value={object.functionId || ''}
                onChange={(e) => handleChange('functionId', e.target.value || null)}
                className="animation-select"
              >
                <option value="">Select a function...</option>
                {scene?.objects
                  ?.filter(o => o.type === 'function')
                  .map(func => (
                    <option key={func.id} value={func.id}>
                      {func.formula || 'f(x)'}
                    </option>
                  ))}
              </select>
            </div>
            <div className="property-group">
              <label className="property-label">Center Point</label>
              <NumberInput
                value={object.center || 0}
                onChange={(val) => handleNumberChange('center', val)}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Degree</label>
              <NumberInput
                value={object.degree || 3}
                onChange={(val) => handleNumberChange('degree', Math.max(0, Math.round(val)))}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Color</label>
              <input
                type="color"
                value={object.color || '#f59e0b'}
                onChange={(e) => handleChange('color', e.target.value)}
              />
            </div>
            <div className="property-group">
              <label className="property-label">Stroke Width</label>
              <NumberInput
                value={object.strokeWidth || 2}
                onChange={(val) => handleNumberChange('strokeWidth', val)}
              />
            </div>
            <div className="property-group">
              <label className="property-label">
                <input
                  type="checkbox"
                  checked={object.showError || false}
                  onChange={(e) => handleChange('showError', e.target.checked)}
                />
                Show Error Region
              </label>
            </div>
          </>
        )}
        
        <div className="property-section-title">Transform</div>
        
        <div className="property-group">
          <label className="property-label">Rotation (°)</label>
          <NumberInput
            value={object.rotation || 0}
            onChange={(val) => handleNumberChange('rotation', val)}
          />
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

