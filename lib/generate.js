const chalk = require('chalk')
const Metalsmith = require('metalsmith')
const Handlebars = require('handlebars')
const async = require('async')
const render = require('consolidate').handlebars.render
const path = require('path')
const multimatch = require('multimatch')
const getOptions = require('./options')
const ask = require('./ask')
const filter = require('./filter')
const logger = require('./logger')
const fs = require('fs')
const rm = require('rimraf').sync
const inquirer = require('inquirer')

// register handlebars helper
Handlebars.registerHelper('if_eq', function (a, b, opts) {
  return a === b
    ? opts.fn(this)
    : opts.inverse(this)
})

Handlebars.registerHelper('unless_eq', function (a, b, opts) {
  return a === b
    ? opts.inverse(this)
    : opts.fn(this)
})

/**
 * Generate a template given a `src` and `dest`.
 *
 * @param {String} name
 * @param {String} src
 * @param {String} dest
 * @param {Function} done
 */

module.exports = function generate (name, src, dest, done) {
  const savePath = path.join(src, 'save.json')
  const opts = getOptions(name, src)
  const metalsmith = Metalsmith(path.join(src, 'template'))
  const data = Object.assign(metalsmith.metadata(), {
    destDirName: name,
    inPlace: dest === process.cwd(),
    noEscape: true
  })
  opts.helpers && Object.keys(opts.helpers).map(key => {
    Handlebars.registerHelper(key, opts.helpers[key])
  })

  const helpers = { chalk, logger }

  if (opts.metalsmith && typeof opts.metalsmith.before === 'function') {
    opts.metalsmith.before(metalsmith, opts, helpers)
  }

  if (fs.existsSync(savePath)) {
    inquirer.prompt([{
      name: 'useSave',
      type: 'confirm',
      message: 'Use a saved config?'
    }]).then(answer => {
      if (answer.useSave) {
        var savedConfig = fs.readFileSync(savePath).toString()
        Object.assign(metalsmith.metadata(), JSON.parse(savedConfig))
        metalsmith.metadata().destDirName = data.destDirName
        metalsmith.metadata().inPlace = data.inPlace
        metalsmith.metadata().noEscape = data.noEscape
        metalsmith.use(filterFiles(opts.filters))
          .use(renderTemplateFiles(opts.skipInterpolation, savePath))

        if (typeof opts.metalsmith === 'function') {
          opts.metalsmith(metalsmith, opts, helpers)
        } else if (opts.metalsmith && typeof opts.metalsmith.after === 'function') {
          opts.metalsmith.after(metalsmith, opts, helpers)
        }

        metalsmith.clean(false)
          .source('.') // start from template root instead of `./src` which is Metalsmith's default for `source`
          .destination(dest)
          .build((err, files) => {
            done(err)
            if (typeof opts.complete === 'function') {
              const helpers = { chalk, logger, files }
              opts.complete(data, helpers)
            } else {
              logMessage(opts.completeMessage, data)
            }
          })

        return data
      } else {
        metalsmith.use(askQuestions(opts.prompts))
          .use(filterFiles(opts.filters))
          .use(renderTemplateFiles(opts.skipInterpolation, savePath))

        if (typeof opts.metalsmith === 'function') {
          opts.metalsmith(metalsmith, opts, helpers)
        } else if (opts.metalsmith && typeof opts.metalsmith.after === 'function') {
          opts.metalsmith.after(metalsmith, opts, helpers)
        }

        metalsmith.clean(false)
          .source('.') // start from template root instead of `./src` which is Metalsmith's default for `source`
          .destination(dest)
          .build((err, files) => {
            done(err)
            if (typeof opts.complete === 'function') {
              const helpers = { chalk, logger, files }
              opts.complete(data, helpers)
            } else {
              logMessage(opts.completeMessage, data)
            }
          })

        return data
      }
    })
  } else {
    metalsmith.use(askQuestions(opts.prompts))
      .use(filterFiles(opts.filters))
      .use(renderTemplateFiles(opts.skipInterpolation, savePath))

    if (typeof opts.metalsmith === 'function') {
      opts.metalsmith(metalsmith, opts, helpers)
    } else if (opts.metalsmith && typeof opts.metalsmith.after === 'function') {
      opts.metalsmith.after(metalsmith, opts, helpers)
    }

    metalsmith.clean(false)
      .source('.') // start from template root instead of `./src` which is Metalsmith's default for `source`
      .destination(dest)
      .build((err, files) => {
        done(err)
        if (typeof opts.complete === 'function') {
          const helpers = { chalk, logger, files }
          opts.complete(data, helpers)
        } else {
          logMessage(opts.completeMessage, data)
        }
      })

    return data
  }
}

/**
 * Create a middleware for asking questions.
 *
 * @param {Object} prompts
 * @return {Function}
 */

function askQuestions (prompts) {
  return (files, metalsmith, done) => {
    ask(prompts, metalsmith.metadata(), done)
  }
}

/**
 * save the config
 *
 * @param {String} savePath
 * @return {Function}
 */

/**
 * Create a middleware for filtering files.
 *
 * @param {Object} filters
 * @return {Function}
 */

function filterFiles (filters) {
  return (files, metalsmith, done) => {
    filter(files, filters, metalsmith.metadata(), done)
  }
}

/**
 * Template in place plugin.
 *
 * @param {Object} files
 * @param {Metalsmith} metalsmith
 * @param {Function} done
 */

function renderTemplateFiles (skipInterpolation, savePath) {
  skipInterpolation = typeof skipInterpolation === 'string'
    ? [skipInterpolation]
    : skipInterpolation
  return (files, metalsmith, done) => {
    const keys = Object.keys(files)
    const metalsmithMetadata = metalsmith.metadata()
    console.log()
    inquirer.prompt([{
      name: 'save',
      type: 'confirm',
      message: 'Save the config?'
    }]).then(answer => {
      if (answer.save) {
        try {
          if (fs.existsSync(savePath)) rm(savePath)
          fs.appendFileSync(savePath, JSON.stringify(metalsmithMetadata))
        } catch (err) {
          /* 处理错误 */
          console.log(chalk.red('there is a error on save.json'))
        }
      }
      async.each(keys, (file, next) => {
        // skipping files with skipInterpolation option
        if (skipInterpolation && multimatch([file], skipInterpolation, { dot: true }).length) {
          return next()
        }
        const str = files[file].contents.toString()
        // do not attempt to render files that do not have mustaches
        if (!/{{([^{}]+)}}/g.test(str)) {
          return next()
        }
        render(str, metalsmithMetadata, (err, res) => {
          if (err) {
            err.message = `[${file}] ${err.message}`
            return next(err)
          }
          files[file].contents = Buffer.from(res)
          next()
        })
      }, done)
    })
  }
}

/**
 * Display template complete message.
 *
 * @param {String} message
 * @param {Object} data
 */

function logMessage (message, data) {
  if (!message) return
  render(message, data, (err, res) => {
    if (err) {
      console.error('\n   Error when rendering template complete message: ' + err.message.trim())
    } else {
      console.log('\n' + res.split(/\r?\n/g).map(line => '   ' + line).join('\n'))
    }
  })
}
