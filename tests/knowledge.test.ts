import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { loadDataset } from '../src/data.ts'
import { buildKnowledge, importKnowledge, searchKnowledge, stableId } from '../src/knowledge.ts'

const metrics = JSON.parse(readFileSync('Data/metrics.json', 'utf8'))
const countries = loadDataset(readdirSync('Data/public').map(name => ({ name, text: readFileSync('Data/public/' + name, 'utf8') })), metrics, true)

test('knowledge derives existing country and topic entities with valid relationships', () => {
  const index = buildKnowledge(countries)
  assert.equal(index.entities.filter(entity => entity.kind === 'country').length, 195)
  assert.equal(new Set(index.entities.map(entity => entity.id)).size, index.entities.length)
  assert.ok(searchKnowledge(index, 'Geography').some(entity => entity.id === stableId('topic', 'Geography')))
  const ids = new Set(index.entities.map(entity => entity.id))
  assert.ok(index.relationships.every(link => ids.has(link.from) && ids.has(link.to)))
  assert.equal(index.entities.filter(entity => entity.kind === 'event').length, 0)
})

test('content import validates sources and relationships without mutating existing knowledge', () => {
  const existing = buildKnowledge(countries)
  const size = existing.entities.length
  const pack = { version: 1, entities: [{ id: 'topic:survey-method', kind: 'topic', title: 'Survey methods', summary: 'A supplied research note.', sources: [{ label: 'Source', url: 'https://example.org/' }] }], relationships: [{ from: 'topic:survey-method', to: 'country:PRT', label: 'has an example in' }] }
  const result = importKnowledge(JSON.stringify(pack), existing)
  assert.equal(existing.entities.length, size)
  assert.equal(result.entities.length, size + 1)
  assert.throws(() => importKnowledge(JSON.stringify({ ...pack, relationships: [{ from: 'missing', to: 'country:PRT', label: 'links' }] }), existing), /endpoints/)
  assert.throws(() => importKnowledge(JSON.stringify(pack), result), /already exists/)
  pack.entities[0].sources[0].url = 'javascript:alert(1)'
  assert.throws(() => importKnowledge(JSON.stringify(pack), existing), /sources/)
})

test('content packs retain publication, verification and reuse metadata', () => {
  const existing = buildKnowledge(countries)
  const source = { label: 'Supplied source', url: 'https://example.org/', publicationDate: '2025', lastVerified: '2026-11-19', license: 'Provided in source record', reuseNotes: 'Review the underlying source terms.' }
  const result = importKnowledge(JSON.stringify({ version: 1, entities: [{ id: 'event:sample-import', kind: 'event', title: 'Supplied historical record', summary: 'A record supplied by the importer.', date: '2025', sources: [source] }], relationships: [] }), existing)
  assert.deepEqual(result.entities.at(-1)!.sources[0], source)
  assert.equal(result.entities.at(-1)!.date, '2025')
})

test('local knowledge uses actual source geographies and preserves relationships', { skip: !readFileSyncIfPresent('Data/local/europe.csv') }, () => {
  const data = loadDataset(readdirSync('Data/local').map(name => ({ name, text: readFileSync('Data/local/' + name, 'utf8') })), metrics, true)
  const index = buildKnowledge(data)
  const toronto = index.entities.find(entity => entity.kind === 'city' && entity.title.startsWith('Toronto'))
  assert.ok(toronto)
  assert.equal(toronto.countryId, 'CAN')
  assert.ok(index.relationships.some(link => link.from === toronto.id && link.to === 'country:CAN'))
  assert.ok(index.entities.some(entity => entity.kind === 'institution' && entity.title.includes('Statistics Canada')))
})

function readFileSyncIfPresent(path: string) {
  try { return readFileSync(path, 'utf8') } catch { return '' }
}
