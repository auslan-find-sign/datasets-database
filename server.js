// server.js
// This is the application server for the Sign Dataset
const defaults = require('./package.json').defaults
const express = require('express')
const cookieSession = require('cookie-session')
const crypto = require('crypto')
const process = require('process')
// Phoenix's UI toolkit
// const ui = require('./library/ui')
const serverTools = require('./library/server-tools')
const standardPage = require('./library/views/standard-page')
const codec = require('./library/models/codec')
// const Bell = require('./library/bell')

// const html = require('nanohtml')

// create web server
const app = express()

// If forms are submitted, parse the data in to request.query and request.body
app.use(express.urlencoded({ extended: true }))
// If JSON is submitted, parse that in to request.body
app.use(express.raw({ limit: defaults.maxPostSize, type: ['application/json', 'application/cbor'] }))
app.use((req, res, next) => {
  try {
    if (req.is('application/json')) {
      req.body = codec.json.decode(req.body.toString())
    } else if (req.is('application/cbor')) {
      req.body = codec.cbor.decode(req.body)
    }
    next()
  } catch (err) {
    codec.respond(req, res.status(415), { err: `Problem parsing request body: ${err.message}` })
  }
})

// enable response compression
app.use(require('compression')())

// allow non-credentialed cors requests to anything by default
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  next()
})

app.use(require('./library/models/auth').basicAuthMiddleware)

// Give the users a crypto signed cookie, to store session information
// If you'd like your cookies to keep working between app edits, make sure to check out the .env file!
app.use(cookieSession({
  secret: process.env.SECRET || crypto.randomBytes(64).toString('base64')
}))

// make all the files in 'public' available
// https://expressjs.com/en/starter/static-files.html
app.use(express.static('public'))

// this allows web browsers to download a compiled version of the UI toolkit's javascript code
app.use(serverTools.clientScriptsMiddleware())

app.use(require('./library/controllers/auth-controller'))
app.use(require('./library/controllers/attachment-controller'))
app.use(require('./library/controllers/dataset-controller'))
// app.use(require('./library/controllers/lens-controller'))

app.get('/', (req, res) => {
  serverTools.sendWebpage(req, res, {
    title: 'Datasets',
    contents: standardPage(req, [
      'Hello World'
    ])
  })
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Application Server ready at http://localhost:${port}/`)
})
