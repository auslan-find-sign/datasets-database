/**
 * Codecs library, implements all the different formats Pigeon Optics can work with
 */
exports.cbor = require('./cbor')
exports.json = require('./json')
exports.jsonLines = require('./json-lines')
exports.yaml = require('./yaml')
exports.msgpack = require('./msgpack')
exports.xml = require('./xml')
exports.v8 = require('./v8')
exports.html = require('pigeonmark-html')
exports.javascript = require('./javascript')

exports.path = require('./path')
exports.objectHash = require('./object-hash')
exports.respond = require('./respond')

// build a mediaTypeHandlers list
exports.mediaTypeHandlers = Object.fromEntries(Object.values(exports).flatMap(value => {
  if (value && typeof value === 'object' && Array.isArray(value.handles)) {
    return value.handles.map(mediaType => [mediaType, value])
  }
  return []
}))

exports.extensionHandlers = Object.fromEntries(Object.values(exports).flatMap(value => {
  if (value && typeof value === 'object' && Array.isArray(value.extensions)) {
    return value.extensions.map(ext => [ext.toLowerCase(), value])
  }
  return []
}))

/**
 * returns codec if a matching media type or file extension is found, otherwise undefined
 * @param {string} query
 * @returns {object|undefined}
 */
exports.for = function (query) {
  query = `${query}`.toLowerCase()
  if (exports.mediaTypeHandlers[query.split(';')[0]]) {
    return exports.mediaTypeHandlers[query]
  } else {
    for (const ext in exports.extensionHandlers) {
      if (query === ext || query.endsWith(`.${ext}`)) {
        return exports.extensionHandlers[ext]
      }
    }
  }
}

// an array of file extensions the codec can read and write
exports.exts = Object.keys(exports.extensionHandlers)
