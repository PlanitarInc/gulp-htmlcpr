/* jshint node: true */
/* global describe, it, beforeEach */
'use strict';

var assert = require('assert');
var process = require('process');
var path = require('path');
var fs = require('fs');
var File = require('vinyl');
var walk = require('fs-walk');
var sha1 = require('sha1');
var _ = require('lodash');
var htmlcpr = require('../index');
require('mocha');

var COMPARE_FILE_CONTENT = false;

describe('gulp-htmlcpr', function () {

  it('should ignore directory src file', function (done) {
    var fakeFile = new File({
      cwd: __dirname,
      base: __dirname,
      path: path.join(__dirname, 'fixtures'),
      stat: {
        isDirectory: function () { return true; },
      },
    });
    var outputFiles = [];
    var stream = htmlcpr();

    stream.on('data', function (file) {
      outputFiles.push(file);
    });

    stream.on('end', function () {
      assert.deepEqual(getFileArrSummary(outputFiles), []);
      assert.equal(outputFiles.length, 0);
      done();
    });

    stream.write(fakeFile);
    stream.end();
  });

  it('should copy all unknown files as is', function (done) {
    runTestCase([
      'test/fixtures/images/bed.jpg',
      'test/fixtures/fonts/fontawesome-webfont.ttf',
      'test/fixtures/misc/readdir.txt',
      'test/fixtures/images/almond.jpg',
    ], undefined, 'test/expected/copy_unknown_sources', done);
  });

  it('should respect the set cwd directory', function (done) {
    runTestCase([
      'images/bed.jpg',
      'fonts/fontawesome-webfont.ttf',
      'misc/readdir.txt',
      'images/almond.jpg',
    ], {
      cwd: 'test/fixtures',
    }, 'test/expected/enforced_cwd', done);
  });

  it('should respect the set base option', function (done) {
    runTestCase([
      'test/fixtures/images/christmas.jpg',
    ], {
      base: 'test/fixtures',
    }, 'test/expected/enforced_root_dir', done);
  });

  it('should copy HTML file with no links AS IS', function (done) {
    runTestCase([
      'test/fixtures/page_no_links.html',
    ], {
      base: 'test/fixtures',
    }, 'test/expected/page_no_links', done);
  });

  it('should recursively copy local lins', function (done) {
    runTestCase([
      'test/fixtures/page_simple.html',
    ], {
      base: 'test/fixtures',
    }, 'test/expected/page_simple', done);
  });

  it('should ignore remote links', function (done) {
    runTestCase([
      'test/fixtures/page_remote_links.html',
    ], {
      base: 'test/fixtures',
    }, 'test/expected/page_remote_links', done);
  });

  it('should fix schema-less remote links - default', function (done) {
    runTestCase([
      'test/fixtures/page_remote_links_schemaless.html',
    ], {
      base: 'test/fixtures',
    }, 'test/expected/page_remote_links_schemaless_default', done);
  });

  it('should fix schema-less remote links - string', function (done) {
    runTestCase([
      'test/fixtures/page_remote_links_schemaless.html',
    ], {
      base: 'test/fixtures',
      schemelessUrlFix: 'https',
    }, 'test/expected/page_remote_links_schemaless_string', done);
  });

  it('should fix schema-less remote links - function', function (done) {
    runTestCase([
      'test/fixtures/page_remote_links_replace_fn.html',
    ], {
      base: 'test/fixtures',
      schemelessUrlFix: function (url, src) {
        if (/apple-touch-icon-2.png$/.test(url)) {
          return 'asd:' + url;
        }
        return url;
      },
    }, 'test/expected/page_remote_links_replace_fn', done);
  });

  it('should recursively process CSS files', function (done) {
    runTestCase([
      'test/fixtures/page_with_css_url.html',
    ], {
      base: 'test/fixtures',
    }, 'test/expected/page_with_css_url', done);
  });

  it('should repect norec option', function (done) {
    runTestCase([
      'test/fixtures/page_norec_urls.html',
    ], {
      base: 'test/fixtures',
      // Files withing the directory are copied but the links in these files
      // are not.
      norecDir: 'css',
    }, 'test/expected/page_norec_urls', done);
  });

  it('should call the provided blacklist function', function (done) {
    runTestCase([
      'test/fixtures/page_filter_fn.html',
    ], {
      base: 'test/fixtures',
      blacklistFn: function (url, src) {
        // Exclude 'image/almond.jpg' but only when it is included from
        // 'page_filter_fn.html'
        return src === 'page_filter_fn.html' && url === '/images/almond.jpg';
      },
    }, 'test/expected/page_filter_fn', done);
  });

  it('should call the provided skip function', function (done) {
    runTestCase([
      'test/fixtures/page_skip_fn.html',
    ], {
      base: 'test/fixtures',
      skipFn: function (url, src) {
        // Skip processing of blacklist function to prevent replacing urls
        return src === 'page_skip_fn.html' && url === '/images/almond.jpg';
      }
    }, 'test/expected/page_skip_fn', done);
  });

  it('should hanlde HTML file in a subdir', function (done) {
    runTestCase([
      'test/fixtures/subdir/index.html',
    ], {
      base: 'test/fixtures',
    }, 'test/expected/page_subdir', done);
  });

  it('should hanlde a complex HTML file', function (done) {
    runTestCase([
      'test/fixtures/page_complex.html',
    ], {
      base: 'test/fixtures',
    }, 'test/expected/page_complex', done);
  });

});

