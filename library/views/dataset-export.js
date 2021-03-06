const layout = require('./layout')
const uri = require('encodeuricomponent-tag')
const exportFragment = require('./fragment-export')

/**
 * block to build a dataset manual record editor
 * @param {Request} req - express Request
 * @param {string} data - object with state info for the form
 * @param {null|string} error - null or a string with an error message
 */
module.exports = (req, state) => {
  return layout(req, v => {
    v.panel(v => {
      v.header(v => {
        v.breadcrumbs(v => {
          v.a('Datasets', { href: '/datasets/' })
          v.iconLink('user-circle', req.params.author, { href: uri`/authors/${req.params.author}` })
          v.iconLink('cassette', req.params.name, { href: uri`/datasets/${req.params.author}:${req.params.name}/` })
        })

        v.panelTabs(
          { label: 'View', href: uri`/datasets/${req.params.author}:${req.params.name}/` },
          { label: 'Edit', href: uri`/datasets/${req.params.author}:${req.params.name}/configuration`, if: req.owner },
          { label: 'Import', href: uri`/datasets/${req.params.author}:${req.params.name}/import`, if: req.owner },
          { label: 'Export', href: uri`/datasets/${req.params.author}:${req.params.name}/export`, current: true }
        )
      })

      exportFragment(v, req, state)
    })
  })
}
