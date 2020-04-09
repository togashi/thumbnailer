#!/usr/bin/env node

const watcher = require('@parcel/watcher')
const path = require('path')
const fs = require('fs')
const { inspect } = require('util')
const template = require('lodash.template')
const sharp = require('sharp')
const chalk = require('chalk')

const greenOK = chalk.green('OK')
const yellowERR = chalk.yellow('ERROR')

const cli = require('commander')

cli.version('20200409')
    .description('automatically thumbnail generator')
    .arguments('<source_dir> <output_filename_template>')
    .option('-x, --width <width>', 'pixel width of output')
    .option('-y, --height <height>', 'pixel height of output')
    .option('-s, --scale <scale>', 'scale')
    .option('-X, --exclude <pattern>', 'excluded pattern of filename')
    .option('--pre <pre-processing-script-filename>', 'specify pre-processing script file')
    .option('--post <post-processing-script-filename>', 'specify post-processing script file')
    .option('-v, --verbose', 'make output verbosely')
    .action(main)
    .parse(process.argv)

function loadModule(src) {
    if (!src) {
        return src
    } else if (/^\//.test(src)) {
        return require(src)
    } else {
        return require(path.resolve(process.cwd(), src))
    }
}

const preprocessor = loadModule(cli.pre)
const postprocessor = loadModule(cli.post)

function verboseOut(...args) {
    console.info(...args.map(a => chalk.gray(typeof a === 'string' ? a : inspect(a))))
}

async function processOne(src, dst) {
    try {
        const image = sharp(src)
        if (preprocessor) {
            try {
                preprocessor(image)
            } catch (err) {
                console.error(yellowERR, err)
            }
        }
        if (cli.width || cli.height) {
            await image.resize(cli.width, cli.height)
        } else {
            const scale = cli.scale || 0.25
            const metadata = await image.metadata()
            await image.resize(metadata.width * scale)
        }
        if (postprocessor) {
            try {
                postprocessor(image)
            } catch (err) {
                console.error(yellowERR, err)
            }
        }
        await image.toFile(dst)
        console.info(chalk.cyan(`${src} => ${dst}:`), greenOK)
    } catch (err) {
        console.error(chalk.cyan(`${src} => ${dst}:`), yellowERR, err)
    }
}

function pathComponents(src) {
    return {
        path: src,
        ...path.parse(src)
    }
}

async function main(src, dstSpec) {
    const dstTemplate = template(dstSpec, {
        interpolate: /{([\s\S]+?)}/g
    })
    const excludePat = cli.exclude ? RegExp(cli.exclude) : null
    await watcher.subscribe(src, (err, events) => {
        if (err) {
            console.error(yellowERR, err)
            return
        }
        for (const event of events) {
            if (cli.verbose) verboseOut('event:', event)
            if (event.type !== 'update') continue
            if (!fs.statSync(event.path).isFile()) continue
            const pc = pathComponents(event.path)
            if (cli.verbose && excludePat) verboseOut('exclude test:', {
                pattern: excludePat, filename: pc.base
            })
            if (excludePat && excludePat.test(pc.base)) continue
            const dst = dstTemplate(pc)
            processOne(event.path, dst)
        }
    })
}
