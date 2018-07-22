/* eslint-env mocha */

const assert = require("assert");
const sinon = require("sinon");

function mustFail() {
  throw new Error("Must fail");
}

describe("parser", () => {
  describe("parsePipes, pipesToString", () => {
    const {parsePipes, pipesToString} = require("../lib/parser");
    const cases = [
      ["basic", "test:123", [{name: "test", args: ["123"]}]],
      ["no value", "a", [{name: "a", args: []}]],
      ["multiple values", "a:b,c", [{name: "a", args: ["b", "c"]}]],
      ["escape characters", "a\\:b:a\\,b", [{name: "a:b", args: ["a,b"]}]],
      ["pipes", "a:1|b:2", [{name: "a", args: [1]}, {name: "b", args: [2]}]]
    ];
    
    for (const [title, input, output] of cases) {
      it(title, () => {
        assert.deepEqual(parsePipes(input), output);
        assert.equal(pipesToString(output), input);
      });
    }
  });
  
  describe("parseDirective", () => {
    const {parseDirective} = require("../lib/parser");
    
    it("shortcut", () => {
      const result = parseDirective("$inline.shortcut('a', 'b')");
      assert.equal(result.type, "$inline.shortcut");
      assert.deepEqual(result.params, ["a", "b"]);
    });
  });

  describe("parseText", () => {
    const {parseText, ParseError} = require("../lib/parser");
    
    it("$inline", () => {
      const [result] = parseText("$inline('path/to/file')");
      assert.equal(result.type, "$inline");
      assert.deepEqual(result.params, ["path/to/file"]);
    });
    
    it("$inline and skipChars", () => {
      const [result] = parseText("/* $inline('foo', 3, 3) */");
      assert.deepEqual(result, {
        start: 0,
        end: 26,
        type: "$inline",
        params: ["foo", 3, 3]
      });
    });
    
    it("backtick", () => {
      const [result] = parseText("$inline(`path/to/file`)");
      assert.equal(result.type, "$inline");
      assert.deepEqual(result.params, ["path/to/file"]);
    });
    
    it("double quote", () => {
      const [result] = parseText("$inline(\"path/to/file\")");
      assert.equal(result.type, "$inline");
      assert.deepEqual(result.params, ["path/to/file"]);
    });
    
    it("start and end", () => {
      const [left, result, right] = parseText("$inline.start('./a.txt')\ntest\n$inline.end");
      assert.equal(left.type, "text");
      assert.equal(left.value, "$inline.start('./a.txt')\n");
      
      assert.equal(result.type, "$inline.start");
      assert.deepEqual(result.params, ["./a.txt"]);
      
      assert.equal(right.type, "text");
      assert.equal(right.value, "\n$inline.end");
    });
    
    it("line", () => {
      const [left, result, right] = parseText("test\ntest$inline.line('path/to/file')test\ntest");
      assert.equal(left.type, "text");
      assert.equal(left.value, "test\n");
      
      assert.equal(result.type, "$inline.line");
      assert.deepEqual(result.params, ["path/to/file"]);
      
      assert.equal(right.type, "text");
      assert.equal(right.value, "\ntest");
    });
    
    it("line preserve indent", () => {
      const [left, result, right] = parseText("  test\n  // $inline.line('foo') test\n  test");
      assert.deepEqual(left, {
        type: "text",
        value: "  test\n  "
      });
      assert.deepEqual(result, {
        type: "$inline.line",
        start: 9,
        end: 36,
        params: ["foo"]
      });
      assert.deepEqual(right, {
        type: "text",
        value: "\n  test"
      });
    });
    
    it("first line", () => {
      const [result, right] = parseText("test$inline.line('path/to/file')test\ntest");
      assert.equal(result.type, "$inline.line");
      assert.deepEqual(result.params, ["path/to/file"]);
      
      assert.equal(right.type, "text");
      assert.equal(right.value, "\ntest");
    });
    
    it("shortcut", () => {
      const content = "$inline.shortcut('test', 'file|t1:$2,$1')";
      const [result, text] = parseText(content);
      assert.equal(result.type, "$inline.shortcut");
      assert.deepEqual(result.params, ["test", "file|t1:$2,$1"]);
      
      assert.equal(text.type, "text");
      assert.equal(text.value, content);
    });
    
    it("start, end", () => {
      const content = `$inline.start("foo")
$inline("bar")
$inline.end`;
      const [left, result, right] = parseText(content);
      assert.deepEqual(left, {
        type: "text",
        value: '$inline.start("foo")\n'
      });
      assert.deepEqual(result, {
        type: "$inline.start",
        params: ["foo"],
        start: 21,
        end: 35
      });
      assert.deepEqual(right, {
        type: "text",
        value: '\n$inline.end'
      });
    });
    
    it("require one line", () => {
      const content = "$inline.start('foo')\n$inline.end";
      assert.throws(() => parseText(content), ParseError);
    });
    
    it("missing end", () => {
      const content = "$inline.start('foo')";
      assert.throws(() => parseText(content), ParseError);
    });
    
    it("skipStart, skipEnd", () => {
      const content = `$inline.skipStart
$inline('foo')
$inline(bar) // ignore invalid $inline
$inline.skipEnd`;
      const [result] = parseText(content);
      assert.equal(result.value, content);
    });
    
    it("open, close", () => {
      const content = "<!--$inline.open('foo', 3)-->hello<!--$inline.close(4)-->";
      const [left, result, right] = parseText(content);
      
      assert.equal(left.value, "<!--$inline.open('foo', 3)-->");
      assert.deepEqual(result.params, ["foo", 3]);
      assert.equal(right.value, "<!--$inline.close(4)-->");
    });
    
    it("ignore inline insied open/close", () => {
      const content = "<!--$inline.open('foo', 3)-->$inline('bar')<!--$inline.close(4)-->";
      assert.equal(parseText(content).length, 3);
    });
    
    it("missing close", () => {
      const content = "<!--$inline.open('foo', 3)-->$inline('bar')";
      assert.throws(() => parseText(content), ParseError);
    });
    
    it("default offset is 0", () => {
      const content = "<!--$inline.open('foo')-->$inline('bar')<!--$inline.close-->";
      const [left,, right] = parseText(content);
      assert.equal(left.value, "<!--$inline.open('foo')");
      assert.equal(right.value, "$inline.close-->");
    });
    
    it("invalid function", () => {
      const cases = [
        "$inline.?('foo')",
        "$inline.line('foo',,)",
        "$inline.line('foo'",
        "$inline.line(/foo/)",
        "$inline.line('foo",
        "$inline.foo('foo')"
      ];
      
      for (const content of cases) {
        assert.throws(() => {
          parseText(content);
        }, ParseError);
      }
    });
  });
});

