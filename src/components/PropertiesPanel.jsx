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

function PropertiesPanel({ object, onUpdateObject, onDeleteObject }) {
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

