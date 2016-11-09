'use strict';

var path = require('path');
var fs = require('fs');
var through = require('through2');
var gutil = require('gulp-util');
var extend = require('object-assign');
var File = require('vinyl');
var chalk = require('chalk');

var PluginError = gutil.PluginError;

module.exports = function (options) {
  options = extend({
    schemelessUrlFix: 'http:',
  }, options);

  if (typeof options.schemelessUrlFix === 'string') {
    var scheme = options.schemelessUrlFix;
    if (scheme.charAt(scheme.length - 1) !== ':') {
      scheme += ':';
    }
    options.schemelessUrlFix = function (url) {
      return scheme + url;
    };
  }

  if (options.schemelessUrlFix && typeof options.schemelessUrlFix !== 'function') {
    throw new Error('gulp-htmlcpr: ' +
      'schemelessUrlFix should be either a string or a function');
  }

  if (options.blacklistFn && typeof options.blacklistFn !== 'function') {
    throw new Error('gulp-htmlcpr: ' +
      'blacklistFn should be either a string or a function');
  }

  if (options.overwritePath && typeof options.overwritePath !== 'function') {
    throw new Error('gulp-htmlcpr: ' +
      'overwritePath should be a function');
  }

  return through.obj(function (file, enc, cb) {
    if (file.isNull() || file.isDirectory()) {
      return cb();
    }

    if (file.isStream()) {
      this.emit('error', new PluginError('htmlcpr', 'Streaming not supported'));
      return cb();
    }

    var traverser = new LinkTraverser(extend({
      rootDir: file.base,
      norecDir: null,
    }, options));

    try {
      traverser.process(file);
    } catch (err) {
      return cb(new PluginError('htmlcpr', err));
    }

    for (var i = 0; i < traverser.files.length; i++) {
      this.push(traverser.files[i]);
    }
    cb();
  });
};

function LinkTraverser(options) {
  this.rootDir = options.rootDir;
  this.norecDir = options.norecDir || '../';
  if (this.norecDir[this.norecDir.length - 1] !== '/') {
    this.norecDir += '/';
  }
  this.blacklistFn = options.blacklistFn;
  this.skipFn = options.skipFn;
  this.schemelessUrlFix = options.schemelessUrlFix;
  this.overwritePath = options.overwritePath;
  this.verbose = options.verbose;
  this.files = [];
  this.fileNames = {};
}

LinkTraverser.prototype.log = function () {
  if (this.verbose) {
    console.log.apply(console, Array.prototype.slice.call(arguments));
  }
};

LinkTraverser.prototype.push = function (file) {
  var filepath = file.__newRelativePath || file.relative;

  if (filepath in this.fileNames) {
    return;
  }

  this.files.push(file);
  this.fileNames[filepath] = true;
};

// XXX handle inifinite recursion
LinkTraverser.prototype.process = function (file) {
  this.log(' .. Processing', chalk.cyan(file.relative));

  if (file.isDirectory()) {
    this.log('Skipping dir', chalk.yellow(file.relative));
    return;
  }

//   if (this.isExternalPath(file)) {
//     grunt.fail.warn('Cannot copy external path', chalk.yellow(src));
//     return;
//   }

  if (this.isNorecPath(file)) {
    this.log('Copying excluded file as is', chalk.yellow(file.relative));
    this.push(file);
    return;
  }

  var contents;

  switch (getFileType(file)) {
  case 'html':
    this.log('Processig HTML file', chalk.yellow(file.relative));

    contents = replaceHtmlUrls(file.contents.toString(), function (url) {
      return this.processUrl(file, url);
    }.bind(this), this);
    file.contents = new Buffer(contents);
    file.stat.size = contents.length;

    this.push(file);
    return;

  case 'css':
    this.log('Processig CSS file', chalk.yellow(file.relative));

    contents = replaceCssUrls(file.contents.toString(), function (url) {
      return this.processUrl(file, url);
    }.bind(this), this);
    file.contents = new Buffer(contents);
    file.stat.size = contents.length;

    this.push(file);
    return;

  default:
    this.log('Copying unknown file as is', chalk.yellow(file.relative));
    this.push(file);
    return;
  }
};