var runTestCase = function (srcFiles, options, expectedDir, done) {
  var stream = htmlcpr(options || {});
  var outputFiles = [];

  stream.on('data', function (file) {
    outputFiles.push(file);
  });

  stream.on('end', function () {
    var actual = getFileArrSummary(outputFiles);
    var expected = getDirSummary(expectedDir);

    for (var i = 0; i < expected.length; i++) {
      if (COMPARE_FILE_CONTENT) {
        expected[i].__content = expected[i].__content.split('\n');
      } else {
        delete expected[i].__content;
      }
    }
    for (var j = 0; j < actual.length; j++) {
      if (COMPARE_FILE_CONTENT) {
        actual[j].__content = actual[j].__content.split('\n');
      } else {
        delete actual[j].__content;
      }
    }

    assert.deepEqual(_.map(actual, 'filepath'), _.map(expected, 'filepath'));
    assert.deepEqual(actual, expected);
    done();
  });

  srcFiles.forEach(function (filepath) {
    stream.write(readFile(filepath, options));
  });
  stream.end();
};

var getFileArrSummary = function (files) {
  var res = [];

  files.map(function (file) {
    var content = file.contents.toString();

    res.push({
      filepath: file.relative,
      size: file.stat.size,
      hash: sha1(content),
      __content: content,
    });
  });

  return _.sortBy(res, 'filepath');
};

var getDirSummary = function (base) {
  var res = [];

  base = base || '';

  walk.walkSync(base, function (subdir, filename, stats) {
    // Skip directories and hidden files
    if (stats.isDirectory() || filename.charAt(0) === '.') {
      return;
    }

    var filepath = path.join(subdir || '', filename);
    var relpath = path.relative(base, filepath);
    var content = fs.readFileSync(filepath).toString();

    res.push({
      filepath: relpath,
      size: stats.size,
      hash: sha1(content),
      __content: content,
    });
  });

  return _.sortBy(res, 'filepath');
};

var readFile = function (relpath, options) {
  options = options || {};

  var cwd = options.cwd && path.join(process.cwd(), options.cwd) || process.cwd();
  var base = options.base || cwd;
  var filepath = path.join(cwd, relpath);
  var stat = fs.statSync(filepath);

  return new File({
    cwd: cwd,
    base: base,
    path: filepath,
    contents: fs.readFileSync(filepath),
    stat: stat,
  });
};
