import React from 'react'

interface DmxLightingGlobalWidgetProps {
  isOpen: boolean
  onToggle: () => void
}

export const DmxLightingGlobalWidget: React.FC<DmxLightingGlobalWidgetProps> = ({ isOpen, onToggle }) => {
  return (
    <button
      style={{ padding: 8, borderRadius: 4, background: isOpen ? '#ffd700' : '#222', color: isOpen ? '#222' : '#ffd700', border: 'none', cursor: 'pointer', margin: 4 }}
      onClick={onToggle}
      title="DMX Lighting Settings"
    >
      <span style={{ marginRight: 6 }}>💡</span>
      <span>DMX</span>
    </button>
  )
}
