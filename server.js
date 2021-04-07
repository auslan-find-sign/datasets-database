// server.js
// This is the application server for the Sign Dataset
const settings = require('./library/models/settings')
const timestring = require('timestring')
const express = require('express')
require('express-async-errors')
const cookieSession = require('cookie-session')
const methodOverride = require('method-override')
const crypto = require('crypto')
const process = require('process')
const codec = require('./library/models/codec')
const Vibe = require('./library/vibe/rich-builder')

// create web server
const app = express()

// add sendVibe helper
app.use(Vibe.expressMiddleware)
Vibe.viewsPath = './library/views'
Vibe.iconPath = '/design/icomoon/symbol-defs.svg'

// enable response compression
app.use(require('compression')({}))

// If forms are submitted, parse the data in to request.query and request.body
app.use(express.urlencoded({ extended: true }))

// handle decoding json and cbor
app.use(express.raw({ limit: settings.maxRecordSize, type: Object.keys(codec.mediaTypeHandlers) }))

// log requests
app.use((req, res, next) => {
  console.info(`req ${req.method} ${req.path}`)
  if (req.method !== 'GET') {
    for (const [name, value] of Object.entries(req.headers)) console.info(`  - ${name}: ${value}`)
    if (req.body) {
      console.info('Body:')
      console.info(req.body)
    }
  }
  next()
})

app.use((req, res, next) => {
  const reqType = req.is(...Object.keys(codec.mediaTypeHandlers))
  if (reqType) {
    const specificCodec = codec.for(reqType)
    req.body = specificCodec.decode(req.body)
  }

  next()
})

// allow forms to override method using Rails ?_method= format
app.use(methodOverride((req, res) => (req.query && req.query._method) || (req.body && req.body._method) || req.method))

// allow non-credentialed cors requests to anything by default
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  next()
})

// Give the users a crypto signed cookie, to store session information
// If you'd like your cookies to keep working between app edits, make sure to check out the .env file!
app.use(cookieSession({
  secret: process.env.SECRET || crypto.randomBytes(64).toString('base64')
}))

app.use(require('./library/models/auth').basicAuthMiddleware)

// make all the files in 'public' available
// https://expressjs.com/en/starter/static-files.html
app.use(express.static('public'))
app.use('/npm', express.static('node_modules'))

app.use(require('./library/controllers/auth-controller'))
app.use(require('./library/controllers/attachment-controller'))
app.use(require('./library/controllers/dataset-controller'))
app.use(require('./library/controllers/lens-controller'))
app.use(require('./library/controllers/export-controller'))
app.use(require('./library/controllers/meta-controller'))

app.get('/', (req, res) => {
  res.sendVibe('homepage', settings.title)
})

app.use((req, res, next) => {
  const err = new Error('Path not Found, web address maybe incorrect')
  err.httpCode = 404
  err.code = 'Path Not Found'
  throw err
})

app.use((error, req, res, next) => {
  if (error.statusCode) {
    res.status(error.statusCode)
  } else if (error.code === 'ENOENT') {
    res.status(404) // something tried to read a file that doesn't exist
  } else if (error.name === 'SyntaxError' || error.stack.includes('/borc/src/decoder.js')) {
    res.status(400) // parse errors are likely to be clients sending malformed data
  } else {
    res.status(500)
  }

  if (req.path !== '/favicon.ico') {
    console.error(`For ${req.method} ${req.path}`)
    console.error(error.name + ' Error: ' + error.message)
    console.error(error.stack)
  }

  if (req.accepts('html')) {
    res.sendVibe('error-handler', 'Request Error', error)
  } else {
    codec.respond(req, res, {
      error: error.message,
      stack: req.auth === 'admin' && error.stack
    })
  }
})

const port = process.env.PORT || 3000
app.listen(port, '127.0.0.1', () => {
  console.log(`Application Server ready at http://localhost:${port}/`)
})
