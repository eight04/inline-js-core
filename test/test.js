/* eslint-env mocha */

const assert = require("assert");
const sinon = require("sinon");

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
});

describe("functional", () => {
  const {createInliner} = require("..");
  
  function mustFail() {
    throw new Error("Must fail");
  }
  
	it("maxDepth", () => {
    const inliner = createInliner();
    inliner.resource.add({
      name: "file",
      read: () => "$inline('foo')"
    });
    const target = {
      name: "file",
      args: ["foo"]
    };
    return inliner.inline(target)
      .then(mustFail)
      .catch(err => {
        assert(err.message.includes("Max recursion depth 10"));
      });
	});
	
	it("shortcut + transform", () => {
    const inliner = createInliner();
    const resource = {
      name: "file",
      read: sinon.spy((source, target) => {
        if (target.args[0] == "foo") {
          return `$inline.shortcut('foo', 'bar|t:$1')
$inline('foo:baz')`;
        }
        if (target.args[0] == "bar") {
          return "OK";
        }
        throw new Error(`unknown args: ${target.args}`);
      })
    };
    inliner.resource.add(resource);
    const transform = {
      name: "t",
      transform: sinon.spy((target, content, arg) => {
        return content + arg;
      })
    };
    inliner.transformer.add(transform);
    const target = {
      name: "file",
      args: ["foo"]
    };
    return inliner.inline(target)
      .then(({content}) => {
        assert.equal(content, `$inline.shortcut('foo', 'bar|t:$1')
OKbaz`);
      });
	});
  
  it("buffer", () => {
    const inliner = createInliner();
    const files = {
      a: "a",
      b: Buffer.from("b"),
      c: "$inline('file:a')$inline('file:b')"
    };
    const resource = {
      name: "file",
      read: (source, target) => {
        return files[target.args[0]];
      }
    };
    inliner.resource.add(resource);
    const target = {
      name: "file",
      args: ["c"]
    };
    return inliner.inline(target)
      .then(({content}) => {
        assert(Buffer.isBuffer(content));
        assert.equal(content.toString(), "ab");
      });
  });
});
