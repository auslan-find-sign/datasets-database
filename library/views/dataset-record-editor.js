const layout = require('./layout')
const uri = require('encodeuricomponent-tag')

/**
 * block to build a dataset manual record editor
 * @param {Request} req - express Request
 * @param {string} data - object with state info for the form
 * @param {null|string} error - null or a string with an error message
 */
module.exports = (req, data, error = null) => {
  return layout(req, v => {
    if (data.sidebar) {
      v.sidebar(v => {
        v.heading('Records')

        v.ul(v => {
          for (const recordID of data.sidebar.recordIDs) {
            const attribs = recordID === req.params.recordID ? { class: 'selected' } : {}
            v.li(attribs, v => v.a(recordID, { href: uri`/datasets/${req.params.author}:${req.params.name}/records/${recordID}?edit=1` }))
          }
        })
      })
    }

    v.form({ method: 'PUT', action: '?edit=1' }, v => {
      v.panel(v => {
        v.header(v => {
          v.breadcrumbs(v => {
            v.a('Datasets', { href: '/datasets/' })
            v.iconLink('user-circle', req.params.author, { href: uri`/authors/${req.params.author}` })
            v.iconLink('cassette', req.params.name, { href: uri`/datasets/${req.params.author}:${req.params.name}/` })
            if (data.create) {
              v.iconLink('newspaper', 'Add Record', { href: uri`/datasets/${req.params.author}:${req.params.name}/create-record` })
            } else {
              v.iconLink('newspaper', req.params.recordID, { href: uri`/datasets/${req.params.author}:${req.params.name}/records/${req.params.recordID}` })
            }
          })

          if (req.owner && !data.create) {
            v.panelTabs(
              { label: 'View', href: uri`/datasets/${req.params.author}:${req.params.name}/records/${req.params.recordID}` },
              { label: 'Edit', href: uri`/datasets/${req.params.author}:${req.params.name}/records/${req.params.recordID}?edit=1`, current: true }
            )
          }
        })

        if (error) {
          v.p(v => { v.glitch('Error: '); v.text(error) })
        }

        if (data.create) {
          v.dl(v => {
            v.dt('Record ID')
            v.dd(v => v.input({ name: 'recordID', value: data.recordID, minlength: 1, maxlength: 250, autocomplete: 'off' }))
          })
        }

        v.sourceCodeEditor('recordData', 'json5', data.recordData, { class: ['expand'], ace: { maxLines: 1000 } })

        v.footer(v => {
          v.button('Save', { type: 'submit' })
          if (!data.create) {
            v.button('Delete', { type: 'submit', formmethod: 'DELETE', formaction: uri`/datasets/${req.params.author}:${req.params.name}/records/${data.recordID}` })
          }
        })
      })
    })
  })
}
