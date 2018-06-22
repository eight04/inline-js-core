inline-js-core
==============

[![Build Status](https://travis-ci.org/eight04/inline-js-core.svg?branch=master)](https://travis-ci.org/eight04/inline-js-core)
[![Coverage Status](https://coveralls.io/repos/github/eight04/inline-js-core/badge.svg?branch=master)](https://coveralls.io/github/eight04/inline-js-core?branch=master)
[![install size](https://packagephobia.now.sh/badge?p=inline-js-core)](https://packagephobia.now.sh/result?p=inline-js-core)

The core part of inline-js. Create an inliner with multiple resource loaders, transformers, and shortcuts.

Installation
------------
```
npm install inline-js-core
```

API reference
-------------

This module exports following members:

* `createInliner`: Create an inliner.

### createInliner(options?): Inliner object

`options` has following optional properties:

* `maxDepth`: The max recursion depth. Default: `10`.

### Inliner

Inliner object has following properties:

#### resource: object

A collection of resource loaders. It has following method:

* `add(resourceLoader: ResourceLoader)`: Add a new resource loader.
* `remove(name: string)`: Remove a resource loader whose name is `name`.
* `read(from: ResourceSpecifier|null, target: ResourceSpecifier)`: Read the content of a resource. `from` is the file that is currently parsed. `target` is the file that should be read.

#### transformer: object

* `add(transformer: Transformer)`: Add a new transformer.
* `remove(name: string)`: Remove the transformer whose name is `name`.
* `transform(context: TransformContext, content: string|Buffer, transforms: Array<TransformSpecifier>)`: Transform a file through an array of transformers.

#### globalShortcuts: object

* `add(shortcut: ShortcutExpander)`: Add a new shortcut.
* `remove(name: string)`: Remove the shortcut whose name is `name`.
* `expand(target: ResourceSpecifier, expando: [Pipe, ...TransformSpecifier])`: Expand the shortcut.

#### async inline(target: ResourceSpecifier): InlineResult

Recursively parse and inline the directives of target. InlineResult has following properties:

* `content`: The output content.
* `dependency`: Object. A dependency map. The key is the first argument of ResourceSpecifier i.e. `target.args[0]`.

### ResourceLoader

A resource loader accept a ResourceSpecifier and return the content of the resource. It has following properties:

* `name`: The name of the resource loader.
* `async read(from: ResourceSpecifier, target: ResourceSpecifier): string|Buffer`: Read the content from `target`.
* `resolve(from: ResourceSpecifier|null, target: ResourceSpecifier)`: A hook that is used to resolve `target` to an absolute path. If `from` is null (`target` is the entry) then resolve with current dir.

### ShortcutExpander

* `name`: The name of the shortcut.
* `expand`: function or string. Convert a resource specifier into another resource specifier. For example, this expander

  ```js
  {
    name: "foo",
    expand: "foobar|t1:$1|t2:$2"
  }
  ```
  
  would convert
  
  ```
  foo:a,b
  ```
  
  into
  
  ```
  foobar|t1:a|t2:b
  ```
  
  If `expand` is a function, the signature is `expand(target: ResourceSpecifier, ...args)`. `args` is the argument of the original resource (`['a', 'b']` in the above example).

### Transformer

* `name`: The name of the transformer.
* `async transform(context: TransformContext, content: string|Buffer, ...args)`: `args` is the argument of TransformSpecifier. The return value should be transformed content.

### TransformContext: object

* `inlineTarget`: `ResourceSpecifier`. The target file that the transformer is proccessing on.
* `inlineDirective`: An object describing an inline directive. It has following properties:

  - `type`: `string`. Could be `$inline`, `line`, `start`, or `open`.
  - `params`: `Array`. Arguments of the inline function.
  - `start`: `number`. The start position of the replace range.
  - `end`: `number`. The end position of the replace range.
  
* `source`: ResourceSpecifier. The file containing the inline directive.
* `sourceContent`: The content of `source`.

### Pipe

This library is built with pipe syntax. A Pipe object is just an object having `name` and `args` properties. For example:

```
foo:bar|baz:bak
```

Would be parsed into a list of pipes:

```js
[
  {name: "foo", args: ["bar"]},
  {name: "baz", args: ["bak"]}
]
```

### ResourceSpecifier

A pipe object. `name` is the resource name and `args` is usually the path to the file.

### TransformSpecifier

A pipe object. `name` is the transformer name and `args` is the arguments that would be passed into the transformer.

Changelog
---------

* 0.3.1 (May 23, 2018)

  - Fix: sub-dependency is broken.

* 0.3.0 (May 23, 2018)

  - Add: export `getLineRange`, `getWhitespace` utils in `./lib/parser`.
  - Add: The signature of `$inline` is expanded to `$inline(resource, startOffset = 0, endOffset = 0)`. Use `startOffset`, `endOffset` to extend replace range.
  - **Change: $inline.line now preserves indents.**

* 0.2.0 (May 23, 2018)

  - **Change: the first argument of `Transformer.transform` is changed to a `TransformContext` object.** This should help implement "endent" transformer.

* 0.1.1 (May 21, 2018)

  - Fix: ignore parseDirective error when it is wrapped with other tags.

* 0.1.0 (May 21, 2018)

    - Pull out core from inline-js.
