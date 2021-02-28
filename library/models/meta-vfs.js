// a read-only model which provides a virtual filesystem (kind of like /dev on unix)
// so readPath can read information about the meta operations of Pigeon Optics for things like search
const auth = require('./auth')
const datasets = require('./dataset')
const lenses = require('./lens')
const itToArray = require('../utility/async-iterable-to-array')

const iterators = {
  users: auth.iterateUsers,

  datasets: async function * () {
    for await (const user of iterators.users()) {
      for await (const name of datasets.iterateDatasets(user)) {
        yield {
          path: `/datasets/${user}:${name}/`,
          user,
          name
        }
      }
    }
  },

  lenses: async function * () {
    for await (const user of iterators.users()) {
      for await (const name of lenses.iterateDatasets(user)) {
        yield {
          path: `/lenses/${user}:${name}/`,
          user,
          name
        }
      }
    }
  }
}

exports.exists = (user, name, record) => {
  if (user !== 'system') return false
  if (name !== 'system') return false
  return !!iterators[record]
}

exports.readEntry = (user, name, record) => {
  if (user !== 'system') return undefined
  if (name !== 'system') return undefined
  return itToArray(iterators[record]())
}

exports.readEntryMeta = (user, name, record) => {
  return { version: 0, hash: Buffer.from(record) }
}

exports.readEntryByHash = (user, name, hash) => {
  return exports.readEntry(user, name, hash.toString())
}

exports.iterateEntries = async function * () {
  for (const key of Object.keys(iterators)) {
    yield key
  }
}

exports.listEntries = () => Object.keys(iterators)
