import React from 'react'
import { Button, Collapsible } from '@hedron-gl/ui-core'
import { EncoderEditor } from './EncoderEditor'
import { SlotEditor } from './SlotEditor'
import { s } from './styles'
import { parseQlcXml, qlcToProfile } from '@/qlcImport'
import { DEFAULT_PROFILES, FixtureMode, FixtureProfile, FixtureShape } from '@/profiles'

const SHAPES: FixtureShape[] = ['par', 'bar', 'strip', 'matrix', 'mover', 'generic']

export interface ProfileLibraryProps {
  profiles: FixtureProfile[]
  /** Profile ids currently referenced by the patch; those cannot be deleted. */
  inUse: Set<string>
  onChange: (profiles: FixtureProfile[]) => void
}

/** Create, duplicate, edit and remove fixture profiles independently of the patch. */
export function ProfileLibrary({ profiles, inUse, onChange }: ProfileLibraryProps) {
  const [openId, setOpenId] = React.useState<string | null>(null)

  const replace = (id: string, next: FixtureProfile) =>
    onChange(profiles.map((p) => (p.id === id ? next : p)))

  const updateMode = (profile: FixtureProfile, modeName: string, changes: Partial<FixtureMode>) =>
    replace(profile.id, {
      ...profile,
      modes: profile.modes.map((m) => (m.name === modeName ? { ...m, ...changes } : m)),
    })

  return (
    <div>
      {profiles.map((profile) => {
        const isOpen = openId === profile.id
        const shipped = DEFAULT_PROFILES.some((p) => p.id === profile.id)
        const used = inUse.has(profile.id)

        return (
          <div key={profile.id} style={s.fixtureWrap}>
            <Collapsible
              title={`${profile.name} — ${profile.modes.length} mode${
                profile.modes.length === 1 ? '' : 's'
              }${used ? ' · in use' : ''}`}
              isOpen={isOpen}
              onToggle={() => setOpenId(isOpen ? null : profile.id)}
            >
              <div style={s.mappingWrap}>
                <div style={s.grid2}>
                  <div>
                    <div style={s.fieldLabel}>Name</div>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={(e) => replace(profile.id, { ...profile, name: e.target.value })}
                      style={s.textInput}
                    />
                  </div>
                  <div>
                    <div style={s.fieldLabel}>Shape</div>
                    <select
                      value={profile.shape}
                      onChange={(e) =>
                        replace(profile.id, { ...profile, shape: e.target.value as FixtureShape })
                      }
                      style={s.select}
                    >
                      {SHAPES.map((shape) => (
                        <option key={shape} value={shape}>
                          {shape}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {profile.modes.map((mode) => (
                  <div
                    key={mode.name}
                    style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #222' }}
                  >
                    <div style={s.grid3}>
                      <div>
                        <div style={s.fieldLabel}>Mode Name</div>
                        <input
                          type="text"
                          defaultValue={mode.name}
                          key={`${profile.id}-${mode.name}`}
                          onBlur={(e) => {
                            const name = e.target.value.trim()
                            if (name && name !== mode.name) updateMode(profile, mode.name, { name })
                          }}
                          style={s.textInput}
                        />
                      </div>
                      <div>
                        <div style={s.fieldLabel}>Pixels</div>
                        <input
                          type="number"
                          min={1}
                          value={mode.pixelCount}
                          onChange={(e) =>
                            updateMode(profile, mode.name, {
                              pixelCount: Math.max(1, parseInt(e.target.value, 10) || 1),
                            })
                          }
                          style={{ ...s.numInput, width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <div style={s.fieldLabel}>Stride</div>
                        <input
                          type="number"
                          min={0}
                          value={mode.pixelStride ?? mode.pixel.length}
                          onChange={(e) =>
                            updateMode(profile, mode.name, {
                              pixelStride: Math.max(0, parseInt(e.target.value, 10) || 0),
                            })
                          }
                          style={{ ...s.numInput, width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <EncoderEditor
                        mode={mode}
                        onChange={(encoder) => updateMode(profile, mode.name, { encoder })}
                      />

                      <SlotEditor
                        label="Pixel Channels (repeated per pixel)"
                        slots={mode.pixel}
                        onChange={(pixel) => updateMode(profile, mode.name, { pixel })}
                      />
                      <SlotEditor
                        label="Header Channels (once, before the pixels)"
                        slots={mode.header ?? []}
                        onChange={(header) => updateMode(profile, mode.name, { header })}
                      />
                    </div>

                    {profile.modes.length > 1 && (
                      <Button
                        type="danger"
                        size="slim"
                        iconName="delete"
                        onClick={() =>
                          replace(profile.id, {
                            ...profile,
                            modes: profile.modes.filter((m) => m.name !== mode.name),
                          })
                        }
                      >
                        Remove Mode
                      </Button>
                    )}
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <Button
                    type="secondary"
                    size="slim"
                    iconName="add"
                    onClick={() =>
                      replace(profile.id, {
                        ...profile,
                        modes: [
                          ...profile.modes,
                          {
                            name: `mode ${profile.modes.length + 1}`,
                            pixel: ['red', 'green', 'blue'],
                            pixelCount: 1,
                          },
                        ],
                      })
                    }
                  >
                    Add Mode
                  </Button>
                  <Button
                    type="neutral"
                    size="slim"
                    onClick={() => onChange([...profiles, duplicate(profile)])}
                  >
                    Duplicate
                  </Button>
                  {!shipped && !used && (
                    <Button
                      type="danger"
                      size="slim"
                      iconName="delete"
                      onClick={() => onChange(profiles.filter((p) => p.id !== profile.id))}
                    >
                      Delete Profile
                    </Button>
                  )}
                </div>

                {used && (
                  <div style={s.hint}>
                    Patched fixtures use this profile, so editing it changes them all. Duplicate
                    first to fork it.
                  </div>
                )}
              </div>
            </Collapsible>
          </div>
        )
      })}

      <QlcImport onImport={(profile) => onChange([...profiles, profile])} />

      <Button
        type="secondary"
        size="slim"
        iconName="add"
        onClick={() =>
          onChange([
            ...profiles,
            {
              id: `profile-${Math.random().toString(36).slice(2, 8)}`,
              name: `Fixture profile ${profiles.length + 1}`,
              shape: 'generic',
              modes: [{ name: 'default', pixel: ['red', 'green', 'blue'], pixelCount: 1 }],
            },
          ])
        }
      >
        New Profile
      </Button>
    </div>
  )
}

/** Loads QLC+ .qxf fixture definitions, of which there are thousands published. */
function QlcImport({ onImport }: { onImport: (profile: FixtureProfile) => void }) {
  const [error, setError] = React.useState<string | null>(null)

  return (
    <div style={{ marginBottom: 8 }}>
      <input
        type="file"
        accept=".qxf,application/xml,text/xml"
        style={{ fontSize: '0.78em' }}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          const definition = parseQlcXml(await file.text())
          e.target.value = ''
          if (!definition) {
            setError(`Could not read ${file.name} as a QLC+ fixture definition`)
            return
          }
          setError(null)
          onImport(qlcToProfile(definition))
        }}
      />
      {error ? (
        <div style={s.warning}>{error}</div>
      ) : (
        <div style={s.hint}>Import a QLC+ .qxf definition</div>
      )}
    </div>
  )
}

function duplicate(profile: FixtureProfile): FixtureProfile {
  return {
    ...profile,
    id: `${profile.id}-copy-${Math.random().toString(36).slice(2, 6)}`,
    name: `${profile.name} copy`,
    modes: profile.modes.map((m) => ({ ...m })),
  }
}