describe("shortcut", () => {
  const {createShortcutExpander} = require("../lib/shortcut");
  const {parsePipes} = require("../lib/parser");
  
  function prepare(name, expand) {
    const shortcuts = createShortcutExpander();
    shortcuts.add({name, expand});
    return exp => {
      const pipes = parsePipes(exp);
      return shortcuts.expand(null, pipes);
    };
  }
  
  it("add, remove", () => {
    const shortcuts = createShortcutExpander();
    shortcuts.add({name: "foo", expand: "bar"});
    assert.equal(shortcuts.expand(null, parsePipes("foo")), "bar");
    shortcuts.remove("foo");
    assert.throws(() => shortcuts.expand(null, parsePipes("foo")), Error);
  });
  
  it("clone, lookup", () => {
    const shortcuts = createShortcutExpander();
    shortcuts.add({name: "foo", expand: "bar"});
    const shortcuts2 = shortcuts.clone();
    assert.equal(shortcuts2.expand(null, parsePipes("foo")), "bar");
  });
  
  it("invalid expander", () => {
    const shortcuts = createShortcutExpander();
    assert.throws(() => shortcuts.add({name: "foo", expand: /bar/}));
  });
	
	it("basic", () => {
		const expand = prepare("test", "a.txt|tr:$1");
		assert.equal(expand("test:abc"), "a.txt|tr:abc");
	});
	
	it("multiple arguments", () => {
		const expand = prepare("test", "a.txt|tr:$1|tr2:$2");
		assert.equal(expand("test:abc,123"), "a.txt|tr:abc|tr2:123");
	});
	
	it("$&", () => {
		const expand = prepare("test", "a.txt|tr:$&");
		assert.equal(expand("test:abc,123"), "a.txt|tr:abc,123");
	});
	
	it("additional pipes", () => {
		const expand = prepare("test", "a.txt|tr");
		assert.equal(expand("test|tr2|tr3"), "a.txt|tr|tr2|tr3");
	});
  
  it("use function", () => {
    const expand = prepare("test", (source, a, b) => `a.txt|${a}|${b}`);
    assert.equal(expand("test:123,456"), "a.txt|123|456");
  });
});

describe("resource", () => {
  const {createResourceLoader} = require("../lib/resource");
  
  it("basic", () => {
    const resource = createResourceLoader();
    resource.add({name: "foo", read: () => "foo"});
    return resource.read(null, {name: "foo", args: []})
      .then(content => {
        assert.equal(content, "foo");
        resource.remove("foo");
        assert.throws(() => resource.read(null, {name: "foo", args: []}), Error);
      });
  });
  
  it("hash and cache", () => {
    const resource = createResourceLoader();
    const reader = {
      name: "foo",
      hash: (source, target) => {
        return JSON.stringify([target.type, ...target.args]);
      },
      read: sinon.spy(() => {
        return "foo";
      })
    };
    resource.add(reader);
    const target = {
      name: "foo",
      args: ["bar"]
    };
    return Promise.all([
      resource.read(null, target),
      resource.read(null, target)
    ])
      .then(() => {
        assert(reader.read.calledOnce);
      });
  });
  
  it("resolve", () => {
    const resource = createResourceLoader();
    const reader = {
      name: "foo",
      resolve: (source, target) => {
        target.args[0] = source.args[0] + "/" + target.args[0];
      }
    };
    resource.add(reader);
    const source = {
      name: "bar",
      args: ["bar"]
    };
    const target = {
      name: "foo",
      args: ["foo"]
    };
    resource.resolve(source, target);
    assert.equal(target.args[0], "bar/foo");
    assert.throws(() => resource.resolve(target, source), Error);
  });
});