LinkTraverser.prototype.processUrl = function (file, url) {
  if (isRemoteUrl(url)) {
    this.log('Skipping remote url: ' + chalk.yellow(url) + '...');
    if (isSchemeLess(url) && this.schemelessUrlFix) {
      url = this.schemelessUrlFix(url);
    }
    return url;
  }

  if (isDataUri(url)) {
    var uriPrefix = url.substring(0, 12) + '...';
    this.log('Skipping data uri: ' + chalk.yellow(uriPrefix) + '...');
    return url;
  }

  var strippedPath = getUrlPath(url);
  if (!url) {
    this.log('Skipping empty url: ' + chalk.yellow(url) + '...');
    return url;
  }

  if (this.skipFn && this.skipFn(url, file.relative)) {
    this.log('Skipping user-filtered url: ' + chalk.yellow(url) + '...');
    return url;
  }

  if (this.blacklistFn && this.blacklistFn(url, file.relative)) {
    this.log('Ignoring user-blacklisted url: ' + chalk.yellow(url) + '...');
    return '';
  }

  var refPathFromBase, refPathFromFile;
  if (strippedPath.charAt(0) === '/') {
    var inversedFilePath = path.relative(path.dirname(file.relative), '.');
    strippedPath = strippedPath.substr(1, strippedPath.length - 1);
    refPathFromBase = path.join(file.base, strippedPath);
    refPathFromFile = path.join(inversedFilePath, strippedPath);
  } else {
    refPathFromBase = path.join(path.dirname(file.path), strippedPath);
    refPathFromFile = strippedPath;
  }

  this.log('Opening', chalk.yellow(refPathFromBase), '(' + refPathFromFile + ')', '...');
  // XXX find a better way to read a file from FS
  var referencedFile = new File({
    cwd: file.cwd,
    base: file.base,
    path: refPathFromBase,
    __newRelativePath: '',
    contents: fs.readFileSync(refPathFromBase),
    stat: fs.statSync(refPathFromBase),
  });

  if (this.overwritePath) {
    referencedFile.__newRelativePath =
      this.overwritePath(referencedFile.relative);
  }

  this.process(referencedFile);

  // Now after the file is processed, replace it old path
  // with the new one.
  if (referencedFile.__newRelativePath) {
    referencedFile.path = path.join(referencedFile.base,
      referencedFile.__newRelativePath);
  }

  return path.relative(path.dirname(file.__newRelativePath || file.relative),
    referencedFile.__newRelativePath || referencedFile.relative);
};

LinkTraverser.prototype.isExternalPath = function (file) {
  return relativePath(this.rootDir, file.relative).substring(0, 3) === '../';
};

LinkTraverser.prototype.isNorecPath = function (file) {
  var pathFromRoot = relativePath(this.rootDir, file.path);

  return pathFromRoot.substring(0, this.norecDir.length) === this.norecDir;
};

var getFileType = function (file) {
  switch (path.extname(file.path)) {
    case '.html':
    case '.htm':
      return 'html';

    case '.css':
      return 'css';
  }
};

var replaceUrlLogWrapper = function (type, replaceUrl, logger) {
  return function (_, prefix, url, suffix) {
    if (!url) {
      logger.log('empty url stays empty');
      return _;
    }

    var newurl = replaceUrl(url);

    if (newurl === url) {
      logger.log(type + ' url did not change:', chalk.cyan(url));
      return _;
    }

    logger.log(type + ' url was replaced:',
      chalk.cyan(url), '->', chalk.cyan(newurl));
    return prefix + newurl + suffix;
  };
};

var replaceHtmlUrls = function (content, replaceUrl, logger) {
  // According to http://www.ecma-international.org/ecma-262/5.1/#sec-15.10.2.6:
  // a word boundary `\b` is defined as `[^a-zA-Z0-9_]`.
  // For better HTML parsing, we define the word boundary as `[^-a-zA-Z0-9_]`,
  // that is `-` is a word character
  return content
    .replace(/(<script[^>]*?[^-a-zA-Z0-9_]src=["'])([^"']+?)(["'][^>]*?>(.|\n)*?<\/script>)/g,
      replaceUrlLogWrapper('script', replaceUrl, logger))
    .replace(/(<link[^>]*?[^-a-zA-Z0-9_]href=["'])([^"']+?)(["'][^>]*?\/?>)/g,
      replaceUrlLogWrapper('link', replaceUrl, logger))
    .replace(/(<img[^>]*?[^-a-zA-Z0-9_]src=["'])([^"']+?)(["'][^>]*?\/?>)/g,
      replaceUrlLogWrapper('image', replaceUrl, logger))
    ;
};

var replaceCssUrls = function (content, replaceUrl, logger) {
  return content
    .replace(/([^-a-zA-Z0-9_]url\([ '"]*)([^)'"]*)([ '"]*\))/g,
      replaceUrlLogWrapper('in-CSS', replaceUrl, logger))
    ;
};

var isRemoteUrl = function (url) {
  return /^([a-z]+:)?\/\//.test(url);
};

var isSchemeLess = function (url) {
  return url.charAt(0) === '/' && url.charAt(1) === '/';
};

var getUrlPath = function (url) {
  return url.replace(/\?.*$/, '').replace(/#.*$/, '');
};

var relativePath = function (from, to) {
  return path.relative(path.resolve(from), path.resolve(to));
};

var isDataUri = function (url) {
  // data-uri scheme
  // data:[<media type>][;charset=<character set>][;base64],<data>
  return /^(data:)([\w\/\+]+);(charset=[\w-]+|base64).*,/gi.test(url);
};
