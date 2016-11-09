# gulp-htmlcpr [![NPM version](https://badge.fury.io/js/gulp-htmlcpr.png)](http://badge.fury.io/js/gulp-htmlcpr) [![Build Status](https://travis-ci.org/PlanitarInc/gulp-htmlcpr.svg?branch=master)](https://travis-ci.org/PlanitarInc/gulp-htmlcpr)

gulp-htmlcpr is a [Gulp](https://github.com/gulpjs/gulp) plugin that
copies HTML files with all the local assets (images, scripts, style files, etc.)
that it needs.
[Gulp is a streaming build system](https://github.com/gulpjs/gulp) utilizing
[node.js](http://nodejs.org/).

## Install

```javascript
npm install --save-dev gulp-htmlcpr
```

## Usage

```js
var htmlcpr = require('gulp-htmlcpr');

gulp.src('./src/index.html')
  .pipe(htmlcpr())
  .pipe(gulp.dest('./dist/'))
```

## API

### htmlcpr(options)

#### options.noRec

Type: `string`

Default value: `''`

Files in the `noRec` directory will be copied, but the links in these files
won't be followed.

#### options.blacklistFn

Type: `function (url: string, filepath: string): bool`

Default value: `null`

The function is called for every URL detected by the plugin.
First parameter `url` is the detected URL and the second parameter `src`
is the path of the currently processed file.

If the function returns truthy value the link is replaced with `''`
and the file referenced by the link is not copied to the destination dir.

#### options.skipFn

Type: `function (url: string, filepath: string): bool`

Default value: `null`

The function is called for every URL detected by the plugin.
First parameter `url` is the detected URL and the second parameter `src`
is the path of the currently processed file.

If the function returns truthy value, the link will be skipped. This runs
prior to `blacklistFn`, so in the case of a url being matched by both, it will
still be skipped.


#### options.schemelessUrlFix

Type: `string|function (url: string, src: string): bool`

Default value: `null`

The function is called when a schemeless url is detected
(e.g.  `//cdn.superfast.com/myself.png`). If the value of the option is a
string, that string is considered to be the protocol and is appended to the URL.
If the value is the function, that function is being called and the URL is
replaced with its return value.

#### options.overwritePath

Type: `function (filePathFromBase: string): string`

Default value: `undefined`

The function is used to move some files to new location. For example, if
all HTML page assets have to moved to a single sub-directory `assets/`,
then `overwritePath` should be defined as follows:

```js
  var path = require('path');
  ...
  overwritePath: function (src) {
    return path.join('assets', src);
  }
  ...
```

The emitted files will have the updated path, and the links to these files
will be updated as well.

### Usage Examples

#### Basic Use Case

Let's say you have a directory with the following structure:

```
├── app
│   ├── index.html
│   ├── css
│   │   ├── ... CSS files ...
│   │   └──
│   ├── images
│   │   ├── ... images ...
│   │   └──
│   ├── js
│   │   ├── ... javascript ...
│   │   └──
│   ├── fonts
│   │   ├── ... fonts ...
│   │   └──
│   └── vendor
│       ├── ... vendor files ...
│       └──
└── build
```

You want to copy `index.html` and any local files required by this file (images,
scripts, etc.). You need to copy only the files required by `index.html` and no
more.

`htmlcpr` comes to the rescue!

The following configuration would do exactly what you want:

```js
gulp.src(['index.html', 'fonts/**'])
  .pipe(htmlcpr({
    norecDir: 'vendor',
  })
  .pipe(gulp.dest('build'))
```

If the only files included from `index.html` are `css/main.css`,
`js/main.js` and `vendor/fancy.css`;
in thier turns,`css/main.css` turn includes `images/logo.png`
and `vendor/fancy.css` includes `vendor/fancy-spinner.png`.
Then the contents of `build` directory after an execution of `grun htmlcpr` would be:


```sh
└── build
    ├── index.html
    ├── css
    │   └── main.css          # included by index.html
    ├── images
    │   └── logo.png          # included by main.css
    ├── js
    │   └── main.js           # included by index.html
    ├── fonts
    │   ├── ... all fonts ... # the fonts are explicitly specified
    │   ├── ... from app/ ... # in task object, hence they were
    │   └── ...    dir    ... # copied as is.
    └── vendor
        └── fancy.css
```

NOTE: since `vendor` was set as `norecDir`, any links in the `vendor/fancy.css`
file were not followed and hence `vendor/fancy-spinner.png` was not copied.
