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

API
----

This module exports following members:

* `createInliner`: Create an inliner.

### createInliner

```js
const inliner = createInliner({
  maxDepth?: Number
});
```

`maxDepth` - the max recursion depth. Default: `10`.

### inliner.inline

```js
const inlineResult = await inliner.inline({
  target: {
    name: String,
    args: Array
  },
  source?: Object,
  content?: String|Buffer
});
```

Read the resource from `target` and process $inline directives recursively.

`target` is a resource specifier. A simple file could be represented as:

```js
{
  name: "file",
  args: ["D:\myfile.txt"]
}
```

`source` is also a resource specifier like `target`. It is only used to resolve relative path to absolute path:

```js
const source = {
  name: "file",
  args: ["D:\foo.txt"]
};
const target = {
  name: "file",
  args: ["bar.txt"]
};
inliner.resource.resolve(source, target);
console.log(target);
/*
{
  name: "file",
  args: ["D:\bar.txt"]
}
*/
```

`inlineResult` has following properties:

* `content: Buffer|String` - the output content.
* `target: Object` - the target resource that is processed.
* `children: [...inlineResult: Object]` - `inlineResult`s of child dependencies (i.e. files being inlined by `target`).

### inliner.useConfig

```js
inliner.useConfig({
  resources?: Array,
  transforms?: Array,
  shortcuts?: Array
});
```

A utility function to add resources, shortcuts, and transforms from a config object. If the argument is falsy, this function has no effect.

### inliner.resource.add

```js
inliner.resource.add({
  name: String,
  read: async (source: Object, target: Object) => String|Buffer,
  resolve?: (source: Object, target: Object) => null,
  hash?: (source: Object, target: Object) => String
});
```

Add a resource loader.

`name` is the name of the resource loader.

`read` should return the content of `target` file. `source` is the parent file that inlines `target`.

If `resolve` is defined, inliner would call this function before `read`.

`hash` should convert a `(source, target)` pair into a unique string that inliner would use it to cache the content. If `hash` is undefined then the content is never cached.

### inliner.resource.remove

```js
inliner.resource.remove(name: String);
```

Remove a resource loader that the name is `name`.

### inliner.resource.read

```js
const content = await inliner.resource.read(source: Object, target: Object);
```

Find the resource loader matching `target.name` then call the `read` function of the resource loader. Inliner would try caching the result after `read`.

### inliner.resource.cache

A `Map` object containing `hash: String`/`pendingContent: Promise<content>` pairs.

### inliner.transformer.add

```js
inliner.transformer.add({
  name: String,
  transform: async (context: Object, content: String|Buffer, ...args) => outputContent: String|Buffer
});
```

`name` is the name of the transformer.

`transform` function is used to transform `content`.

`context` object provides some additional information about the source resource. It has following properties:

* `inlineTarget: Object` - the target resource. The file that is being inlined and transformed.
* `inlineDirective` - an object that represents an inline directive. It has following properties:

  - `type: String` - could be `$inline`, `line`, `start`, or `open`.
  - `params: Array<String>` - arguments of the inline function.
  - `start: Number` - the start index of the replace range.
  - `end: Number` - the end index of the replace range.
  
* `source: Object` - the source resource. The file containing the inline directive.
* `sourceContent: String` - the content of `source`.

Other `args` is specified by the $inline directive. For example:

```js
$inline("myfile|transformA:foo,bar")
```

In this case, `args` would be `["foo", "bar"]`.

### inliner.transformer.remove

```js
inliner.transformer.remove(name: String)
```

Remove the transformer.

### inliner.transformer.transform

```js
const outputContent = await inliner.transformer.transform(
  context: Object,
  content: String|Buffer,
  transforms: Array<Object>
);
```

Transform `content` through a list of `transforms`.

### inliner.globalShortcuts.add

```js
inliner.globalShortcuts.add({
  name: String,
  expand: String|Function
})
```

Add a global shortcut expander.

`name` is the name of the shortcut.

`expand` is a pattern that would expand the original string. For example, with the following expander:

```js
{
  name: "foo",
  expand: "foobar|t1:$1|t2:$2"
}
```

It can expand `foo:a,b` into `foobar|t1:a|t2:b`. `$n` (`n=1...9`) would be replaced with the parameter at specified index. `$&` would be replaced with all parameters.

`expand` can also be a function:

```
expand: (target: Object, ...args) => expandPattern: String
```

`target` is the resource that is being processed.

`args` are parameters of the shortcut.

### inliner.globalShortcuts.remove

```js
inliner.globalShortcuts.remove(name: String)
```

Remove a global shortcut expander.

### inliner.globalShortcuts.expand

```js
const outputString = inliner.globalShortcuts.expand(target: Object, pipes: [shortcut, ...otherPipes])
```

Find the expander matching `shortcut.name`, expand `shortcut`, concat the result with `otherPipes`, then return the final string.

Changelog
---------

* 0.4.1 (Jul 22, 2018)

  - Add: `Inliner.useConfig` utility function.

* 0.4.0 (Jun 23, 2018)

  - Add: `from` parameter of `Inliner.inline`.
  - Add: `InlineResult.target`, `InlineResult.children` to get detailed information about inlined files.
  - **Drop: `InlineResult.dependency`.**

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
