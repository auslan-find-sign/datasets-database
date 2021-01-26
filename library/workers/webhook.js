const got = require('got')
const codec = require('../models/codec')
const defaults = require('../../package.json').defaults
const objectHash = require('object-hash')
const crypto = require('crypto')

// establish a secret key that's used to sign async responses
const secret = process.env.SECRET ? Buffer.from(process.env.SECRET) : crypto.getRandomValues(64)

module.exports = (webhookURL, viewportUser, viewportName, format = 'json') => {
  return {
    lookup: () => [],
    transform: async (inputID, input, lookups) => {
      const contentType = `application/${format}`
      // info included in query string on return URL if response is deferred
      const queryStringInfo = {
        path: inputID,
        hash: objectHash(input, { algorithm: 'sha256' }),
        viewportUser,
        viewportName,
        key: module.exports.keyGen(inputID, viewportUser, viewportName)
      }
      const queryString = Object.entries(queryStringInfo).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
      const body = codec[format].encode({
        path: inputID,
        returnURL: `${defaults.url}/webhook/viewport-response?${queryString}`,
        input
      })

      const result = await got.post(webhookURL, {
        body,
        headers: {
          'Content-Type': contentType,
          Accepts: contentType
        },
        responseType: format === 'cbor' ? 'buffer' : 'text'
      })

      if (result.statusCode === 200) { // ok
        // we have answers!
        const response = codec[format].decode(result.body)
        if (Array.isArray(response)) {
          return response
        } else {
          throw new Error('Response was not an array')
        }
      } else if (result.statusCode === 202) { // accepted
        // they'll post back later
        return null
      }
    }
  }
}

// generates a signature key to allow write access to webhook response without auth
module.exports.keyGen = (path, user, name) => {
  const hasher = crypto.createHash('sha256')
  hasher.update(secret)
  hasher.update(Buffer.from(`${user}:${name}@${path}`))
  hasher.update(secret)
  return hasher.digest().toString('hex')
}
