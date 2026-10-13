import React from 'react'

/** Shared panel styling, kept in one place so the extracted components agree. */
export const s = {
  select: {
    width: '100%',
    boxSizing: 'border-box' as const,
    background: 'var(--bgColorDark4, #111)',
    color: 'inherit',
    border: '1px solid #333',
    borderRadius: 3,
    padding: '3px 6px',
    fontSize: '0.85em',
  } as React.CSSProperties,

  textInput: {
    width: '100%',
    boxSizing: 'border-box' as const,
    background: 'var(--bgColorDark4, #111)',
    color: 'inherit',
    border: '1px solid #333',
    borderRadius: 3,
    padding: '5px 8px',
    fontSize: '0.85em',
    fontFamily: 'monospace',
  } as React.CSSProperties,

  numInput: {
    background: 'var(--bgColorDark4, #111)',
    color: 'inherit',
    border: '1px solid #333',
    borderRadius: 3,
    padding: '2px 4px',
    fontSize: '0.82em',
  } as React.CSSProperties,

  sectionHeader: {
    margin: '18px 0 8px',
    fontSize: '0.8em',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    opacity: 0.6,
  } as React.CSSProperties,

  sourceHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.75em',
    opacity: 0.75,
    marginBottom: 3,
    fontFamily: 'monospace',
  } as React.CSSProperties,

  fixtureWrap: {
    borderLeft: '2px solid #333',
    paddingLeft: 10,
    marginBottom: 12,
  } as React.CSSProperties,

  mappingWrap: {
    border: '1px solid #2a2a2a',
    borderRadius: 5,
    padding: '10px 10px 8px',
    marginBottom: 8,
    background: 'rgba(0,0,0,0.25)',
  } as React.CSSProperties,

  fieldLabel: {
    fontSize: '0.72em',
    opacity: 0.5,
    letterSpacing: '0.07em',
    textTransform: 'uppercase' as const,
    marginBottom: 5,
  } as React.CSSProperties,

  addSlotRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTop: '1px solid #222',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,

  chip: {
    fontSize: '0.75em',
    padding: '2px 7px',
    borderRadius: 3,
    color: '#fff',
    fontWeight: 600,
    flexShrink: 0,
  } as React.CSSProperties,

  dimLabel: {
    fontSize: '0.78em',
    opacity: 0.4,
    flexShrink: 0,
  } as React.CSSProperties,

  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  } as React.CSSProperties,

  grid3: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr',
    gap: 8,
  } as React.CSSProperties,

  hint: {
    fontSize: '0.72em',
    opacity: 0.4,
    marginTop: 3,
  } as React.CSSProperties,

  emptyNote: {
    color: '#555',
    fontSize: '0.85em',
    fontStyle: 'italic',
  } as React.CSSProperties,

  warning: {
    fontSize: '0.78em',
    color: '#d8a13a',
    background: 'rgba(216,161,58,0.08)',
    border: '1px solid rgba(216,161,58,0.3)',
    borderRadius: 4,
    padding: '5px 8px',
    marginBottom: 8,
  } as React.CSSProperties,

  wheelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  } as React.CSSProperties,

  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: '0.82em',
    opacity: 0.8,
  } as React.CSSProperties,

  tableToolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.75em',
    marginBottom: 6,
  } as React.CSSProperties,

  rigRow: {
    display: 'grid',
    gridTemplateColumns:
      '18px minmax(70px, 1.2fr) minmax(90px, 1.6fr) 74px 34px minmax(60px, 1fr) 52px',
    alignItems: 'center',
    gap: 6,
    padding: '4px 6px',
    fontSize: '0.78em',
    borderBottom: '1px solid #222',
    cursor: 'pointer',
  } as React.CSSProperties,

  mapRow: {
    display: 'grid',
    gridTemplateColumns: '18px minmax(70px, 1.1fr) minmax(80px, 1.2fr) 58px minmax(90px, 1.8fr)',
    alignItems: 'center',
    gap: 6,
    padding: '4px 6px',
    fontSize: '0.78em',
    borderBottom: '1px solid #222',
    cursor: 'pointer',
  } as React.CSSProperties,

  iconButton: {
    background: 'none',
    border: '1px solid #333',
    borderRadius: 3,
    color: 'inherit',
    cursor: 'pointer',
    fontSize: '0.9em',
    lineHeight: 1,
    padding: '2px 4px',
  } as React.CSSProperties,

  iconButtonActive: {
    background: '#e8e8e8',
    color: '#111',
    borderColor: '#e8e8e8',
  } as React.CSSProperties,

  headChip: {
    fontSize: '0.72em',
    padding: '2px 6px',
    borderRadius: 3,
    border: '1px solid #3a3a3a',
    background: 'none',
    color: 'inherit',
    cursor: 'pointer',
  } as React.CSSProperties,

  headChipOn: {
    background: '#2e5a3a',
    borderColor: '#3f7a4f',
  } as React.CSSProperties,

  textArea: {
    width: '100%',
    boxSizing: 'border-box' as const,
    background: 'var(--bgColorDark4, #111)',
    color: 'inherit',
    border: '1px solid #333',
    borderRadius: 3,
    padding: '5px 8px',
    fontSize: '0.82em',
    fontFamily: 'inherit',
    resize: 'vertical' as const,
  } as React.CSSProperties,

  tableRowBad: {
    background: 'rgba(216,161,58,0.10)',
  } as React.CSSProperties,

  cellName: {
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
  cellAddress: { fontFamily: 'monospace', opacity: 0.85 } as React.CSSProperties,
  cellNum: {
    fontVariantNumeric: 'tabular-nums',
    opacity: 0.6,
    textAlign: 'right' as const,
  } as React.CSSProperties,
  cellProfile: {
    opacity: 0.6,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
  cellTap: {
    opacity: 0.55,
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
  cellFlag: { color: '#d8a13a', fontSize: '0.92em' } as React.CSSProperties,
  cellNote: {
    opacity: 0.45,
    fontSize: '0.92em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
}
