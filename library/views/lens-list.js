const layout = require('./layout')
const uri = require('encodeuricomponent-tag')

module.exports = (req, { list }) => {
  return layout(req, v => {
    v.panel(v => {
      v.header(v => {
        v.breadcrumbs(v => v.a('Lenses', { href: '/lenses/' }))
      })

      for (const [user, tapes] of Object.entries(list)) {
        v.heading({ level: 3 }, v => {
          v.iconLink('user-circle', user, { href: uri`/users/${user}/` })
          v.text(':')
        })
        v.ul(v => {
          for (const tape of tapes) {
            v.li(v => v.iconLink('3dglasses', tape, { href: uri`/lenses/${user}:${tape}/` }))
          }
        })
      }

      if (req.session.auth) {
        v.footer(v => v.button('Create', { href: '/lenses/create' }))
      }
    })
  })
}