describe("functional", () => {
  const {createInliner} = require("..");
  
  function prepare(baseOptions) {
    return options => {
      options = Object.assign(baseOptions, options);
      const inliner = createInliner();
      const read = (source, target) => {
        assert(target.args[0] in options.files);
        return options.files[target.args[0]];
      };
      inliner.resource.add({
        name: "file",
        read,
        resolve(a, b) {
          if (!a) {
            return;
          }
          b.args[0] = [
            ...a.args[0].split("/").slice(0, -1),
            ...b.args[0].split("/")
          ].join("/");
        }
      });
      if (options.transforms) {
        for (const [name, transform] of Object.entries(options.transforms)) {
          inliner.transformer.add({name, transform});
        }
      }
      return inliner.inline({name: "file", args: ["a"]}, options.source);
    };
  }
  
	it("maxDepth", () => {
    const test = prepare({
      files: {
        a: "$inline('a')"
      }
    });
    return test()
      .then(mustFail)
      .catch(err => {
        assert(err.message.includes("Max recursion depth 10"));
      });
	});
	
	it("shortcut + transform", () => {
    const test = prepare({
      files: {
        a: `$inline.shortcut('foo', 'b|t:$1')
$inline('foo:baz')`,
        b: "OK"
      },
      transforms: {
        t: (target, content, arg) => {
          return content + arg;
        }
      }
    });
    return test()
      .then(({content}) => {
        assert.equal(content, `$inline.shortcut('foo', 'b|t:$1')
OKbaz`);
      });
	});
  
  it("buffer", () => {
    const test = prepare({
      files: {
        a: "$inline('b')$inline('c')",
        b: "a",
        c: Buffer.from("b")
      }
    });
    return test()
      .then(({content}) => {
        assert(Buffer.isBuffer(content));
        assert.equal(content.toString(), "ab");
      });
  });
  
  it("transform context", () => {
    const test = prepare({
      files: {
        a: "a$inline('b|foo')b",
        b: "b"
      },
      transforms: {
        foo: (context, content) => {
          assert.equal(context.inlineDirective.start, 1);
          assert.equal(context.inlineDirective.end, 17);
          assert.equal(context.sourceContent, "a$inline('b|foo')b");
          return content + "foo";
        }
      }
    });
    return test()
      .then(({content}) => {
        assert.equal(content, "abfoob");
      });
  });
  
  it("dependency", () => {
    const test = prepare({
      files: {
        a: "$inline('b')",
        b: "$inline('c')",
        c: "foo"
      },
    });
    return test()
      .then(({content, children}) => {
        assert.equal(content, "foo");
        assert.deepEqual(children, [
          {
            target: {
              name: "file",
              args: ["b"]
            },
            content: "foo",
            children: [
              {
                target: {
                  name: "file",
                  args: ["c"]
                },
                content: "foo",
                children: []
              }
            ]
          }
        ]);
      });
  });
  
  it("source", () => {
    const test = prepare({
      files: {
        "a": "foo",
        "b/a": "bar"
      },
      source: {name: "file", args: ["b/c"]}
    });
    return test()
      .then(({content}) => {
        assert.equal(content, "bar");
      });
  });
});

describe("transform", () => {
  const {createTransformer} = require("../lib/transformer");
  
  it("add, remove", () => {
    const transformer = createTransformer();
    transformer.add({
      name: "foo",
      transform: (target, content) => content + "foo"
    });
    const transforms = [{name: "foo", args: []}];
    return transformer.transform(null, "content", transforms)
      .then(content => {
        assert.equal(content, "contentfoo");
        transformer.remove("foo");
        return transformer.transform(null, "content", transforms)
          .then(mustFail)
          .catch(err => {
            assert(err.message.includes("Unknown transformer"));
          });
      });
  });
});

describe("inliner", () => {
  const {createInliner} = require("..");
  it("useConfig", () => {
    const options = {
      resource: {
        add: sinon.spy()
      },
      transformer: {
        add: sinon.spy()
      },
      globalShortcuts: {
        add: sinon.spy()
      }
    };
    const inliner = createInliner(options);
    inliner.useConfig();
    inliner.useConfig({});
    inliner.useConfig({
      resources: [{name: "foo"}, {name: "bar"}],
      transforms: [{name: "bak"}, {name: "boo"}, {name: "bos"}],
      shortcuts: [{name: "baz"}]
    });
    assert.equal(options.resource.add.callCount, 2);
    assert.equal(options.transformer.add.callCount, 3);
    assert.equal(options.globalShortcuts.add.callCount, 1);
  });
});
