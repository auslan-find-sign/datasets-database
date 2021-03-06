/**
 * Attachment Storage is a content addressed store of data blobs, i.e. video files
 */
const assert = require('assert')
const readPath = require('./read-path')
const tq = require('tiny-function-queue')
const { Readable } = require('stream')

// final location blobs are moved in to
const blobStore = require('./fs/blob').instance({ prefix: ['attachments', 'blobs'] })

// metadata storage for blobs
const metaStore = require('./fs/objects').instance({ prefix: ['attachments', 'meta'] })

/**
 * Write a stream of arbitrary data to the attachment store
 * @param {Readable} stream Readable stream to write to attachment store
 * @param {object} meta metadata object, importantly containing linkers array
 * @returns {{hash, release}} - hash is a buffer of sha256 of blob's contents, release is a function which triggers GC
 * @async
 */
exports.writeStream = async function (stream, meta) {
  assert(meta && typeof meta === 'object', 'meta argument must be an object')
  assert(Array.isArray(meta.linkers), 'meta object must contain a linkers property which is an array')

  const hash = await blobStore.writeIter(stream)
  const release = this.hold(hash)

  await metaStore.update([hash], async oldValue => {
    return {
      created: Date.now(),
      ...oldValue || {},
      updated: Date.now(),
      ...meta,
      linkers: [...new Set([...(oldValue || {}).linkers || [], ...meta.linkers])]
    }
  })
  return { hash, release }
}

/**
 * Read an attachment's contents as a stream
 * @param {string} hash - content hash of the attachment to read
 * @returns {Readable}
 * @async
 */
exports.readStream = async function (hash) {
  assert(typeof hash === 'string', 'hash argument must be a string')
  return Readable.from(blobStore.readIter(hash))
}

/**
 * Read metadata object of an attachment, notably containing linkers array, and ms epoch created and updated timestamps
 * @param {string} hash
 * @returns {object}
 * @async
 */
exports.readMeta = async function (hash) {
  assert(typeof hash === 'string', 'hash argument must be a hex string')

  return await metaStore.read([hash])
}

/**
 * Add a link to an attachment
 * @param {string} hash - attachment content hash
 * @param {...string} dataPath - path to record linking to attachment
 */
exports.link = async function (hash, ...dataPaths) {
  return await tq.lockWhile(['attachments', hash], async () => {
    await metaStore.update([hash], meta => {
      if (!meta) throw new Error('Cannot link non-existant attachment')
      const missing = dataPaths.filter(x => !meta.linkers.includes(x))
      if (missing.length > 0) {
        meta.linkers.push(...missing)
        meta.updated = Date.now()
        return meta
      }
    })
  })
}

/** import an attachment from multipart-files file object
 * @param {object} file - file object from ../utility/multipart-files
 * @param {{linkers<string[]>}} meta - meta stuff to add, only linkers gets handled currently
 */
exports.import = async function (file, { linkers }) {
  // import the file
  // await blobStore.import(file.storage, file.hash)
  // return await this.link(file.hash, ...linkers)
  // TODO: reimplement .import or something like it
  await this.writeStream(await file.storage.readStream(), { linkers })
}

/**
 * check if attachment store has the requested item
 * @param {string} hash
 * @returns {boolean}
 * @async
 */
exports.has = async function (hash) {
  assert(typeof hash === 'string', 'hash argument must be a hex string')

  return (await Promise.all([
    blobStore.exists(hash),
    metaStore.exists([hash])
  ])).every(x => x === true)
}

/**
 * hold on to an attachment, don't let it get garbage collected until the callback is called
 * triggers .validate() when all hold references are released, clearing out the data unless it
 * has linkers retaining it in filesystem.
 * @param {string} hash - buffer or hex string hash of attachment to hold on to
 * @returns {async function release ()}
 */
const holding = {}
exports.hold = function (hash) {
  assert(typeof hash === 'string', 'hash must be a string')
  if (hash in holding) {
    holding[hash] += 1
  } else {
    holding[hash] = 1
  }

  // create warning here to get a good stacktrace
  const warning = new Error('attachment.hold called, but release wasn\'t called within 10 seconds')
  const warnTimer = setTimeout(() => { console.warn(warning) }, 10000)

  let released = false
  /**
   * release hold on attachment, if no holds remain, will validate and possibly remove it from disk
   * if there are no linker documents to retain it. Async, resolves after all work is done (including possible deletion)
   * @returns {boolean} - false if the attachment stayed on disk, true if it was removed from disk
   * @async
   */
  return async function release () {
    if (released) {
      console.warn('attachments.hold() => release() called multiple times')
      return undefined
    }
    released = true
    clearTimeout(warnTimer)
    holding[hash] -= 1
    if (holding[hash] === 0) {
      delete holding[hash]
      return !(await exports.validate(hash))
    } else {
      return false
    }
  }
}

/**
 * validate an attachment, pruning dead linkers and deleting attachment if it's no longer linked to
 * updating the attachment's metadata, pruning any linkers values that aren't correct
 * @param {string} hash
 * @returns {boolean} - true if the attachment remains in storage, false if it was removed
 * @async
 */
exports.validate = async function (hash) {
  assert(typeof hash === 'string', 'hash argument must be a hex string')

  let retain = false
  await metaStore.update([hash], async meta => {
    if (meta !== undefined) {
      const newLinkers = []
      const hashURL = `hash://sha256/${hash.toLowerCase()}`
      for await (const { path, links } of readPath.meta(meta.linkers)) {
        if (links && Array.isArray(links)) {
          for (const link of links) {
            if (link.toLowerCase().startsWith(hashURL)) {
              newLinkers.push(path)
            }
          }
        }
      }

      if (newLinkers.length > 0) retain = true
      return {
        ...meta,
        linkers: newLinkers
      }
    }
  })

  // if we found valid linkers, keep the attachment
  await tq.lockWhile(['attachments', hash], async () => {
    if (!retain && !(hash in holding)) {
      await Promise.all([blobStore.delete(hash), metaStore.delete([hash])])
    }
  })

  return retain
}
