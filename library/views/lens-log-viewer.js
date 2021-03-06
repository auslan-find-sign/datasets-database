const layout = require('./layout')
const uri = require('encodeuricomponent-tag')

module.exports = (req, { logsIter }) => {
  return layout(req, async v => {
    await v.panel(async v => {
      v.header(v => {
        v.breadcrumbs(v => {
          v.a('Lenses', { href: '/lenses/' })
          v.iconLink('user-circle', req.params.author, { href: uri`/authors/${req.params.author}/` })
          v.iconLink('3dglasses', req.params.name, { href: uri`/lenses/${req.params.author}:${req.params.name}/` })
          v.a('Lens Build Logs', { href: uri`/lenses/${req.params.author}:${req.params.name}/logs` })
        })

        v.panelTabs(
          { label: 'Lens', href: uri`/lenses/${req.params.author}:${req.params.name}/` },
          { label: 'Edit', href: uri`/lenses/${req.params.author}:${req.params.name}/configuration`, if: req.owner },
          { label: 'Logs', href: uri`/lenses/${req.params.author}:${req.params.name}/logs`, current: true },
          { label: 'Export', href: uri`/lenses/${req.params.author}:${req.params.name}/export` }
        )
      })

      for await (const { input, errors, logs } of logsIter) {
        v.heading({ level: 3 }, v => v.a(input, { href: input }))

        for (const error of errors) {
          v.stacktrace(error)
        }

        if (logs && logs.length > 0) {
          v.heading('console.log/warn/info/error:')
          v.logs(logs)
        }
      }
    })
  })
}
