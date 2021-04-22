/**
 * Attachment Storage is a content addressed store of data blobs, i.e. video files
 */
const assert = require('assert')
const readPath = require('./read-path')
const HashThrough = require('hash-through')
const crypto = require('crypto')
const fs = require('fs/promises')
const tq = require('tiny-function-queue')

// final location blobs are moved in to
const blobStore = require('./file/blob').instance({
  extension: '.data',
  rootPath: ['attachments', 'blobs']
})

// metadata storage for blobs
const metaStore = require('./file/cbor').instance({
  rootPath: ['attachments', 'meta']
})

/**
 * Get a local filesystem path to the blob data of the attachment content hash
 * Note: this does not validate the content exists
 * @param {Buffer|string} hash
 * @returns {string} local filesystem path
 */
exports.getPath = function (hash) {
  if (typeof hash === 'string') hash = Buffer.from(hash, 'hex')
  assert(Buffer.isBuffer(hash), 'hash argument must be a buffer or hex string')

  return blobStore.getPath(hash)
}

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

  const tempPath = [`attachment-write-stream-temp-${crypto.randomBytes(20).toString('hex')}`]
  const hasher = new HashThrough(blobStore.getHashObject)
  await blobStore.raw.writeStream(tempPath, stream.pipe(hasher))
  const hash = hasher.digest()
  const hexHash = hash.toString('hex')
  const dataPath = [hexHash]
  const release = exports.hold(hexHash)

  return await tq.lockWhile(['attachments', hexHash], async () => {
    await metaStore.update([hexHash], async oldValue => {
      try {
        await blobStore.raw.rename(tempPath, dataPath)
      } catch (err) {
        await blobStore.raw.delete(tempPath)
      }

      return {
        created: Date.now(),
        ...oldValue || {},
        updated: Date.now(),
        ...meta,
        linkers: [...new Set([...(oldValue || {}).linkers || [], ...meta.linkers])]
      }
    })
    return { hash, release }
  })
}

/**
 * Read an attachment's contents as a stream
 * @param {Buffer|string} hash - content hash of the attachment to read
 * @returns {Readable}
 * @async
 */
exports.readStream = async function (hash) {
  if (typeof hash === 'string') hash = Buffer.from(hash, 'hex')
  assert(Buffer.isBuffer(hash), 'hash argument must be a buffer or hex string')

  return blobStore.readStream(hash)
}

/**
 * Read metadata object of an attachment, notably containing linkers array, and ms epoch created and updated timestamps
 * @param {Buffer|string} hash
 * @returns {object}
 * @async
 */
exports.readMeta = async function (hash) {
  if (typeof hash === 'string') hash = Buffer.from(hash, 'hex')
  assert(Buffer.isBuffer(hash), 'hash argument must be a buffer or hex string')

  return await metaStore.read([hash.toString('hex')])
}

/**
 * Add a link to an attachment
 * @param {Buffer|string} hash - attachment content hash
 * @param {...string} dataPath - path to record linking to attachment
 */
exports.link = async function (hash, ...dataPaths) {
  const hexHash = hash.toString('hex')
  return await tq.lockWhile(['attachments', hexHash], async () => {
    await metaStore.update([hexHash], meta => {
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

/** import an attachment from the filesystem with a precomputed hash
 * !!! This is really dangerous and potentially leaky. Do not trust outside users specifying what the hash is
 * This exists only as a utility for form file submissions where hash is computed during upload
 */
exports.import = async function ({ path, hash, linkers }) {
  // if we already have the attachment, just make sure the linkers are up to date in it's metadata
  if (await this.has(hash)) {
    await this.link(hash, ...linkers)
  } else {
    // this could be more efficient, in the future it could attempt to hardlink or copy on write duplication, but for now, this will do
    const result = await this.writeStream(fs.createReadStream(path), { linkers })
    if (result.hash.toString('hex') !== hash.toString('hex')) throw new Error('Hashes do not match! Bad things are happening!')
  }
}

/**
 * check if attachment store has the requested item
 * @param {Buffer|string} hash
 * @returns {boolean}
 * @async
 */
exports.has = async function (hash) {
  if (typeof hash === 'string') hash = Buffer.from(hash, 'hex')
  assert(Buffer.isBuffer(hash), 'hash argument must be a buffer or hex string')

  return (await Promise.all([
    blobStore.exists(hash),
    metaStore.exists([hash.toString('hex')])
  ])).every(x => x === true)
}

/**
 * hold on to an attachment, don't let it get garbage collected until the callback is called
 * triggers .validate() when all hold references are released, clearing out the data unless it
 * has linkers retaining it in filesystem.
 * @param {Buffer|string} hash - buffer or hex string hash of attachment to hold on to
 * @returns {async function release ()}
 */
const holding = {}
exports.hold = function (hash) {
  if (Buffer.isBuffer(hash)) hash = hash.toString('hex')
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
 * @param {Buffer|string} hash
 * @returns {boolean} - true if the attachment remains in storage, false if it was removed
 * @async
 */
exports.validate = async function (hash) {
  if (typeof hash === 'string') hash = Buffer.from(hash, 'hex')
  assert(Buffer.isBuffer(hash), 'hash argument must be a buffer or hex string')
  const hexHash = hash.toString('hex')

  let retain = false
  await metaStore.update([hexHash], async meta => {
    if (meta !== undefined) {
      const newLinkers = []
      const hashURL = `hash://sha256/${hexHash.toLowerCase()}`
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
  await tq.lockWhile(['attachments', hexHash], async () => {
    if (!retain && !(hexHash in holding)) {
      await Promise.all([blobStore.delete(hash), metaStore.delete([hexHash])])
    }
  })

  return retain
}
